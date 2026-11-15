"""Measure how the WIASE alert rules behave on the data-calibrated simulator.

What it measures (synthetic streams only — this checks the detection logic, not clinical accuracy):
  1. False alerts: alerts opened per simulated crew-day with NO scenario injected.
  2. Detection: each scenario injected at staggered times of day (awake and asleep) —
     detection rate, time from onset to a confirmed alert, and time from the scenario ending to the
     alert clearing (recovery).

    python3 tools/evaluate.py            # writes docs/validation.json and docs/VALIDATION.md
    python3 tools/evaluate.py --quick    # 1 seed, shorter run (used by the unit test)
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))
from simulator import Simulation, load_calibration  # noqa: E402

RULE_FOR = {"high_resting_hr": "heart_rate_high", "cognitive_stress": "cognitive_stress",
            "co2_buildup": "co2_high", "warm_humid_cabin": "cabin_heat_humidity"}
TARGETS = {"high_resting_hr": "astro-1", "cognitive_stress": "astro-2", "co2_buildup": "cabin", "warm_humid_cabin": "cabin"}
SCENARIO_SECONDS = 900   # default scenario length in the app
SPACING = 3 * 3600       # one injection every 3 simulated hours, cycling through the scenarios
CHUNK = 30


class Recorder:
    """Advance a simulation while keeping every alert event (the monitor only keeps the last 40)."""

    def __init__(self, sim):
        self.sim, self.events, self.seen = sim, [], set()

    def advance(self, seconds):
        while seconds > 0:
            step = min(CHUNK, seconds)
            self.sim.advance(step)
            seconds -= step
            for e in self.sim.monitor.events:
                if e["event_id"] not in self.seen:
                    self.seen.add(e["event_id"])
                    self.events.append(e)


def false_alerts(seed, days):
    rec = Recorder(Simulation(load_calibration(), seed=seed))
    rec.advance(int(days * 86400))
    return [e for e in rec.events if e["type"] == "opened"]


def detection(seed, injections, intensity=1.0, spacing=SPACING):
    sim = Simulation(load_calibration(), seed=seed)
    rec = Recorder(sim)
    names = list(RULE_FOR)
    trials = []
    for k in range(injections):
        scenario = names[k % len(names)]
        rec.advance(spacing - SCENARIO_SECONDS)
        start, clock = sim.elapsed, sim.now
        sim.trigger(scenario, TARGETS[scenario], SCENARIO_SECONDS, intensity=intensity)
        rec.advance(SCENARIO_SECONDS)
        end = sim.elapsed
        rec.advance(600)  # allow recovery
        rule, target = RULE_FOR[scenario], TARGETS[scenario]
        opened = next((e for e in rec.events if e["type"] == "opened" and e["rule"] == rule and e["target"] == target
                       and start <= e["elapsed_seconds"] <= end), None)
        cleared = opened and next((e for e in rec.events if e["type"] == "cleared" and e["rule"] == rule
                                   and e["target"] == target and e["elapsed_seconds"] >= end), None)
        trials.append({"scenario": scenario, "seed": seed, "onset_sim_time": clock[11:16], "detected": bool(opened),
                       "time_to_alert_s": opened["elapsed_seconds"] - start if opened else None,
                       "time_to_clear_after_end_s": cleared["elapsed_seconds"] - end if cleared else None})
    return trials


def summarize(trials, false_events, crew_days):
    out = {}
    for scenario in RULE_FOR:
        rows = [t for t in trials if t["scenario"] == scenario]
        hit = [t for t in rows if t["detected"]]
        alert_times = [t["time_to_alert_s"] for t in hit]
        clear_times = [t["time_to_clear_after_end_s"] for t in hit if t["time_to_clear_after_end_s"] is not None]
        out[scenario] = {
            "rule": RULE_FOR[scenario], "injections": len(rows), "detected": len(hit),
            "detection_rate": round(len(hit) / len(rows), 3) if rows else None,
            "median_time_to_alert_s": median(alert_times) if alert_times else None,
            "max_time_to_alert_s": max(alert_times) if alert_times else None,
            "median_time_to_clear_s": median(clear_times) if clear_times else None,
            "missed_onsets": [t["onset_sim_time"] for t in rows if not t["detected"]],
        }
    by_rule = {}
    for e in false_events:
        by_rule[e["rule"]] = by_rule.get(e["rule"], 0) + 1
    return {
        "false_alerts": {"crew_days": crew_days, "total": len(false_events), "per_crew_day": round(len(false_events) / crew_days, 3),
                         "by_rule": by_rule},
        "scenarios": out,
    }


# Physical size of each scenario at intensity 1.0 (from server/simulator.py).
MAGNITUDE = {"high_resting_hr": (55, "bpm HR"), "cognitive_stress": (155, "ms reaction time (+ lapses, anxiety)"),
             "co2_buildup": (1350, "ppm CO₂"), "warm_humid_cabin": (4.2, "°C (+ RH)")}
SWEEP = [0.05, 0.1, 0.15, 0.25, 0.5]


def sweep(seeds, per_scenario):
    out = {k: [] for k in RULE_FOR}
    for intensity in SWEEP:
        trials = [t for s in seeds for t in detection(s, 4 * per_scenario, intensity, spacing=5400)]
        for k in RULE_FOR:
            rows = [t for t in trials if t["scenario"] == k]
            hit = [t for t in rows if t["detected"]]
            out[k].append({"intensity": intensity, "change": round(MAGNITUDE[k][0] * intensity, 2),
                           "detected": len(hit), "injections": len(rows),
                           "median_time_to_alert_s": median([t["time_to_alert_s"] for t in hit]) if hit else None})
    return out


def run(seeds, days, injections, sweep_seeds=(1, 2, 3), per_scenario=2):
    false_events = [e for s in seeds for e in false_alerts(s, days)]
    trials = [t for s in seeds for t in detection(s, injections)]
    crew_days = len(seeds) * days * 3  # three astronauts (the cabin shares the same clock)
    return {
        "sensitivity": sweep(list(sweep_seeds), per_scenario),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "method": {"seeds": seeds, "clean_days_per_seed": days, "injections_per_seed": injections,
                   "scenario_seconds": SCENARIO_SECONDS, "spacing_seconds": SPACING,
                   "note": "Synthetic, data-calibrated streams from server/simulator.py. Validates the detection "
                           "logic (personal baseline, robust spread, 12 s confirmation, 8 s recovery); it is not "
                           "evidence of clinical accuracy."},
        **summarize(trials, false_events, crew_days),
        "trials": trials,
    }


LABEL = {"high_resting_hr": "Elevated resting HR", "cognitive_stress": "Cognitive stress",
         "co2_buildup": "Cabin CO₂ buildup", "warm_humid_cabin": "Warm, humid cabin"}


def markdown(r):
    fa = r["false_alerts"]
    lines = [
        "# Detector validation (synthetic)", "",
        f"Generated {r['generated_utc']} by `python3 tools/evaluate.py`. Seeds {r['method']['seeds']}.", "",
        "> " + r["method"]["note"], "",
        "## False alerts with no scenario injected", "",
        f"**{fa['total']} alerts in {fa['crew_days']} simulated crew-days** ({fa['per_crew_day']} per crew-day)"
        + (f" — by rule: {fa['by_rule']}" if fa["by_rule"] else "") + ".", "",
        "## Detection of injected changes", "",
        "| Scenario | Rule | Detected | Median time to alert | Worst | Median time to clear after it ends | Missed onsets (sim time) |",
        "|---|---|---|---|---|---|---|",
    ]
    for k, s in r["scenarios"].items():
        f = lambda v: "—" if v is None else f"{v:.0f} s"  # noqa: E731
        lines.append(f"| {LABEL[k]} | `{s['rule']}` | {s['detected']}/{s['injections']} | {f(s['median_time_to_alert_s'])} | "
                     f"{f(s['max_time_to_alert_s'])} | {f(s['median_time_to_clear_s'])} | {', '.join(s['missed_onsets']) or '—'} |")
    lines += ["", "## Sensitivity: how small a change is caught?", "",
              "The demo scenarios are deliberately large. To find each rule's limit, the same scenarios were injected at "
              "a fraction of their size (detected / injected; 15-minute changes, onsets spread across the day).", "",
              "| Scenario | " + " | ".join(f"{int(i * 100)}%" for i in SWEEP) + " | 100% |",
              "|---|" + "---|" * (len(SWEEP) + 1)]
    for k, rows in r["sensitivity"].items():
        full = r["scenarios"][k]
        unit = MAGNITUDE[k][1]
        cells = [f"+{row['change']:g} → {row['detected']}/{row['injections']}" for row in rows]
        cells.append(f"+{MAGNITUDE[k][0]:g} → {full['detected']}/{full['injections']}")
        lines.append(f"| {LABEL[k]} ({unit}) | " + " | ".join(cells) + " |")
    lines += ["", "## How to read this", "",
              "- Injections cycle every 3 simulated hours, so some land during sleep or exercise. The cognitive rule only "
              "samples awake check-ins and the resting-HR scenario only acts during awake rest, so onsets in those windows "
              "can be missed by design — they are listed rather than hidden.",
              "- Times include the 12 s confirmation window; clearing includes the 8 s recovery window.",
              "- Zero false alerts reflects the simulator's synthetic noise, which is smaller and better-behaved than real "
              "wearable data (motion artefacts, dropouts, drift). The real-world false-alarm rate is unknown.",
              "- Real deployment would need prospective validation on real crew or analog-mission data."]
    return "\n".join(lines) + "\n"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--quick", action="store_true")
    a = p.parse_args()
    r = run([1], 0.5, 4, sweep_seeds=(1,), per_scenario=1) if a.quick else run([1, 2, 3, 4, 5], 2, 16)
    if a.quick:
        print(json.dumps({k: v for k, v in r.items() if k != "trials"}, indent=2))
        return
    (ROOT / "docs" / "validation.json").write_text(json.dumps(r, indent=2), encoding="utf-8")
    (ROOT / "web" / "demo").mkdir(parents=True, exist_ok=True)
    (ROOT / "web" / "demo" / "validation.json").write_text(json.dumps({k: v for k, v in r.items() if k != "trials"}, indent=2), encoding="utf-8")
    (ROOT / "docs" / "VALIDATION.md").write_text(markdown(r), encoding="utf-8")
    print(markdown(r))


if __name__ == "__main__":
    main()
