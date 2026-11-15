# Dataset and measurement guide

The original workbook is included unchanged at `data/Astronaut_Health_Data.xlsx`. Its Source guide sheet is the provenance authority for the extracts. Counts below refer to workbook data rows, not complete source datasets. All sources are public and openly downloadable; licences, DOIs and full citations were verified on 2026-11-14 and are listed in [data/SOURCES.md](../data/SOURCES.md).

| Dataset / workbook sheet | Extract | Relevant columns / use | Current status |
|---|---|---|---|
| BIDSleep / Sleep nights, Sleep epochs | 6 nights, 3 participants; 5,629 30-s epochs | Participant, Night, expert stage, mean HR, HR sample count, sleep duration (min), efficiency | Used: individual sleep template, duration and stage HR distributions |
| NASA EDA / Cabin environment | 576 rows, 288 ISS and 288 ground control, RR-6, 2017-12-20 | Mission, UTC timestamp, location, CO2 ppm, temperature °C, relative humidity % | Used: ISS 5-min daily profile interpolated between bins |
| NASA RadLab / Radiation | 1,906 ISS rows | Timestamp (as exported), instrument ID, module, absorbed dose rate µGy/h, dose equivalent rate µSv/h, particle flux cm⁻² sr⁻¹ s⁻¹ | Used: DosTel1 5-min median profile; equivalent rate blank |
| Pulse Transit Time PPG / PPG activities | 66 trials, 22 participants | Activity sit/walk/run, cuff/oximeter HR, SpO2, systolic/diastolic BP before/after | Used: seated cuff HR and SpO2 baseline; BP available but not simulated |
| QoL_Stress / QoL stress, QoL item responses | 132 phase rows, 66 participants; 3,564 item rows | Phase, ECG HR, EDA, PSS-14 total, STAI-S total, questionnaire item responses | Used: Relax STAI-S; EDA/HR and item data optional |
| OpenNeuro ds004902 / Sleep deprivation | 142 session rows, 71 participants, PVT metrics in 68 rows | Condition, median RT ms, lapses, RT SD, SSS/KSS, PANAS, diary sleep fields | Used: normal-sleep reaction time and lapses; remaining fields optional |
| Smart Home / Paired home | 412 HR minutes, one participant, Nov 7–8 2025; 396 matched | HR, numeric sleep state, air temperature, humidity, sensor timestamps | Not used; optional Earth proxy context |
| Wearable Stress & Exercise / Wearable recovery | 6 phase rows from 3 cycling participants | HR, IBI, pulse RMSSD, skin temp, accel, EDA, phase | Not used; optional recovery/HRV context |

## Known source links
- BIDSleep: https://physionet.org/content/bidsleep-dataset/1.0.1/
- NASA Environmental Data App: https://visualization.osdr.nasa.gov/eda/
- NASA RadLab API: https://visualization.osdr.nasa.gov/radlab/gui/data-api/
- Pulse Transit Time PPG: https://physionet.org/content/pulse-transit-time-ppg/1.1.0/
- QoL_Stress: https://physionet.org/content/qol-stress/1.0.0/
- OpenNeuro ds004902: https://openneuro.org/datasets/ds004902
- NASA HRP sleep risk reference: https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/
- NASA CO2 technical brief: https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/
- Smart Home (figshare, CC BY 4.0): https://doi.org/10.6084/m9.figshare.32975324
- Wearable Stress & Exercise (PhysioNet, ODC-By 1.0): https://physionet.org/content/wearable-device-dataset/1.0.1/

## Calibration and interpretation
`calibrate.py` reads Excel XML using Python standard library. Sleep baseline centers and typical night are derived from each participant; awake HR/SpO2/cognition centers use 25th/50th/75th percentiles of independent source studies, not longitudinal records of the same people. Calibration stores SHA-256 of source workbook. Sleep efficiency = sleep / scored recording time (Wake+N1+N2+N3+REM), unknown excluded. Nightly HR uses measured HR samples; pulse RMSSD is not ECG HRV. RadLab timezone absent in export and dose equivalent missing. Smart Home matches last sensor reading within 30 min. Avoid joining across independent study participant IDs. Do not claim real astronaut physiology or deep-space exposure from these Earth/ISS inputs. NASA EDA RR-6 is historical, not a current live ISS feed. No actual cabin spatial map/coordinates are in the extract; do not invent compartment gradients.

## Prioritize additional metrics only if time permits
Already present: HR, SpO2, sleep duration/stages/efficiency, reaction time/lapses/anxiety, cabin CO2/temp/RH/radiation. Optional high value: daily subjective fatigue, sleep quality, stress, mood and symptoms; reaction-time variability; activity context; HRV/recovery only if validated source supports it. Cabin pressure, O2 partial pressure, ventilation flow and cumulative dose would be useful in a real system but are not present in the current feed. Radiation accumulated absorbed dose can be integrated only with known time coverage, units and missing-data handling; do not imply equivalent dose. Deep-space analog datasets or mission-specific environment profiles would be useful future research; not bundled.
