# Data sources, licences and citations

`Astronaut_Health_Data.xlsx` holds small extracts of the public datasets below. Its **Source guide** sheet describes each
extract. Every source is openly downloadable: none needs credentials or a data-use agreement. Licences were checked on
the source pages on 2026-11-14. Only derived summary numbers reach the app (`server/calibration.json`).

| Workbook sheet(s) | Dataset | Licence | Used for |
|---|---|---|---|
| Cabin environment | NASA OSDR **Environmental Data App (EDA)**, Rodent Research 6 (RR-6) ISS telemetry, 20 Dec 2017 | NASA public data (US Government work) | Cabin CO₂, temperature and humidity daily profile |
| Radiation | NASA OSDR **RadLab** API, ISS DosTel1, 20 Dec 2017 | NASA public data (US Government work) | Absorbed dose-rate profile, cumulative absorbed dose |
| Sleep nights, Sleep epochs | **BIDSleep** 1.0.1, PhysioNet | Open Data Commons Attribution 1.0 (ODC-By) | Sleep template, duration, stage-specific HR |
| PPG activities | **Pulse Transit Time PPG Dataset** 1.1.0, PhysioNet | Open Data Commons Open Database License 1.0 (ODbL) | Seated HR, SpO₂, blood pressure |
| QoL stress, QoL item responses | **QoL_Stress** 1.0.0, PhysioNet | CC BY 4.0 | Relaxed-state anxiety (STAI-S) |
| Sleep deprivation | **OpenNeuro ds004902**, *A Resting-state EEG Dataset for Sleep Deprivation* | CC0 | Normal-sleep PVT reaction time and lapses |
| Paired home *(not used by the app)* | **Smart Home** dataset, figshare | CC BY 4.0 | — (optional context) |
| Wearable recovery *(not used by the app)* | **Wearable Device Dataset from Induced Stress and Structured Exercise Sessions** 1.0.1, PhysioNet | ODC-By 1.0 | — (optional context) |

**ODbL note:** the `PPG activities` sheet is an extract of an ODbL database, so that extract stays available under ODbL 1.0
with attribution (https://opendatacommons.org/licenses/odbl/1-0/). Our code is MIT. The other sheets carry their own
licences above.

## Citations

- NASA Open Science Data Repository, Environmental Data App: RR-6 telemetry.
  https://visualization.osdr.nasa.gov/eda/
- NASA Open Science Data Repository, RadLab: ISS radiation data API.
  https://visualization.osdr.nasa.gov/radlab/gui/data-api/
- Song, T., Zhang, Y., Zhou, Z., & Dutta, J. (2026). *A Multi-Night Instantaneous Heart Rate and Accelerometry Dataset with
  EEG Sleep Stage Labels* (BIDSleep, version 1.0.1). PhysioNet. https://doi.org/10.13026/rees-1092
- Song, T.-A., Zhang, Y., Zhou, Z., Hou, L., Malekzadeh, M., Behzad, A., & Dutta, J. (2025). AI-driven sleep staging using
  instantaneous heart rate and accelerometry: Insights from an Apple Watch study. *IEEE Transactions on Biomedical
  Engineering*. https://doi.org/10.1109/TBME.2025.3612158
- Mehrgardt, P., Khushi, M., Poon, S., & Withana, A. (2022). *Pulse Transit Time PPG Dataset* (version 1.1.0). PhysioNet.
  https://doi.org/10.13026/jpan-6n92
- Calvo, A., Cejudo, A., & Martín Andonegui, C. (2026). *QoL_Stress: A Multimodal Dataset of Physiological and Self-Reported
  Stress Responses* (version 1.0.0). PhysioNet. https://doi.org/10.13026/vqtz-pm70
- Xiang, C., Fan, X., Bai, D., Lv, K., & Lei, X. *A Resting-state EEG Dataset for Sleep Deprivation* (ds004902). OpenNeuro.
  https://openneuro.org/datasets/ds004902
- Zafar, R. O., et al. *A Real-World Smart Home Dataset Integrating Sleep, Environmental, Physiological, and Ambient Sensing
  for Homecare Research*. figshare. https://doi.org/10.6084/m9.figshare.32975324
- Hongn, A., Bosch, F., Prado, L., & Bonomini, P. (2025). *Wearable Device Dataset from Induced Stress and Structured
  Exercise Sessions* (version 1.0.1). PhysioNet. https://doi.org/10.13026/he0v-tf17
- PhysioNet platform: Pollard, T., Moody, B. E., Lehman, L., Gow, B., Fernandes, C., Xie, C., Johnson, A., Mark, R. G., &
  Heldt, T. (2026). PhysioNet as a global platform for biomedical research. *Nature Health*.
  https://doi.org/10.1038/s44360-026-00096-z

## Context references (not data)

- NASA Human Research Program risk pages, linked per body region in the app (`web/js/organs.mjs`).
- NASA OCHMO Technical Brief TB-004, Carbon Dioxide. https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/
