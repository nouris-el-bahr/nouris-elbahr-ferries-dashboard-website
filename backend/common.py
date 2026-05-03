import json
import logging
import os
import time
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Union

import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────────────
SETTINGS_DIR       = Path(__file__).parent.parent / "Data" / "Settings"
DATA_DIR           = Path(__file__).parent.parent / "Data" / "Test"
RESULT_DIR         = Path(__file__).parent.parent / "Data" / "Result"
PAYMENT_RESULT_DIR = RESULT_DIR / "Payment"
SALES_RESULT_DIR   = RESULT_DIR / "Sales"

PAYMENT_ARCHIVE_DIR           = Path(__file__).parent.parent / "Data" / "Archive" / "Payment"
PAYMENT_INVOICE_ARCHIVE_DIR   = PAYMENT_ARCHIVE_DIR / "Invoice"
PAYMENT_REFERENCE_ARCHIVE_DIR = PAYMENT_ARCHIVE_DIR / "Reference"

SALES_ARCHIVE_DIR       = Path(__file__).parent.parent / "Data" / "Archive" / "Sales"

# ── Naming utilities ──────────────────────────────────────────────────────────
def generate_id() -> str:
    """8-char hex ID — unique per file, collision-free at archive scale."""
    return uuid.uuid4().hex[:8]


def date_range_str(df: pd.DataFrame, col: str) -> str:
    """Return 'YYYY-MM-DD~YYYY-MM-DD' from the min/max of *col* in *df*."""
    series = pd.to_datetime(df[col], errors="coerce")
    if hasattr(series.dt, "tz") and series.dt.tz is not None:
        series = series.dt.tz_convert(None)
    min_d, max_d = series.min(), series.max()
    if pd.isna(min_d) or pd.isna(max_d):
        return "unknown~unknown"
    return f"{min_d.date()}~{max_d.date()}"

# ── Shared config ─────────────────────────────────────────────────────────────
exchange_rates = {
    "EUR": {"DZD": 1 / 158, "EUR": 1},
    "DZD": {"EUR": 100,      "DZD": 1},
}

# ── Settings loaders ──────────────────────────────────────────────────────────
def load_agencies() -> dict:
    df = pd.read_excel(SETTINGS_DIR / "Agencies.xlsx", index_col=0)
    return df.to_dict(orient="index")


def load_users() -> dict:
    df = pd.read_excel(SETTINGS_DIR / "Users.xlsx", index_col=0)
    return df.to_dict(orient="index")


# ── File utility ──────────────────────────────────────────────────────────────
def extract_files_from_one_dir(directory: str) -> list:
    """Walk *directory* and return every file path found. Complexity: O(F)."""
    all_files: list = []
    if os.path.exists(directory) and os.path.isdir(directory):
        for root, _, files in os.walk(directory):
            for f in files:
                all_files.append(f"{root}/{f}")
    else:
        logging.warning("Directory not found: %s", directory)
    return all_files


# ── Execution tracker ─────────────────────────────────────────────────────────
class ExecutionTracker:
    """Wall-clock timing and complexity metadata for every pipeline phase."""

    def __init__(self, report_id: str) -> None:
        self.report_id  = report_id
        self.start_time = datetime.now()
        self.phases: dict = {}

    @contextmanager
    def phase(self, name: str, complexity: str = ""):
        t0    = time.perf_counter()
        label = f"[{complexity}]" if complexity else ""
        logging.info("[START] %-40s %s", name, label)
        try:
            yield
        finally:
            elapsed = time.perf_counter() - t0
            self.phases.setdefault(name, {}).update(
                elapsed_sec=round(elapsed, 4), complexity=complexity
            )
            logging.info("[DONE ] %-40s %.3f s", name, elapsed)

    def record(self, phase: str, **metrics) -> None:
        """Attach arbitrary key-value metrics to an already-timed phase."""
        self.phases.setdefault(phase, {}).update(metrics)

    def summary(self) -> str:
        total = (datetime.now() - self.start_time).total_seconds()
        sep   = "═" * 72
        rows  = [
            sep, "  TECHNICAL EXECUTION REPORT",
            f"  Report   : {self.report_id}",
            f"  Generated: {datetime.now().strftime('%Y-%m-%d  %H:%M:%S')}",
            f"  Runtime  : {total:.3f} s", sep,
        ]
        for phase, info in self.phases.items():
            elapsed = info.get("elapsed_sec", 0)
            pct     = (elapsed / total * 100) if total else 0
            rows   += ["", f"  ┌─ {phase}",
                       f"  │  Time       : {elapsed:.4f} s  ({pct:.1f}%)"]
            if info.get("complexity"):
                rows.append(f"  │  Complexity : {info['complexity']}")
            for k, v in info.items():
                if k not in ("elapsed_sec", "complexity"):
                    rows.append(f"  │  {k:<24}: {v}")
            rows.append("  └" + "─" * 50)
        rows += ["", sep]
        return "\n".join(rows)

    def export_json(self, path: Union[str, Path]) -> None:
        payload = {
            "report_id":         self.report_id,
            "generated_at":      datetime.now().isoformat(),
            "total_runtime_sec": (datetime.now() - self.start_time).total_seconds(),
            "phases":            self.phases,
        }
        Path(path).write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        logging.info("Execution metadata → %s", path)
