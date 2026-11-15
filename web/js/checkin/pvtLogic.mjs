// Pure rules for the mixed reaction check-in (tested in tests/web/pvt.test.mjs).
// 45 s session; every trial randomly draws one of three mini-games so the test stays unpredictable:
//   simple — a target appears: respond (PVT-style)
//   gonogo — crimson target: respond; yellow target: hold back (pressing = commission error)
//   choice — an arrow appears: respond with that direction (wrong side = wrong_response)
// The server re-scores every session (server/checkins.py); this mirror drives the live display and offline results.

export const PVT = {
  protocol: 'reaction-mix-1',
  durationMs: 45000,
  minDelayMs: 1500,
  maxDelayMs: 4000,
  timeoutMs: 2000,
  withholdMs: 1200,     // a no-go target stays this long; no response = correct hold
  anticipationMs: 100,  // responses faster than this count as false starts
  lapseMs: 500,         // demo convention borrowed from the PVT; counted on simple/go trials only
  minValidTrials: 5,
  goProbability: 0.6,
  maxRun: 2,            // never more than two of the same game in a row
};

export const TASKS = {
  simple: { label: 'Tap', cue: 'Tap: respond when the circle appears' },
  gonogo: { label: 'Go / No-Go', cue: 'Go / No-Go: respond to crimson only, hold on yellow' },
  choice: { label: 'Left / Right', cue: 'Left / Right: respond in the arrow’s direction' },
};
export const TASK_IDS = Object.keys(TASKS);
export const ERROR_OUTCOMES = ['commission', 'wrong_response'];

export function randomDelay(random = Math.random) {
  return Math.round(PVT.minDelayMs + random() * (PVT.maxDelayMs - PVT.minDelayMs));
}

/** Random game for the next trial, avoiding more than PVT.maxRun of the same game in a row. */
export function pickTask(history = [], random = Math.random) {
  const tail = history.slice(-PVT.maxRun);
  const blocked = tail.length === PVT.maxRun && tail.every((t) => t === tail[0]) ? tail[0] : null;
  const options = TASK_IDS.filter((t) => t !== blocked);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

/** Stimulus for one trial: { task, go } for go/no-go, { task, side } for left/right. */
export function makeTrial(task, random = Math.random) {
  if (task === 'gonogo') return { task, go: random() < PVT.goProbability };
  if (task === 'choice') return { task, side: random() < 0.5 ? 'left' : 'right' };
  return { task: 'simple' };
}

/** Does this trial expect a response? (Only a no-go target does not.) */
export const expectsResponse = (trial) => !(trial?.task === 'gonogo' && trial.go === false);

/**
 * Classify a response. stimulusAt null = no stimulus showing (false start).
 * `trial` defaults to a simple trial; `input.side` is the direction pressed/tapped (choice game).
 */
export function classifyResponse(stimulusAt, responseAt, trial = { task: 'simple' }, input = {}) {
  if (stimulusAt === null || stimulusAt === undefined) return { outcome: 'false_start', rt_ms: null };
  const rt = responseAt - stimulusAt;
  if (rt < PVT.anticipationMs) return { outcome: 'false_start', rt_ms: null };
  if (!expectsResponse(trial)) return { outcome: 'commission', rt_ms: null };
  if (rt > PVT.timeoutMs) return { outcome: 'timeout', rt_ms: null };
  if (trial.task === 'choice' && input.side !== trial.side) return { outcome: 'wrong_response', rt_ms: null };
  return { outcome: 'valid', rt_ms: Math.round(rt) };
}

/** Outcome when the response window closes with no response. */
export const noResponse = (trial) => (expectsResponse(trial)
  ? { outcome: 'timeout', rt_ms: null } : { outcome: 'correct_withhold', rt_ms: null });

const med = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(trials) {
  const validTrials = trials.filter((t) => t.outcome === 'valid');
  const valid = validTrials.map((t) => t.rt_ms);
  const count = (o) => trials.filter((t) => t.outcome === o).length;
  const by_task = {};
  for (const task of TASK_IDS) {
    const rts = validTrials.filter((t) => (t.task || 'simple') === task).map((t) => t.rt_ms);
    if (trials.some((t) => (t.task || 'simple') === task)) by_task[task] = { valid_trials: rts.length, median_reaction_time_ms: med(rts) };
  }
  return {
    valid_trials: valid.length,
    false_starts: count('false_start'),
    timeouts: count('timeout'),
    lapses: validTrials.filter((t) => (t.task || 'simple') !== 'choice' && t.rt_ms >= PVT.lapseMs).length,
    errors: count('commission') + count('wrong_response'),
    commissions: count('commission'),
    wrong_responses: count('wrong_response'),
    correct_withholds: count('correct_withhold'),
    median_reaction_time_ms: med(valid),
    by_task,
    sufficient: valid.length >= PVT.minValidTrials,
  };
}
