"""Generate synthetic crew and cabin telemetry on one simulated clock."""

import json
import math
import random
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

UTC = timezone.utc
DEFAULT_START = datetime(2030, 1, 1, 8, tzinfo=UTC)
SPEEDS = (1, 10, 60)
SLEEP_STAGES = {"N1", "N2", "N3", "REM"}
SCORED_STAGES = SLEEP_STAGES | {"Wake"}
COGNITIVE_FIELDS = ("median_reaction_time_ms", "lapses", "state_anxiety_score")
CABIN_FIELDS = ("co2_ppm", "temperature_c", "relative_humidity_pct")
SCENARIOS = {
    "high_resting_hr": {
        "label": "Elevated resting heart rate", "scope": "astronaut",
        "description": "Raises the selected astronaut’s heart rate during awake rest.",
    },
    "cognitive_stress": {
        "label": "Cognitive stress", "scope": "astronaut",
        "description": "Slows reaction time and raises lapses and state anxiety on a simulated check-in.",
    },
    "co2_buildup": {
        "label": "Cabin CO₂ buildup", "scope": "cabin",
        "description": "Raises cabin CO₂ as in a ventilation or removal problem.",
    },
    "warm_humid_cabin": {
        "label": "Warm, humid cabin", "scope": "cabin",
        "description": "Raises cabin temperature and relative humidity together.",
    },
}
CONFIRM_SECONDS = 12
RECOVERY_SECONDS = 8
COGNITIVE_INTERVAL_SECONDS = 15
DEFAULT_SCENARIO_SECONDS = 900
MIN_SCENARIO_SECONDS = 60
MAX_SCENARIO_SECONDS = 3600

# Cabin noise has no source in the workbook. These values are an explicit demo assumption so the
# dashboard can show an acoustic channel; they are labelled "synthetic" everywhere they appear.
SYNTHETIC_NOISE_BASELINE = {"center": 58.0, "spread": 1.5, "sample_count": 0}
SYNTHETIC_NOISE_MIN_DELTA = 6

# Where every published number comes from. The dashboard shows these tags next to readings.
PROVENANCE = {
    "heart_rate_bpm": {"source": "workbook", "sheets": ["PPG activities", "Sleep epochs"],
                       "note": "Seated cuff HR (awake) and BIDSleep stage HR (asleep); dynamics synthetic."},
    "spo2_pct": {"source": "workbook", "sheets": ["PPG activities"], "note": "Seated oximeter SpO2; dynamics synthetic."},
    "blood_pressure": {"source": "workbook", "sheets": ["PPG activities"],
                       "note": "Seated cuff systolic/diastolic; activity and sleep offsets are synthetic."},
    "sleep": {"source": "workbook", "sheets": ["Sleep nights", "Sleep epochs"], "note": "BIDSleep template night per person."},
    "median_reaction_time_ms": {"source": "workbook", "sheets": ["Sleep deprivation"], "note": "OpenNeuro ds004902 normal-sleep PVT."},
    "lapses": {"source": "workbook", "sheets": ["Sleep deprivation"], "note": "OpenNeuro ds004902 normal-sleep PVT."},
    "state_anxiety_score": {"source": "workbook", "sheets": ["QoL stress"], "note": "QoL_Stress relaxed-phase STAI-S."},
    "co2_ppm": {"source": "workbook", "sheets": ["Cabin environment"], "note": "NASA EDA RR-6 ISS cabin daily profile."},
    "temperature_c": {"source": "workbook", "sheets": ["Cabin environment"], "note": "NASA EDA RR-6 ISS cabin daily profile."},
    "relative_humidity_pct": {"source": "workbook", "sheets": ["Cabin environment"], "note": "NASA EDA RR-6 ISS cabin daily profile."},
    "radiation": {"source": "workbook", "sheets": ["Radiation"],
                  "note": "NASA RadLab DosTel1 5-min medians; cumulative absorbed dose is the rate integrated over "
                          "simulated time since run start. Dose equivalent absent and not estimated."},
    "noise_dba": {"source": "synthetic", "sheets": [], "note": "No noise data supplied; demo assumption only."},
    "sensors": {"source": "synthetic", "sheets": [],
                "note": "Zone sensors are deterministic offsets of the measured cabin profile; scenario effects are "
                        "concentrated in one zone. Alerts are evaluated on the cabin-wide reading only."},
    "o2_and_pressure": {"source": "assumed", "sheets": [], "note": "Fixed 21% O2 / 101.3 kPa reference; not measured."},
}


# Synthetic zone sensors for the top-view cabin map. x/y are normalized floor-plan coordinates
# (0..1, origin top-left). "co2"/"heat" weight how strongly a cabin scenario shows at that sensor;
# phase/amp give a small, deterministic local variation so sensors are not identical copies.
CABIN_SENSORS = (
    {"id": "rest-co2", "zone": "rest", "metric": "co2_ppm", "x": 0.14, "y": 0.2, "co2": 0.45, "heat": 0.5, "phase": 0.3, "amp": 25},
    {"id": "rest-temp", "zone": "rest", "metric": "temperature_c", "x": 0.26, "y": 0.32, "co2": 0, "heat": 0.55, "phase": 1.1, "amp": 0.12},
    {"id": "work-co2", "zone": "work", "metric": "co2_ppm", "x": 0.6, "y": 0.18, "co2": 1.25, "heat": 0.7, "phase": 2.0, "amp": 30},
    {"id": "work-noise", "zone": "work", "metric": "noise_dba", "x": 0.84, "y": 0.3, "co2": 0, "heat": 0.9, "phase": 2.7, "amp": 0.6},
    {"id": "sys-temp", "zone": "systems", "metric": "temperature_c", "x": 0.12, "y": 0.62, "co2": 0, "heat": 1.3, "phase": 3.3, "amp": 0.1},
    {"id": "sys-rh", "zone": "systems", "metric": "relative_humidity_pct", "x": 0.2, "y": 0.84, "co2": 0, "heat": 1.3, "phase": 4.1, "amp": 0.6},
    {"id": "lab-co2", "zone": "lab", "metric": "co2_ppm", "x": 0.56, "y": 0.7, "co2": 0.85, "heat": 0.6, "phase": 4.8, "amp": 20},
    {"id": "lab-temp", "zone": "lab", "metric": "temperature_c", "x": 0.8, "y": 0.82, "co2": 0, "heat": 0.75, "phase": 5.6, "amp": 0.1},
)
# Per-unit scenario effect for each metric (matches the cabin-wide effect sizes in CabinBot.sample).
SENSOR_EFFECT = {"co2_ppm": ("co2", 1350), "temperature_c": ("heat", 4.2),
                 "relative_humidity_pct": ("heat", 22), "noise_dba": ("heat", 5)}
SENSOR_DIGITS = {"co2_ppm": 0, "temperature_c": 2, "relative_humidity_pct": 1, "noise_dba": 1}


def utc_string(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_calibration():
    return json.loads(Path(__file__).with_name("calibration.json").read_text(encoding="utf-8"))


def compare(value, baseline, minimum_delta, *, direction="high", offset=0):
    """Compare a single observation with its contextual baseline."""
    center = round(baseline["center"] + offset, 2)
    spread = baseline["spread"]
    delta = round(value - center, 2)
    limit = round(max(3 * spread, minimum_delta), 2)
    oriented = delta if direction == "high" else -delta
    return {
        "value": value,
        "expected": center,
        "spread": spread,
        "delta": delta,
        "robust_z": round(delta / spread, 2),
        "threshold": round(center + (limit if direction == "high" else -limit), 2),
        "direction": direction,
        "threshold_breached": oriented >= limit,
        "in_recovery_band": oriented <= 0.7 * limit,
    }


class AlertMonitor:
    def __init__(self):
        self.pending = {}
        self.recovering = {}
        self.active = {}
        self.events = deque(maxlen=40)
        self.next_event = 1

    def update(self, now, elapsed, target, rule, label, signals, required=1, sampled_at=None):
        key = (target, rule)
        if len(signals) < required:
            self.pending.pop(key, None)
            self.recovering.pop(key, None)
            alert = self.active.pop(key, None)
            if alert:
                self.record("cleared", now, elapsed, alert, "readings_unavailable")
            return

        breaches = sum(result["threshold_breached"] for result in signals.values())
        still_elevated = sum(not result["in_recovery_band"] for result in signals.values())
        if key in self.active:
            if still_elevated >= required:
                self.recovering.pop(key, None)
                return
            since, first_sample = self.recovering.setdefault(key, (elapsed, sampled_at))
            if elapsed - since >= RECOVERY_SECONDS and (sampled_at is None or sampled_at != first_sample):
                alert = self.active.pop(key)
                self.recovering.pop(key)
                self.record("cleared", now, elapsed, alert, "returned_to_baseline")
            return

        if breaches < required:
            self.pending.pop(key, None)
            return
        since, first_sample = self.pending.setdefault(key, (elapsed, sampled_at))
        if elapsed - since < CONFIRM_SECONDS or (sampled_at is not None and sampled_at == first_sample):
            return
        self.pending.pop(key)
        alert = {
            "alert_id": self.next_event,
            "target": target,
            "rule": rule,
            "label": label,
            "opened_at": now,
            "opened_at_elapsed_seconds": elapsed,
            "signals": {name: result for name, result in signals.items() if result["threshold_breached"]},
        }
        self.active[key] = alert
        self.record("opened", now, elapsed, alert, "threshold_exceeded")

    def record(self, event, now, elapsed, alert, reason):
        self.events.append({
            "event_id": self.next_event, "type": event, "at": now, "elapsed_seconds": elapsed,
            "alert_id": alert["alert_id"], "target": alert["target"],
            "rule": alert["rule"], "label": alert["label"], "reason": reason,
        })
        self.next_event += 1

    def status(self, target):
        if any(entity == target for entity, _ in self.active):
            return "alert"
        if any(entity == target for entity, _ in self.pending):
            return "watch"
        return "normal"


class AstronautBot:
    def __init__(self, profile, limits, seed):
        self.profile = profile
        self.id = profile["id"]
        self.name = profile["name"]
        self.baseline = profile["baseline"]
        self.limits = limits
        self.rng = random.Random(seed)
        # Separate stream so adding blood pressure does not change the original HR/cognition sequence.
        self.bp_rng = random.Random(seed + 1)
        self.phase = self.rng.uniform(0, math.tau)
        self.stages = [stage for stage, length in profile["sleep_stage_runs"] for _ in range(length)]
        asleep = sum(stage in SLEEP_STAGES for stage in self.stages)
        scored = sum(stage in SCORED_STAGES for stage in self.stages)
        self.completed_sleep = asleep / 2
        self.sleep_efficiency = round(100 * asleep / scored, 1)
        self.sleep_seconds = 0
        self.scored_seconds = 0
        self.previous_stage = None
        self.cognition = None
        self.last_cognitive_elapsed = -COGNITIVE_INTERVAL_SECONDS
        self.last_stress_mode = False

    def schedule(self, minute):
        since_bed = (minute - self.profile["bedtime_minute"]) % 1440
        epoch = int(since_bed * 2)
        if epoch < len(self.stages):
            stage = self.stages[epoch]
            return ("sleeping" if stage in SLEEP_STAGES else "awake_in_bed"), stage, 0

        since_exercise = minute - self.profile["exercise_minute"]
        if 0 <= since_exercise < 25:
            return "exercising", None, 43
        if 25 <= since_exercise < 40:
            return "recovering", None, 32 * (40 - since_exercise) / 15
        if 8.25 * 60 <= minute < 11.75 * 60 or 13.5 * 60 <= minute < 17.25 * 60:
            return "working", None, 6
        return "resting", None, 0

    def track_sleep(self, minute, elapsed, scheduled_stage, current_stage):
        if self.previous_stage is not None:
            self.sleep_seconds += self.previous_stage in SLEEP_STAGES
            self.scored_seconds += self.previous_stage in SCORED_STAGES
            if scheduled_stage is None:
                self.completed_sleep = round(self.sleep_seconds / 60, 1)
                self.sleep_efficiency = (
                    round(100 * self.sleep_seconds / self.scored_seconds, 1) if self.scored_seconds else None
                )
                self.sleep_seconds = self.scored_seconds = 0
        if scheduled_stage is not None and elapsed == 0:
            # A run can start partway through a night. Seed the preceding interval from its template.
            seconds_since_bed = round(((minute - self.profile["bedtime_minute"]) % 1440) * 60)
            preceding_epochs, remainder = divmod(seconds_since_bed, 30)
            prior = self.stages[:preceding_epochs]
            self.sleep_seconds = 30 * sum(stage in SLEEP_STAGES for stage in prior)
            self.scored_seconds = 30 * sum(stage in SCORED_STAGES for stage in prior)
            self.sleep_seconds += remainder * (scheduled_stage in SLEEP_STAGES)
            self.scored_seconds += remainder * (scheduled_stage in SCORED_STAGES)
        self.previous_stage = (current_stage or "Wake") if scheduled_stage is not None else None
        return round(self.sleep_seconds / 60, 1) if scheduled_stage is not None else None

    def cognitive_reading(self, now, elapsed, activity, stress):
        if activity in {"sleeping", "awake_in_bed", "exercising", "recovering"}:
            self.cognition = None
            return None
        due = elapsed - self.last_cognitive_elapsed >= COGNITIVE_INTERVAL_SECONDS
        if self.cognition is None or due or stress != self.last_stress_mode:
            baseline = self.baseline
            self.cognition = {
                "sampled_at": now,
                "median_reaction_time_ms": round(baseline["median_reaction_time_ms"]["center"]
                                                 + self.rng.uniform(-13, 13) + 155 * stress),
                "lapses": max(0, round(baseline["lapses"]["center"]) + self.rng.choice((-1, 0, 0, 1))
                              + round(11 * stress)),
                "state_anxiety_score": min(80, max(20, round(baseline["state_anxiety_score"]["center"]
                                                             + self.rng.uniform(-3, 3) + 30 * stress))),
            }
            self.last_cognitive_elapsed = elapsed
            self.last_stress_mode = stress
        return self.cognition

    def sample(self, now, elapsed, minute, heart_effect, stress):
        activity, scheduled_stage, activity_offset = self.schedule(minute)
        stage = scheduled_stage
        if heart_effect is not None:
            activity, stage, activity_offset = "resting", None, 0
        elif stress and activity not in {"resting", "working"}:
            activity, stage, activity_offset = "working", None, 6
        sleep_so_far = self.track_sleep(minute, elapsed, scheduled_stage, stage)

        baseline = self.baseline
        hr_baseline = baseline["sleep_hr_by_stage"].get(stage, baseline["heart_rate_bpm"])
        hr = round(hr_baseline["center"] + activity_offset + 2.3 * math.sin(elapsed / 57 + self.phase)
                   + self.rng.uniform(-1.5, 1.5) + 55 * (heart_effect or 0), 1)
        spo2 = round(min(100, max(0, baseline["spo2_pct"]["center"] + self.rng.uniform(-0.5, 0.5))), 1)
        cognition = self.cognitive_reading(now, elapsed, activity, stress)
        # Synthetic dynamics around the workbook seated baseline: nocturnal dipping while asleep,
        # a rise proportional to the activity HR offset while awake. Telemetry only, no alert rule.
        asleep = stage in SLEEP_STAGES
        systolic_offset = -10 if asleep else 0.6 * activity_offset
        diastolic_offset = -6 if asleep else 0.25 * activity_offset
        systolic = round(baseline["systolic_mmhg"]["center"] + systolic_offset + self.bp_rng.uniform(-2.5, 2.5))
        diastolic = round(baseline["diastolic_mmhg"]["center"] + diastolic_offset + self.bp_rng.uniform(-2, 2))
        comparisons = {
            "heart_rate_bpm": compare(hr, hr_baseline, self.limits["heart_rate_bpm"], offset=activity_offset),
            "spo2_pct": compare(spo2, baseline["spo2_pct"], self.limits["spo2_pct"], direction="low"),
            "systolic_mmhg": compare(systolic, baseline["systolic_mmhg"], self.limits["systolic_mmhg"],
                                     offset=systolic_offset),
            "diastolic_mmhg": compare(diastolic, baseline["diastolic_mmhg"], self.limits["diastolic_mmhg"],
                                      offset=diastolic_offset),
            "last_sleep_duration_min": compare(self.completed_sleep, baseline["sleep_duration_min"],
                                               self.limits["sleep_duration_min"], direction="low"),
        }
        if cognition:
            for field in COGNITIVE_FIELDS:
                comparisons[field] = compare(cognition[field], baseline[field], self.limits[field])

        return {
            "id": self.id,
            "name": self.name,
            "activity": activity,
            "heart_rate_bpm": hr,
            "spo2_pct": spo2,
            "blood_pressure": {"systolic_mmhg": systolic, "diastolic_mmhg": diastolic},
            "sleep": {
                "stage": stage,
                "sleep_so_far_min": sleep_so_far,
                "last_sleep_duration_min": self.completed_sleep,
                "last_sleep_efficiency_pct": self.sleep_efficiency,
            },
            "cognition": cognition,
            "comparisons": comparisons,
        }


class CabinBot:
    id = "cabin"

    def __init__(self, profile, limits, instrument):
        self.profile = profile["profile"]
        self.radiation = profile["radiation"]
        self.baseline = profile["baseline"]
        self.limits = limits
        self.instrument = instrument

    def sample(self, elapsed, minute, co2_effect, heat_effect):
        index = int(minute // 5)
        fraction = (minute % 5) / 5
        first, second = self.profile[index], self.profile[(index + 1) % len(self.profile)]
        co2, temp, humidity = [a + (b - a) * fraction for a, b in zip(first[1:], second[1:])]
        co2 = round(co2 + 10 * math.sin(elapsed / 43) + 1350 * co2_effect)
        temp = round(temp + 0.07 * math.sin(elapsed / 79) + 4.2 * heat_effect, 2)
        humidity = round(min(100, max(0, humidity + 0.3 * math.sin(elapsed / 55) + 22 * heat_effect)), 1)
        _, dose_rate, equivalent_rate, flux = self.radiation[index]
        measurements = dict(zip(CABIN_FIELDS, (co2, temp, humidity)))
        # Synthetic: louder during the working day and when fans work harder in a warm cabin.
        working_hours = 8.25 * 60 <= minute < 17.25 * 60
        noise = round(SYNTHETIC_NOISE_BASELINE["center"] + (2.5 if working_hours else -1.5)
                      + 0.8 * math.sin(elapsed / 31) + 5 * heat_effect, 1)
        comparisons = {field: compare(value, self.baseline[field], self.limits[field])
                       for field, value in measurements.items()}
        comparisons["noise_dba"] = compare(noise, SYNTHETIC_NOISE_BASELINE, SYNTHETIC_NOISE_MIN_DELTA)
        effects = {"co2": co2_effect, "heat": heat_effect}
        readings = {**measurements, "noise_dba": noise}
        sensors = []
        for spec in CABIN_SENSORS:
            metric = spec["metric"]
            kind, size = SENSOR_EFFECT[metric]
            # Replace the cabin-wide share of the scenario with this zone's share, plus local variation.
            value = (readings[metric] + (spec[kind] - 1) * size * effects[kind]
                     + spec["amp"] * math.sin(elapsed / 97 + spec["phase"]))
            if metric == "relative_humidity_pct":
                value = min(100, max(0, value))
            value = round(value, SENSOR_DIGITS[metric]) if SENSOR_DIGITS[metric] else round(value)
            if metric == "noise_dba":
                check = compare(value, SYNTHETIC_NOISE_BASELINE, SYNTHETIC_NOISE_MIN_DELTA)
            else:
                check = compare(value, self.baseline[metric], self.limits[metric])
            sensors.append({
                "id": spec["id"], "zone": spec["zone"], "metric": metric, "x": spec["x"], "y": spec["y"],
                "value": value, "expected": check["expected"], "threshold": check["threshold"],
                "delta": check["delta"], "status": "watch" if check["threshold_breached"] else "normal",
            })
        return {
            "id": self.id,
            **measurements,
            "noise_dba": noise,
            "synthetic_fields": ["noise_dba", "sensors"],
            "radiation": {
                "instrument": self.instrument,
                "absorbed_dose_rate_ugy_h": dose_rate,
                "dose_equivalent_rate_usv_h": equivalent_rate,
                "particle_flux_per_cm2_sr_s": flux,
            },
            "comparisons": comparisons,
            "sensors": sensors,
        }


class Simulation:
    def __init__(self, calibration, seed=42, start=DEFAULT_START):
        self.calibration = calibration
        self.seed = seed
        self.start = start
        self.speed = 1
        self.reset()

    def reset(self):
        self.run_id = uuid4().hex
        self.elapsed = 0
        self.dose_ugy = 0.0  # cumulative absorbed dose since run start (RadLab DosTel1 rate integrated over sim time)
        self.dose_elapsed = 0
        self.scenarios = {}
        self.intensity = {}  # scenario key -> effect multiplier (1.0 = the demo magnitude); used by tools/evaluate.py
        self.monitor = AlertMonitor()
        limits = self.calibration["minimum_deltas"]
        self.crew = [AstronautBot(person, limits, self.seed + 97 * i)
                     for i, person in enumerate(self.calibration["crew"], 1)]
        self.cabin = CabinBot(self.calibration["cabin"], limits, self.calibration["source_radiation_instrument"])
        self.sample()

    def set_speed(self, speed):
        if type(speed) is not int or speed not in SPEEDS:
            raise ValueError("Speed must be one of 1, 10 or 60.")
        self.speed = speed

    def scenario_key(self, id_, target):
        if not isinstance(id_, str) or id_ not in SCENARIOS:
            raise ValueError("Unknown scenario ID.")
        if SCENARIOS[id_]["scope"] == "cabin":
            if target not in (None, self.cabin.id):
                raise ValueError("A cabin scenario takes cabin as its target.")
            return id_, self.cabin.id
        if not isinstance(target, str) or target not in {bot.id for bot in self.crew}:
            raise ValueError("Choose astro-1, astro-2 or astro-3 for a crew scenario.")
        return id_, target

    def trigger(self, id_, target=None, duration=DEFAULT_SCENARIO_SECONDS, intensity=1.0):
        if type(duration) is not int or not MIN_SCENARIO_SECONDS <= duration <= MAX_SCENARIO_SECONDS:
            raise ValueError(f"Duration must be an integer from {MIN_SCENARIO_SECONDS} to {MAX_SCENARIO_SECONDS} simulated seconds.")
        if not isinstance(intensity, (int, float)) or not 0 < intensity <= 2:
            raise ValueError("Intensity must be a number in (0, 2].")
        key = self.scenario_key(id_, target)
        self.intensity[key] = float(intensity)
        started, expires = self.scenarios.get(key, (self.elapsed, self.elapsed))
        self.scenarios[key] = (started, max(expires, self.elapsed + duration))

    def clear(self, id_=None, target=None):
        if id_ is None:
            if target is not None:
                raise ValueError("Supply a scenario ID to clear one target.")
            self.scenarios.clear()
        else:
            self.scenarios.pop(self.scenario_key(id_, target), None)

    def effect(self, scenario, target, ramp):
        interval = self.scenarios.get((scenario, target))
        if interval is None:
            return None
        started, expires = interval
        age = self.elapsed - started
        return min(1, age / ramp, (expires - self.elapsed) / ramp) * self.intensity.get((scenario, target), 1.0)

    def advance(self, seconds):
        for _ in range(seconds):
            self.elapsed += 1
            self.scenarios = {key: period for key, period in self.scenarios.items() if period[1] > self.elapsed}
            self.sample()

    def sample(self):
        instant = self.start + timedelta(seconds=self.elapsed)
        self.now = utc_string(instant)
        minute = instant.hour * 60 + instant.minute + instant.second / 60
        self.astronauts = [
            bot.sample(self.now, self.elapsed, minute,
                       self.effect("high_resting_hr", bot.id, 8),
                       self.intensity.get(("cognitive_stress", bot.id), 1.0) if ("cognitive_stress", bot.id) in self.scenarios else 0)
            for bot in self.crew
        ]
        self.environment = self.cabin.sample(
            self.elapsed, minute, self.effect("co2_buildup", "cabin", 18) or 0,
            self.effect("warm_humid_cabin", "cabin", 22) or 0,
        )
        radiation = self.environment["radiation"]
        rate = radiation["absorbed_dose_rate_ugy_h"]
        if isinstance(rate, (int, float)):
            self.dose_ugy += rate * (self.elapsed - self.dose_elapsed) / 3600
        self.dose_elapsed = self.elapsed
        # Absorbed dose only (µGy). No conversion to dose equivalent: the source has no quality factor data.
        radiation["cumulative_absorbed_dose_ugy"] = round(self.dose_ugy, 3)
        radiation["cumulative_since_elapsed_seconds"] = 0
        for reading in self.astronauts:
            checks = reading["comparisons"]
            cognition = reading["cognition"]
            self.monitor.update(self.now, self.elapsed, reading["id"], "heart_rate_high",
                                "Heart rate above activity baseline", {"heart_rate_bpm": checks["heart_rate_bpm"]})
            self.monitor.update(self.now, self.elapsed, reading["id"], "cognitive_stress",
                                "Cognitive stress indicators elevated",
                                {field: checks[field] for field in COGNITIVE_FIELDS if field in checks},
                                required=2, sampled_at=cognition["sampled_at"] if cognition else None)

        cabin_checks = self.environment["comparisons"]
        self.monitor.update(self.now, self.elapsed, "cabin", "co2_high", "Cabin CO₂ above baseline",
                            {"co2_ppm": cabin_checks["co2_ppm"]})
        self.monitor.update(self.now, self.elapsed, "cabin", "cabin_heat_humidity", "Cabin heat and humidity above baseline",
                            {key: cabin_checks[key] for key in ("temperature_c", "relative_humidity_pct")}, required=2)
        for reading in [*self.astronauts, self.environment]:
            reading["alert_status"] = self.monitor.status(reading["id"])

    def snapshot(self, sequence):
        return {
            "schema_version": 1,
            "synthetic": True,
            "run_id": self.run_id,
            "sequence": sequence,
            "clock": {
                "simulated_at": self.now, "elapsed_seconds": self.elapsed,
                "speed": self.speed, "published_at": utc_string(datetime.now(UTC)),
            },
            "astronauts": self.astronauts,
            "cabin": self.environment,
            "active_scenarios": [
                {"id": id_, "target": target, "label": SCENARIOS[id_]["label"], "started_at_elapsed_seconds": start,
                 "expires_at_elapsed_seconds": end, "remaining_seconds": end - self.elapsed}
                for (id_, target), (start, end) in self.scenarios.items()
            ],
            "active_alerts": list(self.monitor.active.values()),
            "alert_events": list(self.monitor.events),
        }

    def baselines(self):
        return {
            "synthetic": True,
            "method": {"trigger_z": 3, "recovery_fraction": 0.7, "confirmation_sim_seconds": CONFIRM_SECONDS,
                       "recovery_sim_seconds": RECOVERY_SECONDS,
                       "cognitive_interval_sim_seconds": COGNITIVE_INTERVAL_SECONDS,
                       "minimum_deltas": self.calibration["minimum_deltas"]},
            "astronauts": [
                {"id": bot.id, "name": bot.name, "sleep_source": bot.profile["sleep_source"], "baseline": bot.baseline,
                 "schedule": {"bedtime_minute": bot.profile["bedtime_minute"],
                              "exercise_minute": bot.profile["exercise_minute"],
                              "work_blocks_minute": [[495, 705], [810, 1035]]}}
                for bot in self.crew
            ],
            "cabin": {"mission": self.calibration["source_cabin_mission"],
                      "baseline": {**self.cabin.baseline, "noise_dba": SYNTHETIC_NOISE_BASELINE}},
            "provenance": PROVENANCE,
        }
