# WIASE — Crew Health Console

Team **Super Space Sages** · NASA Space Apps Challenge 2026
Track: *Create Health Monitoring Software for Astronauts on Space Missions*

- Raiyan Bakshi — B.S. Environmental Engineering & Biomedical Engineering, CMU
- Joshua Asamoah — B.S. Physics, CMU

WIASE is a local decision-support console for a three-person deep-space crew. It answers four questions at a glance:
**Who needs attention? What changed from their own baseline? Is the shared cabin also changing? What should be checked next?**

The main dashboard fits on one screen with no scrolling. It has four cards: **Alerts**, **To-do**, **Cabin environment** and
**Crew overview**. **Open ↗** (or a click anywhere on a card) expands it into a full page over a darkened, blurred background. Each astronaut
has a real 3D anatomy model (Z-Anatomy derived). The organs and nerves of any out-of-range body region light up in the alert or
watch colour. On the astronaut page you can orbit, pan and zoom the body like a CAD model. Clicking a coloured point
(green = normal, amber = watch, red = alert, blue = telemetry, grey = no data) explains the problem, shows the live evidence
against that astronaut's personal baseline, and isolates the organs and nerves involved.

> **Synthetic demo, not a medical device.** Crew telemetry is simulated, calibrated against real Earth-study and ISS
> datasets. Nothing here diagnoses, treats or has clinical validation.

## Try it

- **No install:** open the hosted demo (link on the project page) and press **Tour**. It plays a recorded run of the
  simulator in the browser. Chapter jumps replace live scenarios, and check-ins save in your browser only.
- **Live simulator:** follow *Run it* below. The same page detects the server and switches to live data.

## Run it

Needs **Python 3.10+** only — no installs, no API keys, works offline.

```sh
python3 server/server.py --speed 60
```

Open **http://127.0.0.1:8765/**. (Windows: `py server/server.py --speed 60`.) Stop with Ctrl+C.

Options: `--port`, `--seed`, `--start 2030-01-01T08:00:00Z`, `--checkins path/to/file.json`, `--allow-origin URL`.

### Tests

```sh
python3 -m unittest discover -s tests -v     # simulator, server, zone sensors, dose, evaluation, check-ins (16 tests)
node --test tests/web/*.test.mjs             # feed, organs, cabin map, issues, replay + local check-ins, reaction games (Node 18+, 31 tests)
python3 tools/evaluate.py                    # detector validation → docs/VALIDATION.md (~3 min)
python3 tools/record_demo.py                 # re-record web/demo/run.json after simulator changes
```

## What's on screen

The layout follows the team's four-page sketch: one dashboard, and three cards that each expand into a page.

| Dashboard card | Expanded page (**+**) |
|---|---|
| **Top bar** (one row): Deep Space / ISS mode with the one-way delay, UTC mission clock and elapsed time, 1×/10×/60×, Live/Recorded badge, **Simulate** (scenarios, or recorded chapters), Tour, About, Settings/Export | — |
| **Alerts**: all-clear or the count of active alerts, each issue with its response-step progress | **Alerts & data**: trend explorer (HR, BP, reaction time, SpO₂, cabin CO₂/temp) per astronaut plus a crew comparison, and a paged event timeline with acknowledge + note (acknowledging never clears an alert) |
| **To-do**: mission tasks, and a cognitive-test grid (check-in / reaction × P1–P3) | **To-do list**: overall mission + simulated **ground link** (packets arrive after the comms delay), take-test launchers, and a task column per astronaut (check-ins, work blocks, exercise, sleep from the simulator schedule) |
| **Cabin environment**: mini top-view map with sensor radii, CO₂ / temperature / humidity / noise | **Cabin status**: top view of Rest / Work / Systems / Lab with 8 synthetic zone sensors. A sensor past its threshold shows a dashed amber radius; the one driving an active cabin alert shows a solid orange radius. Click a sensor for reading vs expected vs threshold. Also readings and trends. |
| **Crew overview**: one 3D body thumbnail per astronaut with out-of-range structures lit, status, HR/BP/SpO₂, flagged regions. Click a body | **Astronaut page**: facts + personal baselines (left), 3D anatomy with View controls (centre), region details & recommendations in tabs (Readings / Organs & checks / Check-ins), key-measurement trends (bottom) |

**Response steps.** Every active issue gets a response window: alerts, plus watch items such as a telemetry-only signal out of range. Open it from the Alerts card, the Alerts page (Active issues tab) or a region on the astronaut page. The window shows:
- why the issue matters
- what the crew might notice
- the live evidence against expected values and thresholds
- an ordered checklist, each step with an owner (crew member, crew medical officer or whole crew)
- when to escalate and when to re-check
- a note field and an **Acknowledge** button

The steps are non-diagnostic and defer to mission procedures. Acknowledging records the response; it never clears an alert. The protocols live in `web/js/issues.mjs`.

The dashboard and pages never scroll on a laptop or projector (≥ 900 × 600). On phones the cards stack and the page scrolls.
Without WebGL, a 2D figure with the same hotspots replaces the 3D view.

### Body regions

| Point | Live data | Alert rule | Organs & nerves isolated |
|---|---|---|---|
| Brain & nervous system | Sim PVT reaction time, lapses, STAI-S anxiety, last sleep; human check-ins | `cognitive_stress` | Brain, brainstem, spinal cord |
| Heart & autonomic control | Heart rate vs activity-adjusted expected | `heart_rate_high` | Heart, vagus nerve, brainstem |
| Blood pressure | Systolic / diastolic | — (telemetry only → Watch) | Brachial artery, aorta, heart |
| Lungs & breathing | SpO₂ + shared cabin CO₂ (context, not cause) | `co2_high` (cabin) | Lungs, trachea, phrenic nerves |
| Skin & thermoregulation | Cabin temperature + humidity | `cabin_heat_humidity` (cabin) | Skin, peripheral nerves, hypothalamus |
| Hearing | Cabin noise (synthetic) | — | Inner ear, auditory nerve |
| Bone marrow · radiation | Absorbed dose rate (DosTel1) | — (info) | Pelvis/femur marrow, vertebrae |

## Two-minute judge demo

1. Point out the **Live** badge, mission clock at 60×, and the three crew cards — all green against *personal* baselines.
2. Top bar: **Scenario → Cognitive stress → Astronaut 002 → Trigger**, then **Cabin CO₂ buildup → Trigger**. Within seconds 002's
   brain and every crew member's lungs light up in the thumbnails, and the cabin map shows a solid radius on the Work CO₂ sensor.
3. Click **002**. Orbit the body, then click the **Brain** point: the camera focuses, everything else fades, and the readings tab
   lists reaction time, lapses and anxiety vs expected vs threshold. CO₂ is shown as *co-occurring*, never as the cause.
4. Expand **Cabin** and click the glowing sensor. Expand **Alerts** to see opened alerts with reasons, and acknowledge one with a note.
5. On the **Check-ins** tab (or To-do → Take test), run the **reaction test** (45 s; Tap, Go/No-Go and Left/Right games drawn at random each trial — Space, arrow keys or tap) and the **daily check-in**. Human input is labelled separately and never opens alerts.
6. **To-do → Queue ground review** in Deep Space mode. Watch it arrive after 12 simulated minutes; switch to ISS and compare.
7. Let the scenarios expire (or clear them) and watch recovery; **Export** the session JSON.

## Validation

`tools/evaluate.py` runs the same simulator with no scenarios to count false alerts. It then injects each scenario at
staggered times, at full size and at 5–50% of full size, to measure detection rate, time to alert, time to clear and the
smallest change each rule catches. Current results (see [docs/VALIDATION.md](docs/VALIDATION.md)):
- **False alerts:** none in 30 simulated crew-days.
- **Full-size changes:** 80 of 80 detected, with a median time to alert of 15–21 s.
- **Smallest change caught:** heart rate about +28 bpm, CO₂ about +340 ppm, temperature about +2.1 °C. The cognitive
  rule needs the full change, a known limitation.

These are synthetic streams, so this checks the logic, not clinical accuracy.

## Static hosting

Upload the contents of `web/` (including `.htaccess`, which sets the `.mjs`/`.glb` MIME types) to any static host. With
no `/api`, the app plays `web/demo/run.json`, a recorded run of the simulator. `?demo=1` forces the recording, `?tour=1`
starts the guided tour, and `?tour=auto` auto-advances it for screen recording.

## Data and honesty

The workbook `data/Astronaut_Health_Data.xlsx` (Source guide sheet is the provenance authority) calibrates:

| Signal | Source |
|---|---|
| Sleep stages, duration, stage-specific HR | BIDSleep (3 participants) |
| Awake HR, SpO₂, **blood pressure** | Pulse Transit Time PPG, seated rows |
| Reaction time, lapses | OpenNeuro ds004902, normal-sleep sessions |
| State anxiety | QoL_Stress, relaxed phase (STAI-S) |
| Cabin CO₂ / temperature / humidity | NASA EDA, ISS RR-6 daily profile |
| Radiation | NASA RadLab DosTel1 (absorbed dose rate + cumulative absorbed dose; no dose equivalent) |
| Cabin noise | **Synthetic** — no data supplied |
| Cabin zone sensors (map) | **Synthetic**: deterministic offsets of the RR-6 cabin reading; scenarios concentrate in one zone |
| O₂ fraction / pressure | **Assumed** fixed reference, not measured |

The crew are fictional, the daily schedule and scenario effects are synthetic, and baselines combine independent study
participants (not longitudinal astronaut records). Alert thresholds are demo rules (≥ 3 robust spreads or a minimum change,
confirmed over 12 simulated seconds) — **not NASA or clinical limits**. ISS-derived cabin data does not model deep space.

**Indicators from the brief:** heart rate ✔, blood pressure ✔, sleep ✔, mood ✔ (daily check-in), SpO₂ ✔.
Blood sugar and core body temperature are **not included** — no source data was available, and we chose not to invent them.

## Repository layout

```
server/     simulator.py · server.py · checkins.py · calibrate.py · calibration.json   (Python stdlib only)
web/        index.html · styles/ · js/ (app, feed, organs, panels/, body/, checkin/) · models/ (anatomy GLB, CC BY-SA)
            · vendor/three (r170 + OrbitControls, GLTFLoader, meshopt decoder; MIT)
tools/      record_demo.py (static demo recording) · evaluate.py (detector validation) · make_examples.py
data/       Astronaut_Health_Data.xlsx · SOURCES.md (licences + citations; checkins.json is runtime-only, git-ignored)
docs/       architecture & API, data guide, cognition/check-in protocol, validation results
examples/   generated API fixtures (python3 tools/make_examples.py)
tests/      Python unittest + tests/web node:test
planning/   creative process: sketches, colour palettes, and study notes
```

Recalibrate after changing the workbook: `python3 server/calibrate.py data/Astronaut_Health_Data.xlsx`.

## 3D anatomy model

`web/models/astronaut.glb` is a static, meshopt-compressed model. It has 17 meshes named exactly like the keys in
`web/js/organs.mjs → STRUCTURES` (`heart`, `lungs`, `vagus`, …), is 1.78 m tall with the feet at y = 0, and faces +z.
`structures.json` gives each structure's bounding box. The hotspot anchors are derived from it (`anchorsFromStructures`).
`web/js/body/anatomy.mjs` loads it once. The main viewer and the crew thumbnails each get their own painted copy.
If the model can't load, the procedural placeholder in `body/model.mjs` is used; without WebGL, a 2D figure is used.

> 3D anatomy: Z-Anatomy – The libre 3D atlas of anatomy (CC BY-SA 4.0); BodyParts3D – The Database Center for Life Science
> (CC BY-SA 2.1 JP). Modified. See `web/models/LICENSE.txt`. The phrenic nerves are an approximated path. The `ears` object may
> derive from a CC BY-NC-SA inner-ear model, so check it before any commercial use. Share-alike applies to the model files, not the app code.

## Licences, references and AI use

- **Code:** MIT ([LICENSE](LICENSE)).
- **Anatomy model:** CC BY-SA, see above.
- **Datasets:** used under their own licences:
  - BIDSleep: ODC-By 1.0
  - Pulse Transit Time PPG: ODbL 1.0 (the workbook extract is shared under the same terms, with attribution)
  - QoL_Stress: CC BY 4.0
  - OpenNeuro ds004902: CC0
  - NASA OSDR EDA and RadLab: public NASA data
- **Full reference list with citations and DOIs:** [data/SOURCES.md](data/SOURCES.md).
- **AI use:** the concept, design and data choices are the team's. An AI coding assistant (Claude Code) helped write and
  test code and docs, and drove the scripted Blender pipeline that built the anatomy model. There are no AI-generated
  images, video or audio.
