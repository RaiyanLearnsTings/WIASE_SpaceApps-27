# Architecture and telemetry contract

## Existing architecture
```
Astronaut_Health_Data.xlsx -> calibrate.py -> calibration.json
                                              |
                          Simulation: 3 AstronautBot + CabinBot
                          shared clock + AlertMonitor + scenarios
                                              |
                          server.py / LiveFeed (one state frame)
                           |             |               |
                         SSE           GET state       POST controls
                           |             |               |
                          web/ (WIASE dashboard, ES modules + three.js)
```
The backend uses Python's ThreadingHTTPServer bound to 127.0.0.1, with a synchronized LiveFeed condition. Tick once per wall-clock second; advance one simulated second per internal step, even at 60x. Publish latest frame plus after controls. Browser EventSource reconnects automatically. Existing UI exposes current readings, baseline comparisons, scenarios, active alerts, and recent events. No database, external AI model, persistent history, or authentication in the supplied code.

## HTTP API (as implemented)
Base `http://127.0.0.1:8765`. GET `/` serves demo UI. GET `/api/stream` delivers SSE JSON; GET `/api/state` returns latest frame; GET `/api/baselines` returns calibration metadata; GET `/api/scenarios` returns scenario definitions and limits. POST bodies are JSON objects, return latest full frame, with errors as `{"error":"..."}`. See original README and `examples/`.

| POST endpoint | Body |
|---|---|
| `/api/speed` | `{"speed":60}` (1, 10, 60) |
| `/api/scenarios/trigger` | `{"id":"high_resting_hr","target":"astro-2","duration_seconds":900}` |
| `/api/scenarios/clear` | `{"id":"high_resting_hr","target":"astro-2"}` or `{}` all |
| `/api/reset` | `{}` |

Scenario IDs: `high_resting_hr`, `cognitive_stress` (astronaut target); `co2_buildup`, `warm_humid_cabin` (cabin target or omitted). Durations 60–3600 simulated seconds; default 900. Multiple scenarios can overlap. Reset preserves speed but clears scenarios/history and creates a new run_id. Separate frontend origins must be allowed explicitly via `--allow-origin http://localhost:5173` (match exact origin).

## Frame fields (v1)
Use `examples/state_normal.json` as exact fixture. Top level: `schema_version`, `synthetic`, `feed_id`, `run_id`, `sequence`, `clock`, `astronauts`, `cabin`, `active_scenarios`, `active_alerts`, `alert_events`.
- `clock`: simulated_at (ISO UTC), elapsed_seconds, speed, published_at (wall UTC). Sim starts 2030-01-01 08:00 UTC unless overridden.
- `astronauts[]`: id, name, activity, heart_rate_bpm, spo2_pct, sleep (`stage`, `sleep_so_far_min`, `last_sleep_duration_min`, `last_sleep_efficiency_pct`), cognition (null or sampled_at, median_reaction_time_ms, lapses, state_anxiety_score), comparisons, alert_status. Stage can be null outside sleep; cognitive readings unavailable during sleep/exercise/recovery. Sleep values refer to current or last completed night as named.
- `cabin`: id, co2_ppm, temperature_c, relative_humidity_pct, radiation (`instrument`, `absorbed_dose_rate_ugy_h`, `dose_equivalent_rate_usv_h`, `particle_flux_per_cm2_sr_s`), comparisons, alert_status. Dose equivalent is null in current source; do not convert absorbed dose to equivalent with an assumed factor.
- `comparisons[metric]`: value, expected, spread, delta, robust_z, threshold, direction, threshold_breached, in_recovery_band.
- `active_alerts[]`: alert_id, target, rule, label, opened_at, opened_at_elapsed_seconds, signals (opening comparison evidence). `alert_events[]`: event_id, type (`opened`/`cleared`), at, elapsed_seconds, alert_id, target, rule, label, reason. Event buffer capped at 40. `active_scenarios[]`: id, target, label, started_at_elapsed_seconds, expires_at_elapsed_seconds, remaining_seconds.

### Detection semantics
Expected center is personal and context-aware. Robust spread = max(1.4826 * MAD, floor). Trigger distance = max(3 * spread, metric minimum delta). Heart rate uses sleep-stage or awake activity-specific expected value; cognitive rule requires 2 of 3 signals and fresh samples; heat/humidity requires both. Confirmation 12 simulated seconds, recovery 8 simulated seconds and within 70% of trigger distance; cognitive checks refresh every 15 simulated seconds. Missing cognitive data can clear a prior alert with reason `readings_unavailable`. `watch` means pending threshold confirmation; `alert` means active; `normal` otherwise, not proof of good health. Sleep duration comparisons exist but no alert rule; SpO2/radiation displayed, not alerting. Demo thresholds are not NASA/clinical limits.

## Recommended next architecture (not yet built)
Keep this backend as authoritative; use a lightweight client state adapter with current snapshot, bounded per-target rolling history, event deduplication and connection state. Plot readings against expected values; append only new frames. Keep synthetic time on trend axis. At reset clear per-run history, and do not fabricate samples missed while disconnected. Provide stale badge and last published wall time. Store optional operator notes/check-ins separately with provenance, using browser localStorage for a single-device prototype or small additive server persistence if team needs shared state. Never merge human game measurements into synthetic samples as if identical.

Proposed additional layers: (1) deterministic UI recommendations mapped to rule and evidence; (2) optional mission mode configuration with explicit simulation assumptions; (3) optional export of event/check-in history. If the team has a separate updating JSON file, use an adapter with atomic file writes or polling and normalize to one contract; avoid two competing clocks. Prefer SSE for current code.

## Additions in the merged WIASE build (backward compatible, schema_version still 1)
- `astronauts[].blood_pressure`: `{systolic_mmhg, diastolic_mmhg}` with `comparisons.systolic_mmhg` / `diastolic_mmhg`
  (workbook PPG seated baseline; activity and sleep offsets synthetic). Telemetry only — no alert rule.
- `astronauts[].comparisons.spo2_pct` (direction `low`, minimum change 3 %). Telemetry only.
- `cabin.noise_dba` + `comparisons.noise_dba`, and `cabin.synthetic_fields: ["noise_dba"]` (no source data). Telemetry only.
- Crew display names are "Astronaut 001–003"; IDs unchanged.
- `GET /api/baselines` adds `provenance` (per metric: `workbook` + sheets / `synthetic` / `assumed`) and the synthetic noise baseline.
- Human check-ins (wall clock, separate from simulation):
  - `GET /api/checkins?astronaut=astro-1` → `{reaction:{sessions, baseline, settings}, survey:{entries, baseline, items}}`; without the
    query, the whole store.
  - `POST /api/checkins/reaction` `{astronaut_id, trials:[{delay_ms, rt_ms|null, outcome: valid|false_start|timeout}], duration_ms, interrupted, simulated_at?}` → 201 with server-scored session.
  - `POST /api/checkins/survey` `{astronaut_id, responses:{fatigue,sleep_quality,stress,focus,mood,discomfort: 1–5|null}, sleep_hours?, symptoms?, note?, simulated_at?}` → 201. One entry per astronaut per UTC date; resubmitting amends and keeps history.
  - Stored atomically in `data/checkins.json` (git-ignored; `--checkins` to override).
- Static files are served from `web/` with path-traversal protection; `/api/*` unknown routes return JSON 404.


## Additions (redesign, 2026-11-14)

All additive; `schema_version` stays 1.

- `cabin.sensors[]` — 8 synthetic zone sensors for the top-view map:
  `{id, zone: rest|work|systems|lab, metric, x, y (0–1 plan coords), value, expected, threshold, delta, status: normal|watch}`.
  Each value is the cabin-wide reading plus a deterministic zone offset. Scenario effects are concentrated in one zone
  (`co2_buildup` → Work, then Lab and Rest; `warm_humid_cabin` → Systems). Alerts are still evaluated only on the cabin-wide reading;
  the UI marks a sensor as *alert* only when the matching cabin alert is active and that sensor is furthest past its threshold.
  `cabin.synthetic_fields` now includes `"sensors"`, and `/api/baselines → provenance.sensors` documents it.
- `/api/baselines → astronauts[].schedule` — `{bedtime_minute, exercise_minute, work_blocks_minute}` (minutes of the day),
  used by the To-do page.
- Frontend: `web/models/astronaut.glb` (+ `structures.json`, `structure_info.json`, `LICENSE.txt`) is served as a static file.
