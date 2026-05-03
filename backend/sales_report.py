import logging
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

from .common import (
    SALES_RESULT_DIR,
    SALES_ARCHIVE_DIR ,
    ExecutionTracker,
    extract_files_from_one_dir,
    generate_id,
    date_range_str,
    load_agencies,
)

# ── Configuration dataclass ───────────────────────────────────────────────────
@dataclass
class ReportConfig:
    sales_folder:    str  = ""
    download_date:   str  = ""
    vat_suffix:      str  = ". Vat"
    format:          str  = "Csv"    # "Csv" | "Xlsx"
    mode:            str  = "short"  # "short" | "detailed"
    only_checked_in: bool = False


# ── Stateless helpers ─────────────────────────────────────────────────────────
def aggregate_and_sort(
    df: pd.DataFrame,
    index_col: str,
    value_cols,
    custom_order: list,
    aggfunc: str = "sum",
    fill_missing: bool = False,
    fill_value: float = 0,
) -> pd.DataFrame:
    pivot = df.pivot_table(index=index_col, values=value_cols, aggfunc=aggfunc)
    if fill_missing:
        return pivot.reindex(custom_order, fill_value=fill_value)
    return pivot.loc[pivot.index.intersection(custom_order)]


def flatten_dict(d: dict, parent_key: str = "", sep: str = "_") -> dict:
    if isinstance(d, dict) and len(d) == 1:
        d = next(iter(d.values()))
    items: list = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def generate_invoice_report(df_source: pd.DataFrame, output_path: Path) -> None:
    df = df_source.copy()
    df["Nom client"]    = df["Nom client"].fillna("")
    df["Prenom client"] = df["Prenom client"].fillna("")
    df_remaining        = df.copy()

    cond_not_checked = ~df_remaining["Check-in aller"] & ~df_remaining["Check-in retour"]

    test_pattern = re.compile(
        r"^(?:(?:test|tes|tst|teste|testing|etst|testx|tesqt|teset|teqt|cas|carpack|ok)"
        r"(?:\s(?:test|tes|tst|teste|testing|etst|testx|tesqt|teset|teqt|cas|carpack|ok))?"
        r"|([a-z])\1{1,}(?:\s([a-z])\2{1,})?|\. \.)$",
        re.IGNORECASE,
    )
    df_remaining["Cas de test"] = (
        (
            (df_remaining["Nom client"] + df_remaining["Prenom client"]).str.strip().eq("")
            | df_remaining["Nom client"].str.contains(test_pattern, na=False)
            | df_remaining["Prenom client"].str.contains(test_pattern, na=False)
            | df_remaining["Code agent"].isin(["TEST5", "TESTWEB"])
        ) & cond_not_checked
    )

    liste_pattern = r"(?i)liste(?:\s+d['\s]?attente(?:\s+\w+)?)?"
    df_remaining["Cas de liste dattente"] = (
        (
            df_remaining["Nom client"].str.contains(liste_pattern, na=False)
            | df_remaining["Prenom client"].str.contains(liste_pattern, na=False)
        ) & cond_not_checked
    )

    direction_pattern = r"(?i)direction(?:\s+generale)?"
    df_remaining["Cas de direction generale"] = (
        (
            df_remaining["Nom client"].str.contains(direction_pattern, na=False)
            | df_remaining["Prenom client"].str.contains(direction_pattern, na=False)
        ) & cond_not_checked
    )

    case_columns = ["Cas de test", "Cas de liste dattente", "Cas de direction generale"]
    df_facture   = df_remaining.drop(columns=case_columns, errors="ignore")

    df_remaining["has_any_case"] = df_remaining[case_columns].any(axis=1)
    df_controle  = df_remaining.loc[df_remaining["has_any_case"]].copy()

    df_sans_test              = df_remaining[~df_remaining["has_any_case"]].copy()
    df_sans_test["Solde_pos"] = df_sans_test["Solde restant du"].clip(lower=0)
    df_sans_test["Solde_neg"] = df_sans_test["Solde restant du"].clip(upper=0)
    df_sans_test["GSA_final"] = np.where(
        df_sans_test["GSA agent"] == "Siege",
        df_sans_test["Cree par"],
        df_sans_test["GSA agent"],
    )

    metrics_order = ["Montant TTC", "Commission agent", "Commission calculer agent", "Solde_pos", "Solde_neg"]
    result = df_sans_test.pivot_table(
        index="GSA_final", columns="Devise", values=metrics_order, aggfunc="sum", fill_value=0
    )
    result = result.swaplevel(0, 1, axis=1)
    currencies = result.columns.get_level_values(0).unique()
    result = result.reindex(columns=pd.MultiIndex.from_product([currencies, metrics_order]))
    result.columns = [f"{cur}_{met}" for cur, met in result.columns]
    result = result.reset_index()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df_facture.to_excel(writer,  sheet_name="Facture",         index=False)
        df_controle.to_excel(writer, sheet_name="Filtre_Controle", index=False)
        result.to_excel(writer,      sheet_name="Totaux",          index=False)

    logging.info("Invoice report → %s  (%d / %d / %d rows)", output_path.name,
                 len(df_facture), len(df_controle), len(result))


def generate_invoice_control_report(df_source: pd.DataFrame, output_path: Path) -> None:
    df = df_source.copy()
    df["Solde positif"]         = df["Solde restant du"] > 0
    df["Solde negatif"]         = df["Solde restant du"] < 0
    df["Commission nulle"]      = (df["Commission agent"] == 0) & (df["GSA agent"] != "Siege")
    df["Commission differente"] = df["Commission diff agent"] != 0
    df["Sans frais"]            = (df["Frais carburant"] == 0) & (df["Statut reservation"] != "CAN")

    case_columns       = ["Solde positif", "Solde negatif", "Commission nulle", "Commission differente", "Sans frais"]
    df["has_any_case"] = df[case_columns].any(axis=1)
    df_control         = df.loc[df["has_any_case"]].drop(columns=["has_any_case"])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df_control.to_excel(writer, sheet_name="Control", index=False)

    logging.info("Invoice control report → %s  (%d flagged rows)", output_path.name, len(df_control))


def generate_control_report(df_source: pd.DataFrame, output_path) -> None:
    df     = df_source.copy()
    aller  = df["Code depart aller"].fillna("").astype(str)
    retour = df["Code depart retour"].fillna("").astype(str)

    acd_mask = df["Devise"].eq("DZD") & (
        aller.str.startswith(("ALC", "MAR")) | retour.str.startswith(("ALC", "MAR"))
    )
    df_acd = df.loc[acd_mask]

    has_ref    = df_acd["Reference"].notna() & df_acd["Reference"].ne("")
    ref_counts = df_acd.loc[has_ref, "Reference"].value_counts()
    dup_refs   = ref_counts[ref_counts.gt(1)].index
    uniq_refs  = ref_counts[ref_counts.eq(1)].index

    sheets = {
        "Cas_ACD_Ref_Doublon": df_acd.loc[has_ref & df_acd["Reference"].isin(dup_refs)],
        "Cas_ACD_Ref_Unique":  df_acd.loc[has_ref & df_acd["Reference"].isin(uniq_refs)],
        "Cas_ACD_Sans_Ref":    df_acd.loc[~has_ref],
        "Meme_Trajet":         df.loc[aller.ne("") & retour.ne("") &
                                      aller.str[:3].str.upper().eq(retour.str[:3].str.upper())],
        "Devise_Incompatible": df.loc[df["Devise incompatible"].fillna(False)],
        "Tarif_Manuel":        df.loc[df["Tarif manuel Frais"].fillna(False) |
                                      df["Tarif manuel HT"].fillna(False)],
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        for sheet_name, sheet_df in sheets.items():
            if not sheet_df.empty:
                sheet_df.to_excel(writer, sheet_name=sheet_name, index=False)

    logging.info("Control report → %s", output_path.name)


# ── Archive helper ────────────────────────────────────────────────────────────
def _archive_sales_input_files(files_list: list, download_date: str, fmt: str) -> None:
    """Copy every input file into Archive/Sales/Input/ with a canonical name."""
    ext = ".csv" if fmt == "Csv" else ".xlsx"
    matching = [f for f in files_list if Path(f).suffix.lower() == ext]
    if not matching:
        return
    dest_dir = SALES_ARCHIVE_DIR 
    dest_dir.mkdir(parents=True, exist_ok=True)
    for src_path in matching:
        src  = Path(src_path)
        name = f"{generate_id()}_dl{download_date}_sales{src.suffix.lower()}"
        shutil.copy2(src, dest_dir / name)
    print(f"  Archived {len(matching)} input file(s) → Archive/Sales/Input/")


# ── Main entry point ──────────────────────────────────────────────────────────
def run(cfg: ReportConfig = None) -> list:
    """
    Run the full sales report pipeline.

    Returns a list of paths to the output files:
      [0] SalesReport Combined Short
      [1] SalesReport Invoice          (3 sheets)
      [2] SalesReport Invoice Control
      + optionally [3] SalesReport Combined (detailed mode)
    """
    if cfg is None:
        cfg = ReportConfig()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(message)s",
        datefmt="%H:%M:%S",
    )

    vat             = cfg.vat_suffix
    download_date   = cfg.download_date
    csv_xlsx        = cfg.format
    short_detailed  = cfg.mode
    only_checked_in = cfg.only_checked_in

    tracker = ExecutionTracker(report_id=f"SalesReport dl {download_date}")
    logging.info("Config: %s", cfg)

    agencies = load_agencies()
    SALES_RESULT_DIR.mkdir(parents=True, exist_ok=True)

    CUSTOM_PIVOT_ORDER = {
        "category_code": [
            "ADL", "CHD", "INF", "DOGK", "PS",
            "A2ED", "A2E", "A4E", "A6E", "B2I", "B4I",
            "BIKE", "MOTO", "CARH", "CARL", "CARM",
            "REM3", "REM6", "TRA1", "TRA2",
            "V1U4", "V1U5", "V1U6", "V1U9",
            "V2U4", "V2U5", "V2U6", "V2U9",
            "V3U4", "V3U5", "V3U6", "V3U9",
            "FUEL", "FUELV",
            "SECV", "PCONV", "PORTV", "SECP", "PCONP", "PORTP",
            "TAXH1", "TAXH2", "AMD", "CAN",
        ],
        "category_group_code": ["P", "PR", "K9", "S", "L", "V", "F"],
        "category_group_name": [
            "Passengers", "Passengers PROMO RIH", "Vehicles",
            "Cabin", "Cabin M", "Cabin F", "Seats", "Pets",
            "Seat", "PAX avev GVIP", "GRATUITE CABINE", "Vehicule Gratuite",
        ],
    }

    custom_category_code_order       = CUSTOM_PIVOT_ORDER["category_code"]
    custom_category_group_code_order = CUSTOM_PIVOT_ORDER["category_group_code"]
    custom_category_group_name_order = CUSTOM_PIVOT_ORDER["category_group_name"]

    used_cols = [
        "Booking code", "Created By User", "Agent Code", "Agent Name",
        "Customer Name", "Customer First Name", "Booking Created Time",
        "Booking Status", "Currency", "Category Code", "Category Group Code",
        "Category Group Name", "Category Specification Code",
        f"Price Excl{vat}", "Category Quantity", "Payment Balance",
        "Commission", "Manual Price", "Departure Time", "Departure Code",
        "Journey Code", "Check-in Date", "Check-in User Code", "Checked-In",
        "Booking Ref.",
    ]

    def extract_data(df_booking: pd.DataFrame) -> tuple:
        booking_code       = df_booking["Booking code"].iloc[0]
        booking_user       = df_booking["Created By User"].iloc[0]
        booking_agent_code = df_booking["Agent Code"].iloc[0]
        booking_agent_name = df_booking["Agent Name"].iloc[0]

        booking_agent                  = agencies.get(booking_agent_code, {})
        booking_agent_gsa              = booking_agent.get("gsa", "")
        booking_agent_gsa_commission   = booking_agent.get("commission", 0)
        booking_customer_name          = df_booking["Customer Name"].iloc[0]
        booking_customer_first_name    = df_booking["Customer First Name"].iloc[0]
        booking_creation_date          = df_booking["Booking Created Time"].iloc[0]
        booking_status                 = df_booking["Booking Status"].iloc[0]
        booking_currency               = df_booking["Currency"].iloc[0]
        booking_agent_currency_missmatched = booking_agent.get("currency", "") != booking_currency
        booking_ref                    = df_booking["Booking Ref."].iloc[0]

        amounts_by_code  = aggregate_and_sort(df_booking, "Category Code",
                                              f"Price Excl{vat}", custom_category_code_order,
                                              fill_missing=True, fill_value=0)
        amounts_by_group = aggregate_and_sort(df_booking, "Category Group Code",
                                              f"Price Excl{vat}", custom_category_group_code_order,
                                              fill_missing=True, fill_value=0)
        qty_by_name      = aggregate_and_sort(df_booking, "Category Group Name",
                                              "Category Quantity", custom_category_group_name_order,
                                              fill_missing=True, fill_value=0)
        if "Fees" in qty_by_name.index:
            qty_by_name = qty_by_name.drop("Fees")

        quantities_dict    = flatten_dict(qty_by_name.to_dict(),      parent_key="qty")
        amounts_code_dict  = flatten_dict(amounts_by_code.to_dict(),  parent_key="amt_code")
        amounts_group_dict = flatten_dict(amounts_by_group.to_dict(), parent_key="amt_group")

        total      = df_booking[f"Price Excl{vat}"].sum()
        balance    = df_booking["Payment Balance"].iloc[0]
        commission = df_booking["Commission"].sum()

        manual_price_without_fees = (
            df_booking.loc[df_booking["Category Group Code"].isin(["V","PR","P","K9","L","S"]),
                           "Manual Price"].gt(0).any()
        )
        manual_price_fees = (
            df_booking.loc[df_booking["Category Group Code"].eq("F"), "Manual Price"].gt(0).any()
        )
        with_vehicle_v = len(
            df_booking[(df_booking["Category Group Code"] == "V") &
                       (df_booking["Category Code"].str.startswith("V"))]
        )

        departsTimes = sorted(list(df_booking["Departure Time"].dropna().unique()))
        (al_date, al_code, al_journey, al_chk_date, al_chk_user, al_chk) = ("","","","","",False)
        (re_date, re_code, re_journey, re_chk_date, re_chk_user, re_chk) = ("","","","","",False)

        if len(departsTimes) == 1:
            if df_booking["Journey Code"].str.startswith(("ALG", "ORN")).any():
                r = df_booking.iloc[0]
                al_date, al_code, al_journey = r["Departure Time"], r["Departure Code"], r["Journey Code"]
                al_chk_date, al_chk_user     = r["Check-in Date"], r["Check-in User Code"]
                al_chk = df_booking["Checked-In"].any()
            elif df_booking["Journey Code"].str.startswith(("MAR", "ALC")).any():
                r = df_booking.iloc[0]
                re_date, re_code, re_journey = r["Departure Time"], r["Departure Code"], r["Journey Code"]
                re_chk_date, re_chk_user     = r["Check-in Date"], r["Check-in User Code"]
                re_chk = df_booking["Checked-In"].any()
        elif len(departsTimes) >= 2:
            df_al = df_booking[df_booking["Departure Time"] == departsTimes[0]]
            df_re = df_booking[df_booking["Departure Time"] == departsTimes[1]]
            al_date, al_code   = df_al.iloc[0]["Departure Time"],  df_al.iloc[0]["Departure Code"]
            al_journey         = df_al.iloc[0]["Journey Code"]
            al_chk_date, al_chk_user = df_al.iloc[0]["Check-in Date"], df_al.iloc[0]["Check-in User Code"]
            al_chk = df_al["Checked-In"].any()
            re_date, re_code   = df_re.iloc[0]["Departure Time"],  df_re.iloc[0]["Departure Code"]
            re_journey         = df_re.iloc[0]["Journey Code"]
            re_chk_date, re_chk_user = df_re.iloc[0]["Check-in Date"], df_re.iloc[0]["Check-in User Code"]
            re_chk = df_re["Checked-In"].any()

        result = {
            "booking_code": booking_code, "booking_status": booking_status,
            "created_by": booking_user,   "agent_code": booking_agent_code,
            "agent_name": booking_agent_name, "agent_gsa": booking_agent_gsa,
            "customer_last_name": booking_customer_name,
            "customer_first_name": booking_customer_first_name,
            "currency": booking_currency, "booking_created_at": booking_creation_date,
            "aller_departure_date": al_date, "aller_departure_location_code": al_code,
            "aller_journey_description": al_journey, "aller_checkin_date": al_chk_date,
            "aller_checkin_user": al_chk_user,
            "retour_departure_date": re_date, "retour_departure_location_code": re_code,
            "retour_journey_description": re_journey, "retour_checkin_date": re_chk_date,
            "retour_checkin_user": re_chk_user,
            **quantities_dict, **amounts_code_dict, **amounts_group_dict,
            "total_amount": total, "balance_due": balance,
            "agent_commission": commission,
            "manual_price_without_fees": manual_price_without_fees,
            "manual_price_fees": manual_price_fees,
            "with_vehicle_v": with_vehicle_v, "booking_ref": booking_ref,
        }

        ht = (
            total
            - amounts_code_dict["amt_code_FUEL"]  - amounts_code_dict["amt_code_SECP"]
            - amounts_code_dict["amt_code_PCONP"] - amounts_code_dict["amt_code_PORTP"]
            - amounts_code_dict["amt_code_FUELV"] - amounts_code_dict["amt_code_SECV"]
            - amounts_code_dict["amt_code_PCONV"] - amounts_code_dict["amt_code_PORTV"]
            - amounts_code_dict["amt_code_TAXH1"] - amounts_code_dict["amt_code_TAXH2"]
            - amounts_code_dict["amt_code_AMD"]   - amounts_code_dict["amt_code_CAN"]
        )
        calculated_commission = round(
            (amounts_code_dict["amt_code_TAXH1"] + amounts_code_dict["amt_code_TAXH2"]
             + amounts_code_dict["amt_code_AMD"]  + amounts_code_dict["amt_code_CAN"] + ht)
            * booking_agent_gsa_commission, 2,
        )

        short_result = {
            "Code reservation": booking_code, "Statut reservation": booking_status,
            "Cree par": booking_user, "Date creation": booking_creation_date,
            "Code agent": booking_agent_code, "Nom agent": booking_agent_name,
            "GSA agent": booking_agent_gsa, "GSA commission agent": booking_agent_gsa_commission,
            "Nom client": booking_customer_name, "Prenom client": booking_customer_first_name,
            "Reference": booking_ref,
            "Code depart aller": al_code, "Check-in aller": al_chk,
            "Code depart retour": re_code, "Check-in retour": re_chk,
            "Devise": booking_currency,
            "Frais carburant vehicule": amounts_code_dict.get("amt_code_FUELV", 0),
            "Frais carburant":          amounts_code_dict.get("amt_code_FUEL",  0),
            "Frais passagers": (amounts_code_dict.get("amt_code_SECP",  0)
                                + amounts_code_dict.get("amt_code_PCONP", 0)
                                + amounts_code_dict.get("amt_code_PORTP", 0)),
            "Frais vehicule":  (amounts_code_dict.get("amt_code_SECV",  0)
                                + amounts_code_dict.get("amt_code_PCONV", 0)
                                + amounts_code_dict.get("amt_code_PORTV", 0)),
            "Frais hauteur":   (amounts_code_dict.get("amt_code_TAXH1", 0)
                                + amounts_code_dict.get("amt_code_TAXH2", 0)),
            "Frais modification":        amounts_code_dict.get("amt_code_AMD", 0),
            "Frais annulation":          amounts_code_dict.get("amt_code_CAN", 0),
            "Montant HT": ht, "Montant TTC": total,
            "Solde restant du": balance,
            "Commission agent": commission,
            "Commission calculer agent": calculated_commission,
            "Commission diff agent": round(commission - calculated_commission, 2),
            "Tarif manuel HT": manual_price_without_fees,
            "Tarif manuel Frais": manual_price_fees,
            "Devise incompatible": booking_agent_currency_missmatched,
        }

        return result, short_result

    # ── File discovery + archive ──────────────────────────────────────────────
    with tracker.phase("File Discovery", complexity="O(F)"):
        files_list = extract_files_from_one_dir(cfg.sales_folder)
        tracker.record("File Discovery", files_found=len(files_list))

    print(f"  Files found: {len(files_list)}")
    _archive_sales_input_files(files_list, download_date, csv_xlsx)

    # ── Data extraction ───────────────────────────────────────────────────────
    full_data       = []
    full_data_short = []

    with tracker.phase("Data Extraction", complexity="O(N·B·K)"):
        total_raw_rows = 0
        total_bookings = 0

        for idx, f in enumerate(tqdm(files_list, desc="Files", unit="file"), 1):
            logging.info("[%d/%d] %s", idx, len(files_list), Path(f).name)

            df = (pd.read_excel(f, usecols=used_cols, low_memory=False)
                  if csv_xlsx == "Xlsx"
                  else pd.read_csv(f, sep=";", usecols=used_cols, low_memory=False))

            df["Category Group Name"] = (
                df["Category Group Name"].fillna("") + " " +
                df["Category Specification Code"].fillna("")
            ).str.strip()

            if only_checked_in:
                df = df[df["Checked-In"] == True].copy()

            raw_rows       = len(df)
            total_raw_rows += raw_rows
            file_bookings  = 0

            for code in tqdm(df["Booking code"].unique(), desc="  Bookings", leave=False, unit="booking"):
                df_booking   = df[df["Booking code"] == code]
                depart_times = list(df_booking["Departure Time"].dropna().unique())

                df_independent = df_booking[~df_booking["Departure Time"].isin(depart_times)]
                df_dependent   = df_booking[ df_booking["Departure Time"].isin(depart_times)]

                combined = (pd.concat([df_dependent, df_independent])
                            if len(df_dependent) > 0 else df_independent)

                data, data_short = extract_data(combined)
                full_data.append(data)
                full_data_short.append(data_short)
                file_bookings += 1

            total_bookings += file_bookings

        tracker.record("Data Extraction", files_processed=len(files_list),
                       total_raw_rows=total_raw_rows, total_bookings=total_bookings,
                       avg_rows_per_booking=round(total_raw_rows / max(total_bookings, 1), 2))

    # ── Build run identifiers (shared across all result files for this run) ───
    df_short_final = pd.DataFrame(full_data_short)
    cr_range    = date_range_str(df_short_final, "Date creation")
    run_id      = generate_id()
    sales_period = f"dl{download_date}_cr{cr_range}"   # period section shared by all outputs

    # ── Output 1: Short report ────────────────────────────────────────────────
    output_files = []

    with tracker.phase("Export — Short Report", complexity="O(B·C)"):
        out_short = SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesShort.xlsx"
        df_short_final.to_excel(out_short, index=False)
        tracker.record("Export — Short Report", rows=len(df_short_final),
                       columns=len(df_short_final.columns), file=out_short.name)
        logging.info("Short report → %s  (%d rows)", out_short.name, len(df_short_final))
        output_files.append(str(out_short))
        print(f"  Saved: {out_short.name}")

    # ── Output (optional): Detailed report ───────────────────────────────────
    if short_detailed == "detailed":
        with tracker.phase("Export — Detailed Report", complexity="O(B·C)"):
            df_final      = pd.DataFrame(full_data)
            financial_cols = ["total_amount", "balance_due", "agent_commission",
                              "manual_price_without_fees", "manual_price_fees", "with_vehicle_v"]
            ordered_cols  = [c for c in df_final.columns if c not in financial_cols] + financial_cols
            df_final      = df_final[ordered_cols]
            zero_cols     = [c for c in df_final.columns
                             if c.startswith(("amt_group", "amt_code", "qty")) and df_final[c].sum() == 0]
            df_final_filtered = df_final.drop(columns=zero_cols)

            out_detailed = SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesDetailed.xlsx"
            df_final_filtered.to_excel(out_detailed, index=False)
            tracker.record("Export — Detailed Report", rows=len(df_final_filtered),
                           zero_cols_dropped=len(zero_cols), file=out_detailed.name)
            output_files.append(str(out_detailed))
            print(f"  Saved: {out_detailed.name}")

    # ── Output 2: Invoice report ──────────────────────────────────────────────
    with tracker.phase("Invoice Report", complexity="O(B log B)"):
        out_invoice = SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesInvoice.xlsx"
        generate_invoice_report(df_short_final, out_invoice)
        tracker.record("Invoice Report", input_rows=len(df_short_final))
        output_files.append(str(out_invoice))
        print(f"  Saved: {out_invoice.name}")

    # ── Output 3: Invoice control report ─────────────────────────────────────
    with tracker.phase("Invoice Control Report", complexity="O(B)"):
        out_control = SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesInvoiceControl.xlsx"
        generate_invoice_control_report(df_short_final, out_control)
        tracker.record("Invoice Control Report", input_rows=len(df_short_final))
        output_files.append(str(out_control))
        print(f"  Saved: {out_control.name}")

    # ── ACD / anomaly control reports ─────────────────────────────────────────
    with tracker.phase("ACD/Anomaly Control Reports", complexity="O(B)"):
        df_nouris = df_short_final.loc[df_short_final["GSA agent"].eq("Siege")].copy()
        df_gsa    = df_short_final.loc[df_short_final["GSA agent"].ne("Siege")].copy()
        generate_control_report(df_nouris, SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesControlNouris.xlsx")
        generate_control_report(df_gsa,    SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesControlGsa.xlsx")
        tracker.record("ACD/Anomaly Control Reports",
                       siege_bookings=len(df_nouris), gsa_bookings=len(df_gsa))

    print(tracker.summary())

    meta_out = SALES_RESULT_DIR / f"{run_id}_{sales_period}_SalesMetadata.json"
    tracker.export_json(meta_out)

    return output_files


if __name__ == "__main__":
    run()
