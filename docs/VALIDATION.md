# Detector validation (synthetic)

Generated 2026-11-14T21:19:05+00:00 by `python3 tools/evaluate.py`. Seeds [1, 2, 3, 4, 5].

> Synthetic, data-calibrated streams from server/simulator.py. Validates the detection logic (personal baseline, robust spread, 12 s confirmation, 8 s recovery); it is not evidence of clinical accuracy.

## False alerts with no scenario injected

**0 alerts in 30 simulated crew-days** (0.0 per crew-day).

## Detection of injected changes

| Scenario | Rule | Detected | Median time to alert | Worst | Median time to clear after it ends | Missed onsets (sim time) |
|---|---|---|---|---|---|---|
| Elevated resting HR | `heart_rate_high` | 20/20 | 15 s | 16 s | 7 s | — |
| Cognitive stress | `cognitive_stress` | 20/20 | 16 s | 16 s | 8 s | — |
| Cabin CO₂ buildup | `co2_high` | 20/20 | 17 s | 19 s | 5 s | — |
| Warm, humid cabin | `cabin_heat_humidity` | 20/20 | 21 s | 21 s | 3 s | — |

## Sensitivity: how small a change is caught?

The demo scenarios are deliberately large. To find each rule's limit, the same scenarios were injected at a fraction of their size (detected / injected; 15-minute changes, onsets spread across the day).

| Scenario | 5% | 10% | 15% | 25% | 50% | 100% |
|---|---|---|---|---|---|---|
| Elevated resting HR (bpm HR) | +2.75 → 0/6 | +5.5 → 0/6 | +8.25 → 0/6 | +13.75 → 0/6 | +27.5 → 6/6 | +55 → 20/20 |
| Cognitive stress (ms reaction time (+ lapses, anxiety)) | +7.75 → 0/6 | +15.5 → 0/6 | +23.25 → 0/6 | +38.75 → 0/6 | +77.5 → 0/6 | +155 → 20/20 |
| Cabin CO₂ buildup (ppm CO₂) | +67.5 → 0/6 | +135 → 0/6 | +202.5 → 3/6 | +337.5 → 6/6 | +675 → 6/6 | +1350 → 20/20 |
| Warm, humid cabin (°C (+ RH)) | +0.21 → 0/6 | +0.42 → 0/6 | +0.63 → 0/6 | +1.05 → 0/6 | +2.1 → 6/6 | +4.2 → 20/20 |

## How to read this

- Injections cycle every 3 simulated hours, so some land during sleep or exercise. The cognitive rule only samples awake check-ins and the resting-HR scenario only acts during awake rest, so onsets in those windows can be missed by design — they are listed rather than hidden.
- Times include the 12 s confirmation window; clearing includes the 8 s recovery window.
- Zero false alerts reflects the simulator's synthetic noise, which is smaller and better-behaved than real wearable data (motion artefacts, dropouts, drift). The real-world false-alarm rate is unknown.
- Real deployment would need prospective validation on real crew or analog-mission data.
