// Browser-only check-in store for the recorded (static) demo, where no Python server exists.
// Mirrors server/checkins.py scoring and summary rules so the UI behaves identically; data stays in
// this browser's localStorage. Pure logic is exported for tests (tests/web/replay.test.mjs).

export const LAPSE_MS = 500;
export const MIN_VALID_TRIALS = 5;
export const REACTION_BASELINE_SESSIONS = 5;
export const SURVEY_BASELINE_ENTRIES = 3;
export const SURVEY_MIN_ANSWERS = 4;
export const SURVEY_ITEMS = ['fatigue', 'sleep_quality', 'stress', 'focus', 'mood', 'discomfort'];
const PROTOCOL = 'reaction-mix-1';
const TASKS = ['simple', 'gonogo', 'choice'];
const KEY = 'wiase-demo-checkins-v1';

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

export function scoreReaction(trials) {
  const taskOf = (t) => t.task || 'simple';
  const validTrials = trials.filter((t) => t.outcome === 'valid');
  const valid = validTrials.map((t) => t.rt_ms);
  const count = (o) => trials.filter((t) => t.outcome === o).length;
  const by_task = {};
  for (const task of TASKS) {
    if (!trials.some((t) => taskOf(t) === task)) continue;
    const rts = validTrials.filter((t) => taskOf(t) === task).map((t) => t.rt_ms);
    by_task[task] = { valid_trials: rts.length, median_reaction_time_ms: rts.length ? round(median(rts)) : null };
  }
  const s = {
    valid_trials: valid.length,
    false_starts: count('false_start'),
    timeouts: count('timeout'),
    lapses: validTrials.filter((t) => taskOf(t) !== 'choice' && t.rt_ms >= LAPSE_MS).length,
    errors: count('commission') + count('wrong_response'),
    commissions: count('commission'),
    wrong_responses: count('wrong_response'),
    correct_withholds: count('correct_withhold'),
    median_reaction_time_ms: valid.length ? round(median(valid)) : null,
    mean_reaction_time_ms: valid.length ? round(mean(valid)) : null,
    rt_sd_ms: valid.length >= 2 ? round(sd(valid)) : null,
    by_task,
  };
  s.sufficient = s.valid_trials >= MIN_VALID_TRIALS;
  return s;
}

export function scoreSurvey(responses) {
  const answered = Object.values(responses).filter((v) => v !== null && v !== undefined);
  return { answered: answered.length, mean_score: answered.length >= SURVEY_MIN_ANSWERS ? round(mean(answered), 2) : null };
}

export function summarize(data, astronaut) {
  const sessions = data.reaction_sessions.filter((s) => s.astronaut_id === astronaut);
  const surveys = data.surveys.filter((s) => s.astronaut_id === astronaut);
  const usable = sessions.filter((s) => s.sufficient && !s.interrupted && s.protocol_version === PROTOCOL);
  const reaction = { status: 'building', sessions: usable.length, needed: REACTION_BASELINE_SESSIONS, median_reaction_time_ms: null, lapses: null };
  if (usable.length >= REACTION_BASELINE_SESSIONS) {
    const first = usable.slice(0, REACTION_BASELINE_SESSIONS);
    Object.assign(reaction, { status: 'ready', median_reaction_time_ms: round(median(first.map((s) => s.median_reaction_time_ms))), lapses: median(first.map((s) => s.lapses)) });
  }
  const survey = { status: 'building', entries: surveys.length, needed: SURVEY_BASELINE_ENTRIES, items: null };
  if (surveys.length >= SURVEY_BASELINE_ENTRIES) {
    const first = surveys.slice(0, SURVEY_BASELINE_ENTRIES);
    survey.items = Object.fromEntries(SURVEY_ITEMS.map((k) => {
      const vals = first.map((s) => s.responses[k]).filter((v) => v !== null);
      return [k, vals.length ? round(mean(vals), 2) : null];
    }));
    survey.status = 'ready';
  }
  return {
    astronaut_id: astronaut,
    reaction: { sessions: sessions.slice(-20), baseline: reaction, settings: { lapse_ms: LAPSE_MS, min_valid_trials: MIN_VALID_TRIALS, protocol_version: PROTOCOL } },
    survey: { entries: surveys.slice(-20), baseline: survey, items: SURVEY_ITEMS, version: 'wiase-daily-1' },
  };
}

const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, '');

export function createLocalCheckins(storage = globalThis.localStorage) {
  let data = { version: 1, reaction_sessions: [], surveys: [] };
  try { data = { ...data, ...JSON.parse(storage?.getItem(KEY) || '{}') }; } catch { /* private mode: memory only */ }
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } };
  return {
    summary: (id) => summarize(data, id),
    all: () => JSON.parse(JSON.stringify(data)),
    addReaction(body) {
      const trials = body.trials.map((t) => ({ task: TASKS.includes(t.task) ? t.task : 'simple', delay_ms: t.delay_ms, rt_ms: t.outcome === 'valid' ? t.rt_ms : null, outcome: t.outcome }));
      const session = { session_id: uid(), astronaut_id: body.astronaut_id, source: 'user_checkin', protocol_version: PROTOCOL,
        recorded_at_utc: new Date().toISOString(), simulated_at: body.simulated_at ?? null, duration_ms: body.duration_ms,
        interrupted: !!body.interrupted, trials, ...scoreReaction(trials) };
      data.reaction_sessions.push(session);
      save();
      return session;
    },
    addSurvey(body) {
      const responses = Object.fromEntries(SURVEY_ITEMS.map((k) => [k, body.responses?.[k] ?? null]));
      const recorded = new Date().toISOString();
      const entry = { entry_id: uid(), astronaut_id: body.astronaut_id, source: 'user_checkin', questionnaire_version: 'wiase-daily-1',
        date_utc: recorded.slice(0, 10), recorded_at_utc: recorded, simulated_at: body.simulated_at ?? null, responses,
        sleep_hours: body.sleep_hours ?? null, symptoms: [...new Set(body.symptoms || [])].sort(), note: body.note ?? null,
        amendments: [], ...scoreSurvey(responses) };
      const i = data.surveys.findIndex((s) => s.astronaut_id === entry.astronaut_id && s.date_utc === entry.date_utc);
      if (i >= 0) {
        const prev = data.surveys[i];
        entry.amendments = [...(prev.amendments || []), { recorded_at_utc: prev.recorded_at_utc, responses: prev.responses, sleep_hours: prev.sleep_hours, symptoms: prev.symptoms, note: prev.note }];
        entry.entry_id = prev.entry_id;
        data.surveys[i] = entry;
      } else data.surveys.push(entry);
      save();
      return entry;
    },
  };
}
