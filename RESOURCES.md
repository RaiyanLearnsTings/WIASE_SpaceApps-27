# WIASE: links and resources

**Live website:** https://wiase.netlify.app

Team Super Space Sages · NASA Space Apps Challenge 2026. Licences and full citations for every dataset are in
[data/SOURCES.md](data/SOURCES.md).

## 1. NASA data

| Name | Link | What we used it for |
|---|---|---|
| NASA OSDR Environmental Data App (EDA): ISS Rodent Research 6 (RR-6) cabin telemetry, 20 Dec 2017 | https://visualization.osdr.nasa.gov/eda/ | The 24-hour ISS cabin profile for CO₂, temperature and humidity. It drives every cabin reading, cabin baseline and cabin alert in the app. |
| NASA OSDR RadLab API: ISS DosTel1 radiation record, 20 Dec 2017 | https://visualization.osdr.nasa.gov/radlab/gui/data-api/ | The absorbed radiation dose rate and the cumulative dose shown on the bone-marrow region. Shown as telemetry only, with no dose-equivalent conversion. |

## 2. Non-NASA data

| Name | Link | What we used it for |
|---|---|---|
| BIDSleep 1.0.1 (Song et al., 2026), PhysioNet | https://doi.org/10.13026/rees-1092 | A real sleep night for each astronaut: sleep stages, duration, efficiency and stage-specific heart rate. |
| Pulse Transit Time PPG Dataset 1.1.0 (Mehrgardt et al., 2022), PhysioNet | https://doi.org/10.13026/jpan-6n92 | Seated heart rate, SpO₂ and cuff blood-pressure baselines. |
| QoL_Stress 1.0.0 (Calvo et al., 2026), PhysioNet | https://doi.org/10.13026/vqtz-pm70 | The relaxed-state STAI-S anxiety baseline for the simulated cognitive check-ins. |
| OpenNeuro ds004902: A Resting-state EEG Dataset for Sleep Deprivation (Xiang et al.) | https://openneuro.org/datasets/ds004902 | Normal-sleep reaction times and lapses for the simulated reaction test baseline. |
| Smart Home dataset (Zafar et al.), figshare | https://doi.org/10.6084/m9.figshare.32975324 | Included in the data workbook as optional context; not used by the app. |
| Wearable Device Dataset from Induced Stress and Structured Exercise Sessions 1.0.1 (Hongn et al., 2025), PhysioNet | https://doi.org/10.13026/he0v-tf17 | Included in the data workbook as optional context; not used by the app. |

## 3. Information sources

| Name | Link | What we used it for |
|---|---|---|
| NASA Human Research Program: Human System Risks | https://www.nasa.gov/hrp/risks/ | Choosing which health areas matter most on a long mission, and the overall framing of the app. |
| NASA HRP: Risk of Behavioral Conditions and Psychiatric Disorders | https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/ | Background for the brain region and the cognitive-stress response steps; linked in the app. |
| NASA HRP: Risk from Inadequate Sleep and Irregular Schedules | https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/ | Background for tracking sleep and reaction time; linked in the app. |
| NASA HRP: Risk of Cardiovascular Adaptations | https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/ | Background for the heart and blood-pressure regions and their "why it is different in space" notes; linked in the app. |
| NASA HRP: Risk of Hypoxia | https://www.nasa.gov/reference/risk-of-hypoxia/ | Background for the lungs region and the low-SpO₂ steps; linked in the app. |
| NASA HRP: Risk of Radiation-Induced Cancers | https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/ | Background for the bone-marrow radiation region; linked in the app. |
| NASA OCHMO Technical Brief TB-004: Carbon Dioxide | https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/ | The symptoms of raised CO₂ and why it matters, used in the cabin CO₂ response steps. |
| Song et al. (2025), AI-driven sleep staging using instantaneous heart rate and accelerometry, IEEE TBME | https://doi.org/10.1109/TBME.2025.3612158 | Understanding how the BIDSleep data was collected and labelled. |
| Pollard et al. (2026), PhysioNet as a global platform for biomedical research, Nature Health | https://doi.org/10.1038/s44360-026-00096-z | Required citation for PhysioNet datasets. |
| Basner & Dinges (2011), Maximizing Sensitivity of the Psychomotor Vigilance Test (PVT) to Sleep Loss, *Sleep* | https://doi.org/10.1093/sleep/34.5.581 | The PVT-style reaction test and the convention that a response of 500 ms or slower counts as a lapse. |
| NASA Space Apps 2026: Project Submission Guide | https://www.spaceappschallenge.org/resources/project-submission-guide/ | Submission requirements, including data citations and the AI-use disclosure. |

## 4. Tools and assets

| Name | Link | What we used it for |
|---|---|---|
| Z-Anatomy, the libre 3D atlas of anatomy (CC BY-SA 4.0) | https://github.com/Z-Anatomy/Models-of-human-anatomy | Source of the 3D astronaut body (organs, nerves, vessels, bones). Our model is a modified derivative under the same licence. |
| BodyParts3D, Database Center for Life Science (CC BY-SA 2.1 JP) | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html | The original anatomy model that Z-Anatomy is built on; credited as required. |
| Blender | https://www.blender.org/ | Opening the Z-Anatomy source file and exporting the structures we use. |
| three.js r170 (MIT), with GLTFLoader and OrbitControls | https://threejs.org/ | Showing the 3D body in the browser: loading the model, lighting, rotating and zooming. |
| meshoptimizer (MIT) | https://github.com/zeux/meshoptimizer | Compressing the 3D model to under 1 MB, and decoding it in the browser. |
| IBM Plex Sans, Sans Condensed and Mono (SIL Open Font License 1.1) | https://github.com/IBM/plex | The app's fonts, bundled so it works offline. |
| Python | https://www.python.org/ | The simulator, the live server, data calibration and the validation tests. |
| Node.js | https://nodejs.org/ | Running the web app's automated tests. |
| Google Chrome (headless) | https://www.google.com/chrome/ | Automated checks of layout, functionality and performance. |
| Netlify | https://www.netlify.com/ | Hosting the live website. |
| GitHub | https://github.com/ | Hosting the code and collaborating as a team. |
| Claude Code (AI coding assistant) | https://claude.com/claude-code | Helping write, test and debug the code and its technical documentation. All ideas, design, data choices and submission materials come from the team. |
