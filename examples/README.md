# Example payloads

These JSON fixtures were generated from the included simulator with its default seed and start, not handwritten. They are static examples, not a live feed. Normal/alert/recovered snapshots are from one run with the same feed ID; wall-clock publication times and generated IDs will differ on new runs. `baselines.json` is from `Simulation.baselines()`.

- `state_normal.json`: initial 08:00 frame
- `state_alerts.json`: after triggering elevated HR on Astronaut 002 and CO2 buildup, advancing 120 simulated seconds
- `state_recovered.json`: after clearing both and advancing another 120 seconds

Try requests against the running server (shell syntax for curl):

```sh
curl http://127.0.0.1:8765/api/state
curl -N http://127.0.0.1:8765/api/stream
curl http://127.0.0.1:8765/api/baselines
curl http://127.0.0.1:8765/api/scenarios
curl -H 'Content-Type: application/json' -d '{"id":"high_resting_hr","target":"astro-2"}' http://127.0.0.1:8765/api/scenarios/trigger
curl -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8765/api/scenarios/clear
```

Regenerate all four with `python3 tools/make_examples.py`. They are also the fixtures for `tests/web`.
