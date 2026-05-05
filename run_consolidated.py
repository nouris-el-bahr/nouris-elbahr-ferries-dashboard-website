"""
Standalone runner for the consolidated invoice pipeline.

Usage (interactive):
    python run_consolidated.py

Usage (CLI arguments):
    python run_consolidated.py \
        --ref-folder   "path/to/ref/folder" \
        --invoice-file "path/to/invoice.csv" \
        --sales-folder "path/to/sales/folder" \
        --ref-date     2026-04-01 \
        --fact-date    2026-04-30 \
        --period-start 2026-04-01 \
        --period-end   2026-04-30

Optional:
    --ref-format       Csv|Xlsx        (default: Csv)
    --sales-format     Csv|Xlsx        (default: Csv)
    --sales-date       YYYY-MM-DD      (default: same as --fact-date)
    --vat-suffix       ". Vat"         (default: ". Vat")
    --mode             short|detailed  (default: short)
    --only-checked-in                  (flag, default: off)
"""

import argparse
import sys
import tempfile
import shutil
from pathlib import Path

# ── Ensure project root is on the path ────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import payment_report, sales_report, consolidated_invoice
from backend.payment_report import ref_archive_name
from backend.sales_report import ReportConfig


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{prompt}{suffix}: ").strip()
    return value if value else default


def main():
    parser = argparse.ArgumentParser(description="Run consolidated invoice pipeline")
    parser.add_argument("--ref-folder",       help="Reference payment folder path")
    parser.add_argument("--invoice-file",      help="Invoice file path (CSV or Excel)")
    parser.add_argument("--sales-folder",      help="Raw sales folder path")
    parser.add_argument("--ref-date",          help="Reference date (YYYY-MM-DD)")
    parser.add_argument("--fact-date",         help="Invoice download date (YYYY-MM-DD)")
    parser.add_argument("--period-start",      help="Period start date (YYYY-MM-DD)")
    parser.add_argument("--period-end",        help="Period end date (YYYY-MM-DD)")
    parser.add_argument("--ref-format",        default="Csv", choices=["Csv", "Xlsx"])
    parser.add_argument("--sales-format",      default="Csv", choices=["Csv", "Xlsx"])
    parser.add_argument("--sales-date",        help="Sales download date (default: fact-date)")
    parser.add_argument("--vat-suffix",        default=". Vat")
    parser.add_argument("--mode",              default="short", choices=["short", "detailed"])
    parser.add_argument("--only-checked-in",   action="store_true")
    args = parser.parse_args()

    print("\n── Consolidated Invoice Runner ──────────────────────────────────────────\n")

    # ── Collect inputs (CLI or interactive) ───────────────────────────────────
    ref_folder   = args.ref_folder   or ask("Reference folder path")
    invoice_file = args.invoice_file or ask("Invoice file path (CSV or Excel)")
    sales_folder = args.sales_folder or ask("Sales folder path")
    ref_date     = args.ref_date     or ask("Reference date (YYYY-MM-DD)")
    fact_date    = args.fact_date    or ask("Invoice download date (YYYY-MM-DD)")
    period_start = args.period_start or ask("Period start (YYYY-MM-DD)")
    period_end   = args.period_end   or ask("Period end   (YYYY-MM-DD)")

    ref_format   = args.ref_format
    sales_format = args.sales_format
    sales_date   = args.sales_date or fact_date
    vat_suffix   = args.vat_suffix
    mode         = args.mode
    only_checked_in = args.only_checked_in

    # ── Validate paths ────────────────────────────────────────────────────────
    ref_folder_path   = Path(ref_folder)
    invoice_file_path = Path(invoice_file)
    sales_folder_path = Path(sales_folder)

    errors = []
    if not ref_folder_path.is_dir():
        errors.append(f"  Reference folder not found: {ref_folder_path}")
    if not invoice_file_path.is_file():
        errors.append(f"  Invoice file not found:     {invoice_file_path}")
    if not sales_folder_path.is_dir():
        errors.append(f"  Sales folder not found:     {sales_folder_path}")
    if errors:
        print("\nErrors:")
        for e in errors:
            print(e)
        sys.exit(1)

    print(f"\n  Ref folder   : {ref_folder_path}")
    print(f"  Invoice file : {invoice_file_path}")
    print(f"  Sales folder : {sales_folder_path}")
    print(f"  Ref date     : {ref_date}")
    print(f"  Fact date    : {fact_date}  |  Period: {period_start} → {period_end}")
    print(f"  Ref format   : {ref_format}  |  Sales format: {sales_format}")
    print(f"  Mode         : {mode}  |  VAT suffix: '{vat_suffix}'  |  Only checked-in: {only_checked_in}")
    print()

    tmp_csv_dir = None
    try:
        # ── Step 1: Build reference snapshot ─────────────────────────────────
        print("Step 1/3 — Loading reference files…")
        df_ref    = payment_report.load_reference_from_folder(str(ref_folder_path), ref_format)
        snap_name = ref_archive_name(ref_date, df_ref)
        print(f"          Snapshot name: {snap_name}")
        print(f"          Rows loaded:   {len(df_ref)}")

        tmp_csv_dir = Path(tempfile.mkdtemp())
        tmp_csv     = tmp_csv_dir / f"{snap_name}.csv"
        df_ref.to_csv(str(tmp_csv), sep=";", index=False)

        # ── Step 2: Run sales report ──────────────────────────────────────────
        print("\nStep 2/3 — Running sales report…")
        cfg = ReportConfig(
            sales_folder    = str(sales_folder_path),
            download_date   = sales_date,
            vat_suffix      = vat_suffix,
            format          = sales_format,
            mode            = mode,
            only_checked_in = only_checked_in,
        )
        sales_outputs = sales_report.run(cfg)
        sales_invoice_path = next(
            (p for p in sales_outputs if "SalesInvoice" in Path(p).name), ""
        )
        if sales_invoice_path:
            print(f"          SalesInvoice → {Path(sales_invoice_path).name}")
        else:
            print("          Warning: no SalesInvoice.xlsx found in sales output — continuing without it")

        # ── Step 3: Run consolidated invoice ─────────────────────────────────
        print("\nStep 3/3 — Running consolidated invoice…")
        outputs = consolidated_invoice.run(
            reff_csv_path      = str(tmp_csv),
            reff_snapshot_name = snap_name,
            fact_file_path     = str(invoice_file_path),
            fact_date          = fact_date,
            period_start       = period_start,
            period_end         = period_end,
            sales_invoice_path = sales_invoice_path,
        )

        # ── Done ──────────────────────────────────────────────────────────────
        print("\n── Output files ─────────────────────────────────────────────────────────\n")
        for p in outputs:
            print(f"  {p}")
        print()

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if tmp_csv_dir:
            shutil.rmtree(tmp_csv_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
