# Historical MEDA subset (CONTRACT v3.1, schema v2)

Run from the repository root with the project environment:

```powershell
.\.venv\Scripts\python.exe data-pipeline/meda_pipeline.py
.\.venv\Scripts\python.exe -m unittest discover -s data-pipeline/tests -v
node data-pipeline/verify_meda.mjs
```

Inputs: the supplied 26 CSVs under raw/NASA Space Apps Project/HavaKoşullarıVerileri.
Only derived PS, RHS and WS products are exported. ANCILLARY and TIRS are not
used to infer air temperature, optical depth or measurement dates. Input hashes
are checked before/after. Raw data and processed audits are not committed.

## Scientific provenance

- Dataset overview and processing levels:
  https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda_08192021.html
- MEDA RDR Software Interface Specification:
  https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/logs/MEDA_RDR_SIS_issue1.docx
- PDS bundle/collection identifiers: urn:nasa:pds:mars2020_meda and
  urn:nasa:pds:mars2020_meda:data_derived_env.

The SIS confirms PRESSURE in Pa, HUMIDITY_LOCAL_TEMP in K and horizontal wind
speed in m/s. The PDS derived humidity collection describes relative humidity
as %RH. Local XML product labels are absent; exact product versions, humidity
reference conventions and calibration histories remain to be checked against
the matching labels. Dataset URLs identify the official MEDA overview rather
than inventing unverified per-file archive URLs. Unknown DOI values stay null.

The exact SIS sentinel 999999999 means the calibrated value could not be
computed. Only this documented sentinel and blank values are omitted.
Malformed/nonfinite values fail explicitly; no arbitrary outlier thresholds
or interpolated measurements are introduced. Values outside schema bounds
cause errors, not clipping. No validity claim is inferred from numeric range.

Sensor-local temperature is converted K - 273.15 to Celsius, rounded to six
decimals only to remove floating-point artifacts. Its uncertainty in K has the
same numerical magnitude in Celsius. It is never used as air temperature.
Pressure/RHS quality remains null where there is no dedicated source flag.
Wind quality is null: ROVER_STILL (0 moving, 1 still) is operational context,
not a measurement-quality flag, and is not exported as quality. Missing
uncertainties are null, never zero. Air temperature, opacity and UTC earthDate
are always null. Derived products are real observation-derived data, not raw
telemetry and not synthetic examples: isSample=false, historical=true.

Site coordinates 77.443 E, 18.432 N are the midpoint of the team's previously
supplied regional study bounds on the Mars sphere. They are an approximate
regional reference, NOT a rover position for these sols. The samples cannot
describe simultaneous conditions across the study area or certify EVA safety.

## Deterministic selection and time coverage

For each source CSV, each measurement field is sampled independently in six
LMST bins: [00,04), [04,08), [08,12), [12,16), [16,20), [20,24). Select the first
valid source row encountered in each populated bin. This represents different
times, not a daily mean, extrema survey or continuous weather record. Empty
bins stay absent. The file order defines ties; repeated exports are stable.
No measurements are chosen for cosmetic values or to suppress extrema.

Values are grouped ONLY when they came from the same file and same physical
CSV row. RHS humidity and local temperature can therefore share an observation;
if their first valid rows differ, they remain separate observations. PS/RHS/WS
are never joined by row index, SCLK proximity, or displayed minute.

Original LMST is validated as a five-digit sol plus HH:MM:SS.fraction. JSON
localTime retains HH:MM by truncation, not nearest-minute rounding. Distinct
source rows in the same minute remain distinct observations. Exact source row,
LMST seconds, SCLK and LTST are preserved in processed/meda_audit.json; the
frontend schema cannot represent them. SCLK is not treated as Unix time and
LTST is not substituted for LMST. No UTC conversion is attempted.

Observed source coverage is incomplete: sol 310 ends around 23:05 LMST, sol
426 around 23:20, and sol 431 starts around 17:00. Even the other sols have
sampling gaps and sensor coverage differences. WS exists only on 301/310.
Review audit first/last times per file rather than assuming complete sols.
