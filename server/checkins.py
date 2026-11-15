"""Human check-in storage: PVT-inspired reaction sessions and the daily wellbeing questionnaire.

These are *human inputs*, kept separate from the synthetic simulator stream. They never open alerts;
the dashboard shows them next to each person's own check-in baseline. See docs/COGNITION_AND_CHECKIN.md.
"""

import json
import math
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median, stdev
from uuid import uuid4

CREW_IDS = ("astro-1", "astro-2", "astro-3")
REACTION_PROTOCOL = "reaction-mix-1"  # 45 s, Tap / Go-No-Go / Left-Right drawn at random per trial
SURVEY_VERSION = "wiase-daily-1"
SURVEY_ITEMS = ("fatigue", "sleep_quality", "stress", "focus", "mood", "discomfort")
SYMPTOMS = {"headache", "dizziness", "nausea", "shortness_of_breath", "other", "none", "prefer_not_to_say"}
TRIAL_OUTCOMES = {"valid", "false_start", "timeout", "commission", "correct_withhold", "wrong_response"}
TRIAL_TASKS = ("simple", "gonogo", "choice")

LAPSE_MS = 500             # Demo convention borrowed from the PVT; not validated. Simple/go trials only.
MIN_VALID_TRIALS = 5       # Fewer valid trials -> session marked insufficient.
REACTION_BASELINE_SESSIONS = 5
SURVEY_BASELINE_ENTRIES = 3
SURVEY_MIN_ANSWERS = 4     # Needed before a mean score is shown.
MAX_TRIALS = 60


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _number(value, low, high, name, *, allow_none=False, integer=False):
    if value is None and allow_none:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a number.")
    if integer and int(value) != value:
        raise ValueError(f"{name} must be a whole number.")
    if not low <= value <= high:
        raise ValueError(f"{name} must be between {low} and {high}.")
    return int(value) if integer else value


def _astronaut(body):
    astronaut = body.get("astronaut_id")
    if astronaut not in CREW_IDS:
        raise ValueError("astronaut_id must be astro-1, astro-2 or astro-3.")
    return astronaut


def _optional_text(value, name, limit):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f"{name} must be text of at most {limit} characters.")
    return value.strip() or None


def score_reaction(trials):
    """Summarise trial-level results. Missing values are never replaced with zero.

    Trials without a task are simple (older pvt-lite-1 sessions). Lapses count simple/go trials only,
    because left/right choice responses are naturally slower."""
    task_of = lambda trial: trial.get("task") or "simple"
    valid_trials = [trial for trial in trials if trial["outcome"] == "valid"]
    valid = [trial["rt_ms"] for trial in valid_trials]
    count = lambda outcome: sum(trial["outcome"] == outcome for trial in trials)
    by_task = {}
    for task in TRIAL_TASKS:
        if any(task_of(trial) == task for trial in trials):
            rts = [trial["rt_ms"] for trial in valid_trials if task_of(trial) == task]
            by_task[task] = {"valid_trials": len(rts), "median_reaction_time_ms": round(median(rts), 1) if rts else None}
    summary = {
        "valid_trials": len(valid),
        "false_starts": count("false_start"),
        "timeouts": count("timeout"),
        "lapses": sum(trial["rt_ms"] >= LAPSE_MS for trial in valid_trials if task_of(trial) != "choice"),
        "errors": count("commission") + count("wrong_response"),
        "commissions": count("commission"),
        "wrong_responses": count("wrong_response"),
        "correct_withholds": count("correct_withhold"),
        "median_reaction_time_ms": round(median(valid), 1) if valid else None,
        "mean_reaction_time_ms": round(mean(valid), 1) if valid else None,
        "rt_sd_ms": round(stdev(valid), 1) if len(valid) >= 2 else None,
        "by_task": by_task,
    }
    summary["sufficient"] = summary["valid_trials"] >= MIN_VALID_TRIALS
    return summary


def score_survey(responses):
    answered = [value for value in responses.values() if value is not None]
    return {
        "answered": len(answered),
        "mean_score": round(mean(answered), 2) if len(answered) >= SURVEY_MIN_ANSWERS else None,
    }


class CheckinStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()
        self.data = self._load()

    def _load(self):
        empty = {"version": 1, "reaction_sessions": [], "surveys": []}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return empty
        except (OSError, json.JSONDecodeError):
            # Keep the unreadable file for inspection instead of silently overwriting it.
            self.path.replace(self.path.with_suffix(".corrupt.json"))
            return empty
        return {**empty, **data}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, self.path)  # atomic on POSIX and Windows

    # ---- reaction game -------------------------------------------------------------------
    def add_reaction(self, body):
        astronaut = _astronaut(body)
        trials_in = body.get("trials")
        if not isinstance(trials_in, list) or not 0 < len(trials_in) <= MAX_TRIALS:
            raise ValueError(f"trials must be a list of 1 to {MAX_TRIALS} trials.")
        trials = []
        for index, trial in enumerate(trials_in, 1):
            if not isinstance(trial, dict) or trial.get("outcome") not in TRIAL_OUTCOMES:
                raise ValueError(f"Trial {index} needs an outcome of {', '.join(sorted(TRIAL_OUTCOMES))}.")
            task = trial.get("task") or "simple"
            if task not in TRIAL_TASKS:
                raise ValueError(f"Trial {index} task must be one of {', '.join(TRIAL_TASKS)}.")
            outcome = trial["outcome"]
            rt = _number(trial.get("rt_ms"), 80, 5000, f"Trial {index} rt_ms", allow_none=outcome != "valid")
            trials.append({
                "task": task,
                "delay_ms": _number(trial.get("delay_ms"), 0, 10000, f"Trial {index} delay_ms"),
                "rt_ms": rt if outcome == "valid" else None,
                "outcome": outcome,
            })
        session = {
            "session_id": uuid4().hex,
            "astronaut_id": astronaut,
            "source": "user_checkin",
            "protocol_version": REACTION_PROTOCOL,
            "recorded_at_utc": utc_now(),
            "simulated_at": _optional_text(body.get("simulated_at"), "simulated_at", 40),
            "duration_ms": _number(body.get("duration_ms"), 0, 600000, "duration_ms"),
            "interrupted": bool(body.get("interrupted", False)),
            "trials": trials,
            **score_reaction(trials),
        }
        with self.lock:
            self.data["reaction_sessions"].append(session)
            self._save()
        return session

    # ---- daily questionnaire -------------------------------------------------------------
    def add_survey(self, body):
        astronaut = _astronaut(body)
        raw = body.get("responses")
        if not isinstance(raw, dict) or set(raw) - set(SURVEY_ITEMS):
            raise ValueError("responses must only contain: " + ", ".join(SURVEY_ITEMS))
        responses = {item: _number(raw.get(item), 1, 5, item, allow_none=True, integer=True) for item in SURVEY_ITEMS}
        symptoms = body.get("symptoms") or []
        if not isinstance(symptoms, list) or not set(symptoms) <= SYMPTOMS:
            raise ValueError("symptoms must be a list from: " + ", ".join(sorted(SYMPTOMS)))
        recorded = utc_now()
        entry = {
            "entry_id": uuid4().hex,
            "astronaut_id": astronaut,
            "source": "user_checkin",
            "questionnaire_version": SURVEY_VERSION,
            "date_utc": recorded[:10],
            "recorded_at_utc": recorded,
            "simulated_at": _optional_text(body.get("simulated_at"), "simulated_at", 40),
            "responses": responses,
            "sleep_hours": _number(body.get("sleep_hours"), 0, 24, "sleep_hours", allow_none=True),
            "symptoms": sorted(set(symptoms)),
            "note": _optional_text(body.get("note"), "note", 1000),
            "amendments": [],
            **score_survey(responses),
        }
        with self.lock:
            surveys = self.data["surveys"]
            # One entry per astronaut per UTC date; a resubmission amends it and keeps the history.
            existing = next((i for i, s in enumerate(surveys)
                             if s["astronaut_id"] == astronaut and s["date_utc"] == entry["date_utc"]), None)
            if existing is not None:
                previous = surveys[existing]
                entry["amendments"] = previous.get("amendments", []) + [
                    {key: previous[key] for key in ("recorded_at_utc", "responses", "sleep_hours", "symptoms", "note")}
                ]
                entry["entry_id"] = previous["entry_id"]
                surveys[existing] = entry
            else:
                surveys.append(entry)
            self._save()
        return entry

    # ---- read model ----------------------------------------------------------------------
    def summary(self, astronaut):
        if astronaut not in CREW_IDS:
            raise ValueError("astronaut must be astro-1, astro-2 or astro-3.")
        with self.lock:
            sessions = [s for s in self.data["reaction_sessions"] if s["astronaut_id"] == astronaut]
            surveys = [s for s in self.data["surveys"] if s["astronaut_id"] == astronaut]

        usable = [s for s in sessions if s["sufficient"] and not s["interrupted"]
                  and s["protocol_version"] == REACTION_PROTOCOL]
        reaction_baseline = {"status": "building", "sessions": len(usable), "needed": REACTION_BASELINE_SESSIONS,
                             "median_reaction_time_ms": None, "lapses": None}
        if len(usable) >= REACTION_BASELINE_SESSIONS:
            first = usable[:REACTION_BASELINE_SESSIONS]
            reaction_baseline.update(status="ready",
                                     median_reaction_time_ms=round(median(s["median_reaction_time_ms"] for s in first), 1),
                                     lapses=median(s["lapses"] for s in first))

        survey_baseline = {"status": "building", "entries": len(surveys), "needed": SURVEY_BASELINE_ENTRIES, "items": None}
        if len(surveys) >= SURVEY_BASELINE_ENTRIES:
            first = surveys[:SURVEY_BASELINE_ENTRIES]
            items = {}
            for item in SURVEY_ITEMS:
                values = [s["responses"][item] for s in first if s["responses"][item] is not None]
                items[item] = round(mean(values), 2) if values else None
            survey_baseline.update(status="ready", items=items)

        return {
            "astronaut_id": astronaut,
            "reaction": {"sessions": sessions[-20:], "baseline": reaction_baseline,
                         "settings": {"lapse_ms": LAPSE_MS, "min_valid_trials": MIN_VALID_TRIALS,
                                      "protocol_version": REACTION_PROTOCOL}},
            "survey": {"entries": surveys[-20:], "baseline": survey_baseline, "items": SURVEY_ITEMS,
                       "version": SURVEY_VERSION},
        }

    def export(self):
        with self.lock:
            return json.loads(json.dumps(self.data))
