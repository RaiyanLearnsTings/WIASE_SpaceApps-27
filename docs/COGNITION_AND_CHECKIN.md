# Cognitive performance and daily self-report

Implemented demo features, not validated clinical assessments. The simulator already produces synthetic cognition (median RT, lapses, STAI-S score) every 15 simulated seconds during awake work/rest. A human mini-game is a separate input with separate baselines and source labels; do not silently inject it into the simulator.

## Reaction-time check-in (implemented: protocol `reaction-mix-1`)
- **45 seconds, three mini-games drawn at random on every trial** so the test can't be learned or anticipated (never more than two of the same game in a row):
  - **Tap** (PVT-style): a circle appears — press Space or tap.
  - **Go / No-Go**: crimson target (≈60 %) — respond; yellow target — hold back. Pressing on yellow is a *commission* error; holding for 1.2 s is a *correct hold*. Tests response inhibition.
  - **Left / Right**: an arrow appears — press ← / → or tap that half of the panel. The wrong side (or Space) is a *wrong response*. Tests choice reaction.
- Random 1.5–4 s wait before each target; one target at a time; timestamps from `performance.now()` at the animation frame that shows the target. Responses < 100 ms or before the target are false starts; no response within 2 s is a timeout. Repeat keydown is ignored. Leaving the tab marks the session interrupted.
- Scoring (`server/checkins.py`, mirrored in `web/js/checkin/localStore.mjs` and `pvtLogic.mjs`): valid trials, median/mean/SD RT over all valid responses, per-game medians (`by_task`), false starts, timeouts, `errors` (= commissions + wrong responses), correct holds, and lapses (valid responses ≥ 500 ms on Tap/Go trials only — choice RTs are naturally slower). 500 ms is a demo convention borrowed from the PVT, not a validated threshold. Fewer than 5 valid trials = insufficient; missing values are never replaced with 0.
- Each trial stores its game (`task`), delay, RT or null, and outcome. Older single-game sessions (`pvt-lite-1`) remain on record but never join the `reaction-mix-1` baseline.
- Compare repeated sessions within the same person, device and protocol; a personal baseline forms after 5 sufficient, uninterrupted sessions (not medically validated). Browser/device latency, practice effects, time of day and sleep confound interpretation. Do not compare directly with OpenNeuro PVT counts.

## Daily questionnaire (proposed original short items)
Use a 24-hour lookback and 1–5 responses. Display explicit anchors; all scored items are oriented higher = more concern. These are original demo items, not the validated STAI-S/PSS instruments or clinical scales. Allow skip/not applicable; no forced disclosure.

| Item | Prompt | 1 → 5 anchors |
|---|---|---|
| fatigue | How fatigued have you felt today? | Not at all → Extremely |
| sleep_quality | How poor was your most recent sleep? | Not poor at all → Extremely poor |
| stress | How stressed have you felt today? | Not at all → Extremely |
| focus | How difficult has it been to concentrate today? | Not at all difficult → Extremely difficult |
| mood | How low or irritable have you felt today? | Not at all → Extremely |
| discomfort | How much physical discomfort have you experienced today? | None → Extreme |

Optional separate reported sleep duration in hours (0–24), symptoms (headache, dizziness, nausea, shortness of breath, other, none, prefer not to say), and free-text notes. For a real crew protocol, urgent symptoms should route to mission medical procedures, not game/score logic. Show raw items and change from personal baseline; if a summary is desired, compute mean of answered 1–5 items only with at least 4 answers and show completion count, otherwise unavailable. Do not equate it with STAI-S total (20–80). Store one entry per astronaut per date with timestamps, questionnaire_version, responses/nulls, symptom selections, note, source and optional simulated time; permit amendment with clear history. Keep entries private/local; no real medical data required in demo.

## UI acceptance
Complete a game with a keyboard or touch; show valid trial count, median RT and lapses with units; handle false starts, timeout, tab loss and missing values. Complete or skip a questionnaire; show the correct astronaut and time; refresh persistence if implemented. Simulated readings remain visibly distinct. No diagnostic or treatment conclusion.
