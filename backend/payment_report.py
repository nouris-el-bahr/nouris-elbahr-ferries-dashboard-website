import glob
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd
from tqdm import tqdm

from .common import (
    PAYMENT_RESULT_DIR,
    SALES_RESULT_DIR,
    PAYMENT_INVOICE_ARCHIVE_DIR,
    PAYMENT_REFERENCE_ARCHIVE_DIR,
    exchange_rates,
    generate_id,
    date_range_str,
    load_agencies,
    load_users,
)

# ── Module-level constants ────────────────────────────────────────────────────
COLUMN_NAMES = [
    "MoP Code", "Trans. Num.", "Payment Currency Amount", "Payment Currency",
    "Booking Currency Amount", "Booking Currency", "Exchange Rate", "Created",
    "Terminal", "User", "Agent Code", "Agent name", "Booking Code",
    "Booking Created", "Booking Status", "Is Preliminary", "Payment Type", "Notes",
]

POINTS        = ["Web", "Zaatcha", "Siege", "Port Alger", "Port Oran", "OPS", "NVM"]
CURRENCIES    = ["DZD", "EUR"]
PAYMENT_TYPES = ["SALE", "REFUND"]

INVOICE_COLUMNS = [
    "Code reservation", "A des notes", "Date creation", "Code agent", "Nom agent",
    "GSA agent", "Devise", "Statut reservation",
    "WEB",
    "Zaatcha DZD", "Zaatcha EUR", "Siege DZD", "Siege EUR",
    "Port Alger DZD", "Port Alger EUR", "Port Oran DZD", "Port Oran EUR",
    "OPS DZD", "OPS EUR", "NVM DZD", "NVM EUR",
    "WEB -",
    "Zaatcha DZD -", "Zaatcha EUR -", "Siege DZD -", "Siege EUR -",
    "Port Alger DZD -", "Port Alger EUR -", "Port Oran DZD -", "Port Oran EUR -",
    "OPS DZD -", "OPS EUR -", "NVM DZD -", "NVM EUR -",
]

# ── Naming helpers ────────────────────────────────────────────────────────────
def created_date_range(df: pd.DataFrame) -> str:
    """'YYYY-MM-DD~YYYY-MM-DD' from the Created column — thin wrapper over date_range_str."""
    return date_range_str(df, "Created")


def ref_archive_name(dl_date: str, df: pd.DataFrame) -> str:
    """Canonical stem for a reference snapshot CSV: {id}_dl{date}_cr{range}_ref"""
    return f"{generate_id()}_dl{dl_date}_cr{created_date_range(df)}_ref"


def inv_archive_name(dl_date: str, df: pd.DataFrame, suffix: str) -> str:
    """Canonical filename for an invoice archive: {id}_dl{date}_cr{range}_inv{ext}"""
    return f"{generate_id()}_dl{dl_date}_cr{created_date_range(df)}_inv{suffix.lower()}"


# ── File loaders ──────────────────────────────────────────────────────────────
def load_reference_from_folder(folder: str, fmt: str) -> pd.DataFrame:
    """Load and merge all CSV or Excel files from a folder into one DataFrame."""
    pattern = str(Path(folder) / f"*.{fmt.lower()}")
    files   = glob.glob(pattern)
    if not files:
        raise FileNotFoundError(f"No {fmt} files found in {folder!r}")
    if fmt.lower() in ("xlsx", "xls"):
        return pd.concat(
            [pd.read_excel(f) for f in tqdm(files, desc="Loading", unit="file")],
            ignore_index=True,
        )
    return pd.concat(
        [pd.read_csv(f, sep=";", low_memory=False) for f in tqdm(files, desc="Loading", unit="file")],
        ignore_index=True,
    )


def load_single_file(path: str) -> pd.DataFrame:
    """Load a single CSV or Excel file."""
    p = Path(path)
    if p.suffix.lower() == ".csv":
        return pd.read_csv(path, sep=";")
    return pd.read_excel(path)


# ── Stateless helpers ─────────────────────────────────────────────────────────
def update_reference_with_fact(df_reff: pd.DataFrame, df_fact: pd.DataFrame) -> pd.DataFrame:
    reff_agi = df_reff[df_reff["MoP Code"] == "AGI"]
    fact_agi = df_fact[df_fact["MoP Code"] == "AGI"]
    matching = set(reff_agi["Booking Code"]).intersection(set(fact_agi["Booking Code"]))

    df_reff_filtered = df_reff[~((df_reff["MoP Code"] == "AGI") & (df_reff["Booking Code"].isin(matching)))]
    df_fact_filtered = df_fact[~((df_fact["MoP Code"] == "AGI") & (df_fact["Booking Code"].isin(matching)))]

    updated = pd.concat([df_reff_filtered, df_fact], ignore_index=True)
    print(f"  Updated reference: replaced {len(matching)} AGI bookings, "
          f"added {len(df_fact_filtered)} rows, total {len(updated)}")
    return updated


def _archive_invoice_file(src_path: str, fact_date: str, df_raw: pd.DataFrame) -> tuple:
    """Copy the original invoice file into the Invoice archive with a canonical name.
    Returns (archived_path, inv_stem) where inv_stem is the unique ID-bearing filename stem.
    """
    PAYMENT_INVOICE_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    src  = Path(src_path)
    name = inv_archive_name(fact_date, df_raw, src.suffix)
    dest = PAYMENT_INVOICE_ARCHIVE_DIR / name
    shutil.copy2(src, dest)
    print(f"  Archived invoice:  {dest.name}")
    return dest, dest.stem


# ── Sales-balance enrichment ──────────────────────────────────────────────────
_SOLDE_COL       = "Solde restant du"
_SOLDE_INFO_COLS = ["Code reservation", "Date creation", "Code agent", "Nom agent",
                    "GSA agent", "Devise", "Statut reservation"]
_SOLDE_BOOL_COLS = ["Est en modification", "Est en modification AGI",
                    "A un remboursement", "A des notes"]


def _find_latest_sales_invoice() -> str:
    files = sorted(
        SALES_RESULT_DIR.glob("*_SalesInvoice.xlsx"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return str(files[0]) if files else ""


def _enrich_with_sales_balance(invoice_df: pd.DataFrame, sales_invoice_path: str = "") -> pd.DataFrame:
    """Merge 'Solde restant du' from SalesInvoice into the Facture by Code reservation.

    - Existing codes: fills the Solde restant du value.
    - New codes: appends a row with booking info copied and payment cols defaulted to 0.
    """
    if not sales_invoice_path or not Path(sales_invoice_path).is_file():
        sales_invoice_path = _find_latest_sales_invoice()
        if not sales_invoice_path:
            print("  [Solde restant du] No SalesInvoice found — skipping.")
            return invoice_df
        print(f"  [Solde restant du] Using: {Path(sales_invoice_path).name}")

    si_df = pd.read_excel(sales_invoice_path)
    if _SOLDE_COL not in si_df.columns or "Code reservation" not in si_df.columns:
        print("  [Solde restant du] Required columns missing in SalesInvoice — skipping.")
        return invoice_df

    avail_info  = [c for c in _SOLDE_INFO_COLS if c in si_df.columns]
    si_filtered = (
        si_df[si_df[_SOLDE_COL] != 0][avail_info + [_SOLDE_COL]]
        .drop_duplicates(subset=["Code reservation"], keep="last")
        .copy()
    )
    if si_filtered.empty:
        return invoice_df

    # Insert column right after Devise
    pos = invoice_df.columns.get_loc("Devise") + 1 if "Devise" in invoice_df.columns else len(invoice_df.columns)
    invoice_df.insert(pos, _SOLDE_COL, 0)

    existing_codes = set(invoice_df["Code reservation"])
    in_facture     = si_filtered[si_filtered["Code reservation"].isin(existing_codes)]
    not_in_facture = si_filtered[~si_filtered["Code reservation"].isin(existing_codes)]

    # Update existing rows
    for _, row in in_facture.iterrows():
        invoice_df.loc[invoice_df["Code reservation"] == row["Code reservation"], _SOLDE_COL] = row[_SOLDE_COL]

    # Append new rows
    if not not_in_facture.empty:
        new_rows = []
        for _, row in not_in_facture.iterrows():
            new_row = {}
            for col in invoice_df.columns:
                if col in _SOLDE_INFO_COLS and col in row.index:
                    new_row[col] = row[col]
                elif col == _SOLDE_COL:
                    new_row[col] = row[_SOLDE_COL]
                elif col in _SOLDE_BOOL_COLS:
                    new_row[col] = False
                else:
                    new_row[col] = 0
            new_rows.append(new_row)
        invoice_df = pd.concat([invoice_df, pd.DataFrame(new_rows)], ignore_index=True)

    print(f"  [Solde restant du] {len(in_facture)} updated, {len(not_in_facture)} new rows added.")
    return invoice_df


# ── Main entry point ──────────────────────────────────────────────────────────
def run(
    reff_csv_path:      str,
    reff_snapshot_name: str,
    fact_file_path:     str,
    fact_date:          str,
    period_start:       str = "2026-04-01",
    period_end:         str = "2026-04-16",
    sales_invoice_path: str = "",
) -> list:
    """
    Run the full payment report pipeline.

    Naming convention — every file carries a unique 8-char hex ID:
      ref_dl{dl-date}_cr{min}~{max}_{id}.csv          ← reference snapshots
      inv_dl{dl-date}_cr{min}~{max}_{id}.{ext}        ← invoice inputs
      PaymentGrouped {ref_id} {inv_id} {run_id}.xlsx   ← grouped result
      Facture        {ref_id} {inv_id} {run_id}.xlsx   ← facture result

    {ref_id} = stem of the reference archive CSV used
    {inv_id} = stem of the archived invoice file
    {run_id} = ID shared by the two result files from this run

    Returns paths to:
      [0] PaymentGrouped result  → Data/Result/Payment/
      [1] Facture result         → Data/Result/Payment/
      [2] Updated reference      → Data/Archive/Payment/Reference/
    """
    accounts = load_users()
    agencies = load_agencies()

    def get_payment_currency_amount(user, booking_curr, amount):
        if user == "WEB":
            return amount, booking_curr
        currency = accounts[user]["currency"]
        rate     = exchange_rates[booking_curr][currency]
        return amount / rate, currency

    # ── Load raw data ─────────────────────────────────────────────────────────
    print(f"Loading reference snapshot: {Path(reff_csv_path).name}")
    df_payment1 = pd.read_csv(reff_csv_path, sep=";")

    print(f"Loading invoice file: {Path(fact_file_path).name}")
    df_payment2 = load_single_file(fact_file_path)

    # ── Archive original invoice file (raw, before any processing) ────────────
    _, inv_stem = _archive_invoice_file(fact_file_path, fact_date, df_payment2)

    df_payment1_used = df_payment1[COLUMN_NAMES].copy()
    df_payment2_used = df_payment2[COLUMN_NAMES].copy()

    df_payment1_used["Booking Created"] = pd.to_datetime(df_payment1_used["Booking Created"], utc=False)
    df_payment2_used["Booking Created"] = pd.to_datetime(df_payment2_used["Booking Created"], utc=False)
    _created = pd.to_datetime(df_payment2_used["Created"], errors="coerce")
    df_payment2_used["Created"] = _created.dt.tz_convert(None) if _created.dt.tz is not None else _created

    # ── Filter to invoice period ──────────────────────────────────────────────
    _period_end = pd.Timestamp(period_end) + pd.Timedelta(days=1)
    to_be_invoiced_df = df_payment2_used[
        (df_payment2_used["Created"] >= period_start) &
        (df_payment2_used["Created"] < _period_end)
    ].copy()
    unique_dates = to_be_invoiced_df["Created"].dt.date.unique()
    print(f"  Invoice dates: {unique_dates}")

    # ── Handle old AGI bookings modified in period ────────────────────────────
    old_modified       = to_be_invoiced_df[to_be_invoiced_df["Booking Created"] < period_start]
    unique_modif_dates = old_modified["Booking Created"].dt.date.unique()
    print(f"  Modified booking dates: {unique_modif_dates}")

    old_with_agi_df = old_modified[old_modified["MoP Code"] == "AGI"]
    print(f"  Old AGI rows: {len(old_with_agi_df)} | "
          f"Unique bookings: {len(old_with_agi_df['Booking Code'].unique())}")

    old_state_of_booking_with_agi_df = df_payment1_used[
        (df_payment1_used["MoP Code"] == "AGI") &
        (df_payment1_used["Booking Code"].isin(old_with_agi_df["Booking Code"].unique()))
    ]

    old_amounts = (
        old_state_of_booking_with_agi_df[["Booking Code", "MoP Code", "Booking Currency Amount"]]
        .rename(columns={"Booking Currency Amount": "Amount_Old"})
    )
    new_old_with_agi_df = old_with_agi_df.copy()
    new_old_with_agi_df = new_old_with_agi_df.merge(old_amounts, on=["Booking Code", "MoP Code"], how="left")
    new_old_with_agi_df["Amount_Old"] = new_old_with_agi_df["Amount_Old"].fillna(0)
    new_old_with_agi_df["Booking Currency Amount"] = (
        new_old_with_agi_df["Booking Currency Amount"] - new_old_with_agi_df["Amount_Old"]
    )
    new_old_with_agi_df = new_old_with_agi_df.drop(columns=["Amount_Old"])

    bookings_with_agi_modif = new_old_with_agi_df[
        new_old_with_agi_df["Booking Currency Amount"] != 0
    ]["Booking Code"]

    new_old_with_agi_df[["Payment Currency Amount", "Payment Currency"]] = (
        new_old_with_agi_df.apply(
            lambda row: get_payment_currency_amount(
                row["User"], row["Booking Currency"], row["Booking Currency Amount"]
            ),
            axis=1,
            result_type="expand",
        )
    )

    # ── Merge modifications back ──────────────────────────────────────────────
    to_be_invoiced_updated = to_be_invoiced_df.set_index("Booking Code")
    replacement_df         = new_old_with_agi_df.set_index("Booking Code")

    COLS_TO_REPLACE    = ["Booking Currency Amount", "Payment Currency Amount", "Payment Currency"]
    mask               = (to_be_invoiced_updated["MoP Code"] == "AGI") & \
                         (to_be_invoiced_updated.index.isin(replacement_df.index))
    booking_codes_mask = to_be_invoiced_updated.index[mask]

    for col in COLS_TO_REPLACE:
        to_be_invoiced_updated.loc[mask, col] = replacement_df.loc[booking_codes_mask, col].values

    to_be_invoiced_updated = to_be_invoiced_updated.reset_index()

    # ── Add GSA columns ───────────────────────────────────────────────────────
    user_col_index = to_be_invoiced_updated.columns.get_loc("User") + 1
    to_be_invoiced_updated.insert(
        user_col_index, "User GSA Affectation",
        to_be_invoiced_updated["User"].map(lambda u: accounts.get(u, {}).get("gsa")),
    )

    gsa_col_index = to_be_invoiced_updated.columns.get_loc("Agent Code") + 1
    to_be_invoiced_updated.insert(
        gsa_col_index, "Agency GSA Affectation",
        to_be_invoiced_updated["Agent Code"].map(lambda u: agencies.get(u, {}).get("gsa")),
    )

    # ── Clean notes ───────────────────────────────────────────────────────────
    to_be_invoiced_updated.replace(
        r"Automatic payrow|Automatic Revoke|Denied PayEx payment|Init PayEx web payment",
        "", regex=True, inplace=True,
    )
    to_be_invoiced_updated["Notes"] = to_be_invoiced_updated["Notes"].fillna("")

    for col in ["Booking Created", "Created"]:
        if pd.api.types.is_datetime64_any_dtype(to_be_invoiced_updated[col]):
            if to_be_invoiced_updated[col].dt.tz is not None:
                to_be_invoiced_updated[col] = to_be_invoiced_updated[col].dt.tz_localize(None)

    PAYMENT_RESULT_DIR.mkdir(parents=True, exist_ok=True)
    run_id = generate_id()

    # ── Output 1: PaymentGrouped ──────────────────────────────────────────────
    payment_out = PAYMENT_RESULT_DIR / f"{run_id} {reff_snapshot_name} {inv_stem} PaymentGrouped.xlsx"
    to_be_invoiced_updated.to_excel(payment_out, index=False)
    print(f"  Saved: {payment_out.name}")

    # ── Build invoice dataframe ───────────────────────────────────────────────
    to_be_invoiced_updated_invoice = to_be_invoiced_updated[
        to_be_invoiced_updated["MoP Code"].isin(["APCO", "APCOR", "CAS", "CASR", "AGI"]) &
        (to_be_invoiced_updated["Is Preliminary"] != True)
    ]
    booking_codes = to_be_invoiced_updated_invoice["Booking Code"].unique()

    data = []
    for code in tqdm(booking_codes, desc="Processing bookings", unit="booking"):
        df_booking = to_be_invoiced_updated_invoice[
            to_be_invoiced_updated_invoice["Booking Code"] == code
        ]
        has_notes    = (df_booking["Notes"].notna() & (df_booking["Notes"].astype(str).str.strip() != "")).any()
        booking_data = (
            list(df_booking[["Booking Code"]].iloc[0])
            + [has_notes]
            + list(df_booking[["Booking Created", "Agent Code", "Agent name",
                                "Agency GSA Affectation", "Booking Currency",
                                "Booking Status"]].iloc[0])
        )
        for type_payment in PAYMENT_TYPES:
            df_booking_type = df_booking[df_booking["Payment Type"] == type_payment]
            for point in POINTS:
                df_booking_point = df_booking_type[df_booking_type["User GSA Affectation"] == point]
                if point == "Web":
                    booking_data.append(df_booking_point["Payment Currency Amount"].sum())
                else:
                    for curr in CURRENCIES:
                        booking_data.append(
                            df_booking_point[df_booking_point["Payment Currency"] == curr]
                            ["Payment Currency Amount"].sum()
                        )
        data.append(booking_data)

    invoice_df = pd.DataFrame(data, columns=INVOICE_COLUMNS)

    # Enrich
    idx = invoice_df.columns.get_loc("Code reservation")
    invoice_df.insert(idx + 1, "Est en modification AGI", invoice_df["Code reservation"].isin(bookings_with_agi_modif))

    refund_cols = [c for c in invoice_df.columns if c.endswith(" -")]
    invoice_df.insert(idx + 2, "A un remboursement", invoice_df[refund_cols].sum(axis=1) != 0)

    invoice_df["Date creation"] = pd.to_datetime(invoice_df["Date creation"])
    invoice_df.insert(idx + 3, "Est en modification", invoice_df["Date creation"] < period_start)

    value_cols   = [c for c in INVOICE_COLUMNS if c not in
                    ["Code reservation", "A des notes", "Date creation", "Code agent",
                     "Nom agent", "GSA agent", "Devise", "Statut reservation"]]
    cols_to_drop = [c for c in value_cols if c in invoice_df.columns and invoice_df[c].sum() == 0]
    invoice_df   = invoice_df.drop(columns=cols_to_drop)

    # ── Move flag cols to end ─────────────────────────────────────────────────
    _flag_cols = ["Est en modification", "Est en modification AGI", "A un remboursement",
                  "Statut reservation", "A des notes"]
    _other     = [c for c in invoice_df.columns if c not in _flag_cols]
    _flags     = [c for c in _flag_cols if c in invoice_df.columns]
    invoice_df = invoice_df[_other + _flags]

    # ── Enrich with sales balance ─────────────────────────────────────────────
    invoice_df = _enrich_with_sales_balance(invoice_df, sales_invoice_path)

    # ── Output 2: Facture ─────────────────────────────────────────────────────
    facture_out = PAYMENT_RESULT_DIR / f"{run_id} {reff_snapshot_name} {inv_stem} Facture.xlsx"
    invoice_df.to_excel(facture_out, index=False)
    print(f"  Saved: {facture_out.name}")

    # ── Output 3: Updated reference → archive as CSV ──────────────────────────
    print("Updating reference snapshot...")
    df_reff_updated = update_reference_with_fact(df_payment1, df_payment2)
    PAYMENT_REFERENCE_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    reff_out = PAYMENT_REFERENCE_ARCHIVE_DIR / f"{ref_archive_name(fact_date, df_reff_updated)}.csv"
    df_reff_updated.to_csv(str(reff_out), sep=";", index=False)
    print(f"  Archived updated reference: {reff_out.name}")

    return [str(payment_out), str(facture_out), str(reff_out)]


if __name__ == "__main__":
    from backend.common import PAYMENT_REFERENCE_ARCHIVE_DIR as _REF_DIR

    snapshots = sorted(_REF_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not snapshots:
        raise SystemExit("No reference snapshots found in archive. Run via main.py to upload one.")

    print("Available snapshots:")
    for i, s in enumerate(snapshots, 1):
        print(f"  [{i}] {s.name}")
    val = int(input("Select: ").strip())
    chosen = snapshots[val - 1]

    run(
        reff_csv_path      = str(chosen),
        reff_snapshot_name = chosen.stem,
        fact_file_path     = input("Invoice file path: ").strip(),
        fact_date          = input("Download date (YYYY-MM-DD): ").strip(),
        period_start       = input("Period start (YYYY-MM-DD): ").strip(),
        period_end         = input("Period end   (YYYY-MM-DD): ").strip(),
    )
