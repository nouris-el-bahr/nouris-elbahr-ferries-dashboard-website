import os
import shutil
import sys
import tempfile
from pathlib import Path

# ── Ensure project root is in path ──────────────────────────────────────────────
_PROJECT_ROOT = Path(__file__).parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# ── Backend imports ────────────────────────────────────────────────────────────
from backend import payment_report
from backend import sales_report
from backend import consolidated_invoice
from backend.common import (
    PAYMENT_REFERENCE_ARCHIVE_DIR,
    PAYMENT_RESULT_DIR,
    SALES_RESULT_DIR,
)
from backend.payment_report import ref_archive_name
from backend.sales_report import ReportConfig

# ── App setup ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
CORS(app, origins=_cors_origins)

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTS = {".csv", ".xlsx", ".xls"}


def _ext_ok(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTS


def _detect_type(p: str) -> str:
    return "sales" if "Sales" in Path(p).parts else "payment"


def _save_uploads_to_tmp(files) -> Path:
    """Save a list of uploaded FileStorage objects to a new temp folder."""
    tmp = Path(tempfile.mkdtemp())
    for f in files:
        if _ext_ok(f.filename):
            f.save(str(tmp / secure_filename(f.filename)))
    return tmp


# ── Health ─────────────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


# ── List folder contents ───────────────────────────────────────────────────────
@app.route("/api/list-folder", methods=["POST"])
def list_folder():
    """List CSV/Excel files in a folder."""
    folder_path = request.json.get("folder_path", "")
    file_format = request.json.get("format", "Csv")

    if not folder_path:
        return jsonify({"error": "Chemin du dossier requis"}), 400

    try:
        p = Path(folder_path)
        if not p.exists():
            return jsonify({"error": "Dossier introuvable"}), 404
        if not p.is_dir():
            return jsonify({"error": "Le chemin n'est pas un dossier"}), 400

        # Filter files by format
        extensions = [".csv"] if file_format == "Csv" else [".xlsx", ".xls"]
        files = []
        for f in p.glob("*"):
            if f.is_file() and f.suffix.lower() in extensions:
                files.append({
                    "name": f.name,
                    "path": str(f),
                    "size": f.stat().st_size,
                })

        return jsonify({
            "folder_path": folder_path,
            "format": file_format,
            "files": sorted(files, key=lambda x: x["name"]),
            "count": len(files),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Snapshots ──────────────────────────────────────────────────────────────────
@app.route("/api/snapshots")
def list_snapshots():
    PAYMENT_REFERENCE_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    snaps = sorted(
        PAYMENT_REFERENCE_ARCHIVE_DIR.glob("*.csv"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return jsonify([{"name": p.stem, "filename": p.name} for p in snaps])


@app.route("/api/snapshots/upload", methods=["POST"])
def upload_snapshot():
    """Accept files or folder path and archive as a snapshot CSV."""
    # Support two ways: FormData with files OR JSON with folder path
    ref_date = ""
    fmt      = "Csv"
    tmp      = None
    use_temp = False

    # Check if FormData with files
    files = request.files.getlist("files")
    if files:
        ref_date = request.form.get("ref_date", "")
        fmt      = request.form.get("format", "Csv")
        if not files:
            return jsonify({"error": "Aucun fichier fourni"}), 400
        tmp = _save_uploads_to_tmp(files)
        use_temp = True
    else:
        # Check if JSON with folder path
        data = request.get_json() or {}
        folder_path = data.get("folder_path", "")
        ref_date = data.get("ref_date", "")
        fmt = data.get("format", "Csv")

        if not folder_path:
            return jsonify({"error": "Fichiers ou chemin du dossier requis"}), 400

        folder_path = Path(folder_path)
        if not folder_path.exists() or not folder_path.is_dir():
            return jsonify({"error": "Dossier introuvable"}), 404
        tmp = folder_path

    try:
        df        = payment_report.load_reference_from_folder(str(tmp), fmt)
        snap_name = ref_archive_name(ref_date, df)
        csv_path  = PAYMENT_REFERENCE_ARCHIVE_DIR / f"{snap_name}.csv"
        PAYMENT_REFERENCE_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

        if csv_path.exists():
            from datetime import datetime
            snap_name = f"{snap_name}_{datetime.now().strftime('%H%M%S')}"
            csv_path  = PAYMENT_REFERENCE_ARCHIVE_DIR / f"{snap_name}.csv"

        df.to_csv(str(csv_path), sep=";", index=False)
        return jsonify({"name": snap_name, "filename": csv_path.name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if use_temp and tmp:
            shutil.rmtree(tmp, ignore_errors=True)


# ── Payment Report ─────────────────────────────────────────────────────────────
@app.route("/api/payment/run", methods=["POST"])
def run_payment():
    snapshot_name = request.form.get("snapshot_name", "")
    if not snapshot_name:
        return jsonify({"error": "snapshot_name est requis"}), 400

    reff_csv = PAYMENT_REFERENCE_ARCHIVE_DIR / f"{snapshot_name}.csv"
    if not reff_csv.exists():
        return jsonify({"error": "Snapshot introuvable"}), 404

    if "invoice_file" not in request.files:
        return jsonify({"error": "invoice_file est requis"}), 400

    inv = request.files["invoice_file"]
    if not _ext_ok(inv.filename):
        return jsonify({"error": "Le fichier de facture doit être CSV ou Excel"}), 400

    tmp_inv = UPLOAD_DIR / secure_filename(inv.filename)
    inv.save(str(tmp_inv))

    try:
        outputs = payment_report.run(
            reff_csv_path      = str(reff_csv),
            reff_snapshot_name = snapshot_name,
            fact_file_path     = str(tmp_inv),
            fact_date          = request.form.get("fact_date", ""),
            period_start       = request.form.get("period_start", ""),
            period_end         = request.form.get("period_end", ""),
        )
        return jsonify({
            "success": True,
            "files": [{"name": Path(p).name, "type": _detect_type(p)} for p in outputs],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        tmp_inv.unlink(missing_ok=True)


# ── Sales Report ───────────────────────────────────────────────────────────────
@app.route("/api/sales/run", methods=["POST"])
def run_sales():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "Aucun fichier de ventes fourni"}), 400

    tmp = _save_uploads_to_tmp(files)
    try:
        cfg = ReportConfig(
            sales_folder    = str(tmp),
            download_date   = request.form.get("download_date", ""),
            vat_suffix      = request.form.get("vat_suffix", ". Vat"),
            format          = request.form.get("format", "Csv"),
            mode            = request.form.get("mode", "short"),
            only_checked_in = request.form.get("only_checked_in", "false").lower() == "true",
        )
        outputs = sales_report.run(cfg)
        return jsonify({
            "success": True,
            "files": [{"name": Path(p).name, "type": "sales"} for p in outputs],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── Consolidated Invoice ───────────────────────────────────────────────────────
@app.route("/api/consolidated/run", methods=["POST"])
def run_consolidated():
    ref_files   = request.files.getlist("ref_files")
    sales_files = request.files.getlist("sales_files")

    if not ref_files:
        return jsonify({"error": "ref_files est requis"}), 400
    if "invoice_file" not in request.files:
        return jsonify({"error": "invoice_file est requis"}), 400
    if not sales_files:
        return jsonify({"error": "sales_files est requis"}), 400

    inv = request.files["invoice_file"]
    if not _ext_ok(inv.filename):
        return jsonify({"error": "Le fichier de facture doit être CSV ou Excel"}), 400

    fact_date    = request.form.get("fact_date", "")
    period_start = request.form.get("period_start", "")
    period_end   = request.form.get("period_end", "")
    ref_format   = request.form.get("ref_format", "Csv")
    sales_format = request.form.get("sales_format", "Csv")
    download_date = request.form.get("download_date", fact_date)

    tmp_ref   = _save_uploads_to_tmp(ref_files)
    tmp_sales = _save_uploads_to_tmp(sales_files)
    tmp_inv   = UPLOAD_DIR / secure_filename(inv.filename)
    inv.save(str(tmp_inv))
    tmp_csv_dir = None

    try:
        # Build reference snapshot in-memory
        df_ref    = payment_report.load_reference_from_folder(str(tmp_ref), ref_format)
        snap_name = ref_archive_name(fact_date, df_ref)
        tmp_csv_dir = Path(tempfile.mkdtemp())
        tmp_csv   = tmp_csv_dir / f"{snap_name}.csv"
        df_ref.to_csv(str(tmp_csv), sep=";", index=False)

        # Run short sales report to produce SalesInvoice.xlsx
        cfg = ReportConfig(
            sales_folder    = str(tmp_sales),
            download_date   = download_date or fact_date,
            format          = sales_format,
            mode            = "short",
        )
        sales_outputs = sales_report.run(cfg)
        sales_invoice_path = next(
            (p for p in sales_outputs if "SalesInvoice" in Path(p).name), ""
        )

        # Run consolidated invoice
        outputs = consolidated_invoice.run(
            reff_csv_path      = str(tmp_csv),
            reff_snapshot_name = snap_name,
            fact_file_path     = str(tmp_inv),
            fact_date          = fact_date,
            period_start       = period_start,
            period_end         = period_end,
            sales_invoice_path = sales_invoice_path,
        )
        return jsonify({
            "success": True,
            "files": [{"name": Path(p).name, "type": _detect_type(p)} for p in outputs],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmp_ref, ignore_errors=True)
        shutil.rmtree(tmp_sales, ignore_errors=True)
        tmp_inv.unlink(missing_ok=True)
        if tmp_csv_dir:
            shutil.rmtree(tmp_csv_dir, ignore_errors=True)


# ── Results ────────────────────────────────────────────────────────────────────
@app.route("/api/results")
def list_results():
    results = []
    # Map directories to result types
    result_dirs = [
        (PAYMENT_RESULT_DIR, "payment"),
        (SALES_RESULT_DIR, "sales"),
    ]

    for d, label in result_dirs:
        d.mkdir(parents=True, exist_ok=True)
        for f in d.glob("*.xlsx"):
            # Determine type: consolidated, payment, or sales
            result_type = label
            if "ConsolidatedInvoice" in f.name:
                result_type = "consolidated"

            results.append({
                "name":     f.name,
                "type":     result_type,
                "size":     f.stat().st_size,
                "modified": f.stat().st_mtime,
            })

    results.sort(key=lambda r: r["modified"], reverse=True)
    return jsonify(results)


@app.route("/api/results/download")
def download_result():
    name  = request.args.get("name", "")
    type_ = request.args.get("type", "payment")

    # Map type to directory
    if type_ == "payment" or type_ == "consolidated":
        base = PAYMENT_RESULT_DIR
    else:
        base = SALES_RESULT_DIR

    path = (base / name).resolve()

    if not path.is_file():
        return jsonify({"error": "Fichier introuvable"}), 404

    try:
        path.relative_to(base.resolve())
    except ValueError:
        return jsonify({"error": "Accès refusé"}), 403

    return send_file(str(path), as_attachment=True, download_name=name)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
