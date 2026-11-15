"""Regenerate examples/*.json from the current simulator (default seed and start).

Run from the repo root:  python3 tools/make_examples.py
"""

import json
import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from simulator import Simulation, load_calibration  # noqa: E402


def write(name, data):
    path = ROOT / "examples" / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT))


def main():
    sim = Simulation(load_calibration())
    feed_id = uuid4().hex
    sequence = 0

    def frame():
        nonlocal sequence
        sequence += 1
        return {"feed_id": feed_id, **sim.snapshot(sequence)}

    write("state_normal", frame())
    sim.trigger("high_resting_hr", "astro-2")
    sim.trigger("co2_buildup", "cabin")
    sim.advance(120)
    write("state_alerts", frame())
    sim.clear("high_resting_hr", "astro-2")
    sim.clear("co2_buildup", "cabin")
    sim.advance(120)
    write("state_recovered", frame())
    write("baselines", sim.baselines())


if __name__ == "__main__":
    main()
