"""Streaming, traceable MEDA derived-product sampling; no cross-sensor joins."""
from pathlib import Path
import csv
import hashlib
import json
import math
import re

FIELDS = ("pressurePa", "relativeHumidityPct", "sensorTempC", "airTempC", "windSpeedMps", "opacity")
SPECS = {
    "PS": [("pressurePa", "PRESSURE", "Pa", "PRESSURE_UNCERTAINTY")],
    "RHS": [("relativeHumidityPct", "LOCAL_RELATIVE_HUMIDITY", "%", "LOCAL_RELATIVE_HUMIDITY_UNCERTAINTY"),
            ("sensorTempC", "HUMIDITY_LOCAL_TEMP", "°C", "HUMIDITY_LOCAL_TEMP_UNCERTAINTY")],
    "WS": [("windSpeedMps", "HORIZONTAL_WIND_SPEED", "m/s", "HORIZONTAL_WIND_SPEED_UNCERTAINTY")],
}
SOURCE_URL = "https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda_08192021.html"
SIS_URL = "https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/logs/MEDA_RDR_SIS_issue1.docx"


def number(text):
    if text is None or not text.strip():
        return None
    try:
        value = float(text)
    except ValueError as exc:
        raise ValueError(f"Not a numeric MEDA value: {text!r}") from exc
    if not math.isfinite(value):
        raise ValueError("Nonfinite MEDA value")
    # MEDA RDR SIS: this exact value means a calibrated value could not be computed.
    return None if value == 999999999 else value


def parse_lmst(text, expected_sol):
    match = re.fullmatch(r"(\d{5})M([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?", text)
    if not match or int(match[1]) != expected_sol:
        raise ValueError(f"Invalid/mismatched LMST: {text!r}")
    return f"{match[2]}:{match[3]}", int(match[2]) // 4


def sample_file(path):
    match = re.fullmatch(r"WE__(\d{4})_+DER_(PS|RHS|WS)_+P\d+\.csv", path.name, re.IGNORECASE)
    if not match:
        raise ValueError(f"Unsupported MEDA filename: {path.name}")
    sol, category = int(match[1]), match[2].upper()
    selected, rows, first, last = {}, 0, None, None
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"LMST", "SCLK", "LTST"} | {col for _, col, _, _ in SPECS[category]}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Missing required columns in {path.name}")
        for line, row in enumerate(reader, 2):
            rows += 1
            local_time, bucket = parse_lmst(row["LMST"], sol)
            first = first or row["LMST"]
            last = row["LMST"]
            for field, column, unit, uncertainty_column in SPECS[category]:
                value = number(row[column])
                if value is None or (field, bucket) in selected:
                    continue
                if field == "relativeHumidityPct" and not 0 <= value <= 100:
                    raise ValueError("Relative humidity outside schema range; no silent clipping")
                if field in ("pressurePa", "windSpeedMps") and value < 0:
                    raise ValueError("Negative pressure/wind; no undocumented sentinel filtering")
                uncertainty = number(row.get(uncertainty_column))
                if uncertainty is not None and uncertainty < 0:
                    raise ValueError("Negative uncertainty")
                if field == "sensorTempC":
                    value = round(value - 273.15, 6)
                # ROVER_STILL is operational context, not a measurement-quality flag.
                quality = None
                selected[field, bucket] = dict(line=line, localTime=local_time, field=field, value=value,
                    provenance=dict(file=path.name, column=column, unit=unit, uncertainty=uncertainty, quality=quality),
                    lmst=row["LMST"], sclk=row["SCLK"], ltst=row["LTST"])
    grouped = {}
    for item in selected.values():
        line = item["line"]
        if line not in grouped:
            grouped[line] = dict(localTime=item["localTime"], timeSystem="LMST", earthDate=None,
                                 **dict.fromkeys(FIELDS), measurements={}, isSample=False)
        observation = grouped[line]
        observation[item["field"]] = item["value"]
        observation["measurements"][item["field"]] = item["provenance"]
    audit = dict(file=path.name, sol=sol, category=category, rows=rows, firstLMST=first, lastLMST=last,
                 selections=list(selected.values()))
    return sol, [grouped[line] for line in sorted(grouped)], audit


def build_meda(root):
    sols, audit = {}, []
    paths = sorted(root.rglob("*.csv"))
    for path in paths:
        if not re.search(r"_DER_(PS|RHS|WS)_", path.name, re.IGNORECASE):
            continue
        sol, observations, details = sample_file(path)
        sols.setdefault(sol, []).extend(observations)
        audit.append(details)
    for observations in sols.values():
        observations.sort(key=lambda o: (o["localTime"], next(iter(o["measurements"].values()))["file"]))
    if not sols or any(not observations for observations in sols.values()):
        raise ValueError("No usable MEDA observations")
    payload = dict(version=2,
        site=dict(name="Jezero Crater", approxLon=77.443, approxLat=18.432),
        source=dict(datasets=[dict(name="Mars 2020 MEDA " + title + " Derived Data", url=SOURCE_URL, doi=None)
                             for title in ("Pressure Sensor", "Relative Humidity Sensor", "Wind Sensor")]),
        historical=True, sols=[dict(sol=sol, observations=sols[sol]) for sol in sorted(sols)])
    json.dumps(payload, allow_nan=False)
    return payload, audit


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    base = Path(__file__).resolve().parent
    root = base / "raw/NASA Space Apps Project/HavaKoşullarıVerileri"
    paths = sorted(root.rglob("*.csv"))
    before = {str(p.relative_to(root)): digest(p) for p in paths}
    payload, audit = build_meda(root)
    if before != {str(p.relative_to(root)): digest(p) for p in paths}:
        raise RuntimeError("Source files changed")
    output = base.parent / "frontend/public/data/meda.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    processed = base / "processed"
    # Audit contains exact seconds and source rows, outside the constrained frontend schema.
    import subprocess
    subprocess.run(["git", "check-ignore", "--quiet", "data-pipeline/processed/meda_audit.json"], cwd=base.parent, check=True)
    processed.mkdir(exist_ok=True)
    (processed / "meda_audit.json").write_text(json.dumps(dict(sis=SIS_URL, sourceHashes=before, files=audit),
                                                        ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dict(bytes=output.stat().st_size, observations=sum(len(s["observations"]) for s in payload["sols"]),
                         perSol={s["sol"]:len(s["observations"]) for s in payload["sols"]}, sourceUnchanged=True)))


if __name__ == "__main__": main()
