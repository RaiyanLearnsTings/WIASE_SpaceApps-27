"""Build the simulator's small calibration file from Astronaut_Health_Data.xlsx."""

import argparse
import hashlib
import json
import math
import posixpath
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from itertools import groupby
from pathlib import Path
from statistics import median
from zipfile import ZipFile

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DOC_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PERSONAS = (("astro-1", "Astronaut 001"), ("astro-2", "Astronaut 002"), ("astro-3", "Astronaut 003"))


def sheet_rows(book, sheet):
    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    sheet_id = next(
        item.attrib[DOC_REL + "id"]
        for item in workbook.find(MAIN + "sheets")
        if item.attrib["name"] == sheet
    )
    relationships = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    target = next(item.attrib["Target"] for item in relationships if item.attrib["Id"] == sheet_id)
    sheet_path = target.lstrip("/") if target.startswith("/") else posixpath.join("xl", target)
    data = ET.fromstring(book.read(sheet_path)).find(MAIN + "sheetData")
    shared = (
        ["".join(t.text or "" for t in element.iter(MAIN + "t"))
         for element in ET.fromstring(book.read("xl/sharedStrings.xml"))]
        if "xl/sharedStrings.xml" in book.namelist() else []
    )

    def cell_value(cell):
        value = cell.findtext(MAIN + "v")
        kind = cell.get("t")
        if kind == "s":
            return shared[int(value)]
        if kind == "inlineStr":
            return "".join(t.text or "" for t in cell.iter(MAIN + "t"))
        if kind == "e":
            raise ValueError(f"Spreadsheet error in {sheet}!{cell.get('r')}: {value}")
        if value is None or kind in {"str", "b"}:
            return value
        return float(value)

    def columns(row):
        return {re.match(r"[A-Z]+", cell.attrib["r"]).group(): cell_value(cell) for cell in row}

    header = {col: value for col, value in columns(data[0]).items() if isinstance(value, str)}
    for row in data[1:]:
        values = columns(row)
        if any(value is not None for value in values.values()):
            yield {name: values.get(col) for col, name in header.items()}


def quantile(values, fraction):
    values = sorted(values)
    position = (len(values) - 1) * fraction
    start = math.floor(position)
    end = math.ceil(position)
    return values[start] + (values[end] - values[start]) * (position - start)


def distribution(values, minimum_spread, center=None):
    typical = median(values)
    mad = median(abs(value - typical) for value in values)
    return {
        "center": round(typical if center is None else center, 2),
        "spread": round(max(1.4826 * mad, minimum_spread), 2),
        "sample_count": len(values),
    }


def minute_of_day(timestamp):
    return round((timestamp % 1) * 1440, 6)


def build(workbook_path):
    with ZipFile(workbook_path) as workbook:
        epochs = list(sheet_rows(workbook, "Sleep epochs"))
        nights = list(sheet_rows(workbook, "Sleep nights"))
        seated = [row for row in sheet_rows(workbook, "PPG activities") if row["Activity"] == "sit"]
        normal = [row for row in sheet_rows(workbook, "Sleep deprivation") if row["Condition"] == "Normal sleep"]
        relaxed = [row for row in sheet_rows(workbook, "QoL stress") if row["Phase"] == "Relax"]
        cabin_rows = [row for row in sheet_rows(workbook, "Cabin environment") if row["Location"] == "ISS cabin"]
        radiation_rows = [row for row in sheet_rows(workbook, "Radiation") if row["Instrument ID"] == "DosTel1"]

    grouped = defaultdict(list)
    for epoch in epochs:
        grouped[epoch["Participant"]].append(epoch)
    if len(grouped) != 3:
        raise ValueError("Expected three BIDSleep participants in the workbook extract.")
    samples = {
        "heart_rate_bpm": [(row["Cuff HR start (bpm)"] + row["Cuff HR end (bpm)"]) / 2 for row in seated],
        "spo2_pct": [(row["SpO₂ start (%)"] + row["SpO₂ end (%)"]) / 2 for row in seated],
        "systolic_mmhg": [(row["Systolic start (mmHg)"] + row["Systolic end (mmHg)"]) / 2 for row in seated],
        "diastolic_mmhg": [(row["Diastolic start (mmHg)"] + row["Diastolic end (mmHg)"]) / 2 for row in seated],
        "median_reaction_time_ms": [row["Median RT (ms)"] for row in normal if row["Median RT (ms)"] is not None],
        "lapses": [row["Lapses"] for row in normal if row["Lapses"] is not None],
        "state_anxiety_score": [row["STAI-S total"] for row in relaxed if row["STAI-S total"] is not None],
    }
    spreads = {
        "heart_rate_bpm": 4,
        "spo2_pct": 0.5,
        "systolic_mmhg": 4,
        "diastolic_mmhg": 3,
        "median_reaction_time_ms": 12,
        "lapses": 1,
        "state_anxiety_score": 3,
    }
    limits = {
        "heart_rate_bpm": 15,
        "spo2_pct": 3,
        "systolic_mmhg": 20,
        "diastolic_mmhg": 12,
        "sleep_duration_min": 45,
        "median_reaction_time_ms": 45,
        "lapses": 3,
        "state_anxiety_score": 9,
        "co2_ppm": 300,
        "temperature_c": 1.2,
        "relative_humidity_pct": 8,
    }
    rank = sorted(
        grouped,
        key=lambda source: median(row["Mean sleeping HR (bpm)"] for row in nights if row["Participant"] == source),
    )

    crew = []
    for i, ((id_, name), source) in enumerate(zip(PERSONAS, rank)):
        records = [row for row in nights if row["Participant"] == source]
        durations = [row["Sleep duration (min)"] for row in records]
        typical = min(records, key=lambda row: abs(row["Sleep duration (min)"] - median(durations)))
        typical_epochs = sorted(
            (row for row in grouped[source] if row["Night"] == typical["Night"]),
            key=lambda row: row["Epoch start (UTC)"],
        )
        stages = [[stage, sum(1 for _ in run)] for stage, run in groupby(row["Expert stage"] for row in typical_epochs)]
        baseline = {
            field: distribution(values, spreads[field], quantile(values, (0.25, 0.50, 0.75)[i]))
            for field, values in samples.items()
        }
        baseline["lapses"]["center"] = round(baseline["lapses"]["center"])
        baseline["sleep_duration_min"] = distribution(durations, 20)
        baseline["sleep_hr_by_stage"] = {
            stage: distribution(
                [row["Mean HR (bpm)"] for row in grouped[source]
                 if row["Expert stage"] == stage and row["Mean HR (bpm)"] is not None],
                2.5,
            )
            for stage in ("Wake", "N1", "N2", "N3", "REM")
        }
        crew.append({
            "id": id_, "name": name, "baseline": baseline,
            "bedtime_minute": 23 * 60 + 10 * i,
            "exercise_minute": 12 * 60 + 35 * i,
            "sleep_source": {"participant": source, "template_night": int(typical["Night"])},
            "sleep_stage_runs": stages,
        })

    cabin_fields = [
        ("co2_ppm", "CO₂ (ppm)", 40),
        ("temperature_c", "Temperature (°C)", 0.25),
        ("relative_humidity_pct", "Relative humidity (%)", 1),
    ]
    cabin_rows.sort(key=lambda row: row["Timestamp (UTC)"])
    profile = [[minute_of_day(row["Timestamp (UTC)"]), *(row[key] for _, key, _ in cabin_fields)] for row in cabin_rows]
    if len(profile) != 288 or any(abs(row[0] - 5 * i) > 1e-4 for i, row in enumerate(profile)):
        raise ValueError("Expected one full UTC day of five-minute cabin readings.")

    radiation_bins = defaultdict(list)
    for row in radiation_rows:
        radiation_bins[int(minute_of_day(row["Timestamp (RadLab)"]) // 5)].append(row)

    def radiation_value(rows, field):
        values = [row[field] for row in rows if row[field] is not None]
        return round(median(values), 7) if values else None

    radiation = [
        [index * 5, *(radiation_value(radiation_bins[index], field) for field in
                      ("Absorbed dose rate (µGy/h)", "Dose equivalent rate (µSv/h)", "Particle flux (cm⁻² sr⁻¹ s⁻¹)"))]
        for index in range(288)
    ]

    return {
        "source_workbook_sha256": hashlib.sha256(workbook_path.read_bytes()).hexdigest(),
        "source_cabin_mission": cabin_rows[0]["Mission"],
        "source_radiation_instrument": "DosTel1",
        "minimum_deltas": limits,
        "crew": crew,
        "cabin": {
            "baseline": {
                field: distribution([row[key] for row in cabin_rows], spread)
                for field, key, spread in cabin_fields
            },
            "profile": profile,
            "radiation": radiation,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("calibration.json"))
    args = parser.parse_args()
    data = build(args.workbook)
    args.output.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} from {args.workbook.name}")


if __name__ == "__main__":
    main()
