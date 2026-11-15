"""Record a scripted simulator run for the static (no-server) demo: web/demo/run.json.

Runs the exact same Simulation the live server uses, applies a fixed scenario timeline, and stores
frames every STEP simulated seconds plus chapter markers. Alert events are stored as deltas (only new
events per frame) to keep the file small; the browser feed de-duplicates by event_id anyway.

    python3 tools/record_demo.py            # writes web/demo/run.json
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from simulator import SCENARIOS, MIN_SCENARIO_SECONDS, MAX_SCENARIO_SECONDS, Simulation, load_calibration  # noqa: E402

STEP = 20          # simulated seconds between stored frames
DURATION = 7200    # two simulated hours (08:00 -> 10:00)
# (start, scenario, target, duration) in simulated seconds from the start of the run
TIMELINE = [
    (900, "cognitive_stress", "astro-2", 1800),
    (2100, "co2_buildup", "cabin", 1800),
    (3300, "warm_humid_cabin", "cabin", 1500),
]
CHAPTERS = [
    {"id": "baseline", "label": "Baseline day", "at": 0,
     "description": "All three astronauts and the cabin are inside their personal ranges."},
    {"id": "cognitive_stress", "label": "Cognitive stress · Astronaut 002", "at": 1020,
     "description": "Slower reaction time, more lapses and higher anxiety on 002's check-ins open a cognitive-stress alert."},
    {"id": "co2_buildup", "label": "Cabin CO₂ buildup", "at": 2280,
     "description": "CO₂ climbs, worst in the Work module. The shared cabin alert lights every crew member's lungs."},
    {"id": "warm_humid_cabin", "label": "Warm, humid cabin", "at": 3480,
     "description": "Temperature and humidity rise together (Systems module first) and the thermal alert opens."},
    {"id": "recovery", "label": "Recovery", "at": 5700,
     "description": "Scenarios end; readings return inside the recovery band and alerts close."},
]


def round_floats(value, digits=3):
    if isinstance(value, float):
        return round(value, digits)
    if isinstance(value, list):
        return [round_floats(v, digits) for v in value]
    if isinstance(value, dict):
        return {k: round_floats(v, digits) for k, v in value.items()}
    return value


def record(seed=42):
    sim = Simulation(load_calibration(), seed=seed)
    sim.speed = 60
    pending = sorted(TIMELINE)
    frames, seen = [], set()
    for elapsed in range(0, DURATION + 1, STEP):
        while pending and pending[0][0] <= elapsed:
            _, scenario, target, duration = pending.pop(0)
            assert MIN_SCENARIO_SECONDS <= duration <= MAX_SCENARIO_SECONDS
            sim.trigger(scenario, target, duration)
        if elapsed:
            sim.advance(STEP)
        frame = sim.snapshot(len(frames) + 1)
        new_events = [e for e in frame["alert_events"] if e["event_id"] not in seen]
        seen.update(e["event_id"] for e in new_events)
        frame["alert_events"] = new_events
        frame["feed_id"] = "recorded-demo"
        frame["recorded"] = True
        frames.append(round_floats(frame))
    return {
        "schema_version": 1,
        "recorded": True,
        "note": "Pre-recorded run of server/simulator.py for the static demo; synthetic data.",
        "step_seconds": STEP,
        "duration_seconds": DURATION,
        "seed": seed,
        "chapters": CHAPTERS,
        "scenarios": [{"id": k, **v} for k, v in SCENARIOS.items()],
        "durations": {"min_seconds": MIN_SCENARIO_SECONDS, "max_seconds": MAX_SCENARIO_SECONDS},
        "baselines": round_floats(sim.baselines()),
        "frames": frames,
    }


def main():
    out = ROOT / "web" / "demo" / "run.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = record()
    out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    opened = sum(e["kind"] == "opened" if "kind" in e else e.get("type") == "opened" for f in data["frames"] for e in f["alert_events"])
    print(f"wrote {out.relative_to(ROOT)}: {len(data['frames'])} frames, {out.stat().st_size / 1e6:.2f} MB, {opened} alerts opened")


if __name__ == "__main__":
    main()
