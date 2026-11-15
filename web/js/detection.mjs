// Detection walkthrough: rebuilds the life of one server alert — past threshold, confirmed, recovering,
// cleared — from the server's own alert events and the server's per-sample comparisons kept in the
// feed history (see CREW_CHECKS / CABIN_CHECKS in feed.mjs). Pure module (tests/web/detection.test.mjs).
//
// Nothing here decides anything: "past threshold" and "in recovery band" are the server's flags, the
// confirmation/recovery times come from /api/baselines → method, and the opened/cleared moments are
// the server's events. Times are simulated seconds; history is frame-resolution, so the first frame
// past threshold can be up to one frame later than the moment the server started confirming.

/** Which signals each server rule watches and how many must agree (mirrors AlertMonitor.update calls). */
export const RULES = {
  heart_rate_high: { scope: 'crew', signals: ['heart_rate_bpm'], required: 1 },
  cognitive_stress: { scope: 'crew', signals: ['median_reaction_time_ms', 'lapses', 'state_anxiety_score'], required: 2, sampled: true },
  co2_high: { scope: 'cabin', signals: ['co2_ppm'], required: 1 },
  cabin_heat_humidity: { scope: 'cabin', signals: ['temperature_c', 'relative_humidity_pct'], required: 2 },
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Index of the last history sample at or before time t (−1 if none). */
function lastAtOrBefore(history, t) {
  let idx = -1;
  for (let i = 0; i < history.length; i++) {
    if (isNum(history[i].t) && history[i].t <= t) idx = i; else if (isNum(history[i].t)) break;
  }
  return idx;
}

/**
 * @param {number} alertId
 * @param {Array} events   feed.state.events (any order)
 * @param {Array} history  feed.state.history (oldest first)
 * @param {object} method  baselines.method from the server
 */
export function alertStory(alertId, events, history, method = {}) {
  const opened = events.find((e) => e.alert_id === alertId && e.type === 'opened');
  if (!opened) return null;
  const rule = RULES[opened.rule];
  if (!rule) return null;
  const cleared = events.find((e) => e.alert_id === alertId && e.type === 'cleared') || null;
  const pick = (h) => (opened.target === 'cabin' ? h.cabin : h.crew?.[opened.target]);
  const checks = (h) => pick(h)?.checks || null;
  const breaches = (h) => { const c = checks(h); return c ? rule.signals.filter((k) => c[k]?.breached === true).length : 0; };
  // Server: still elevated = signals that are not in the recovery band; recovering when fewer than `required`.
  const recovering = (h) => { const c = checks(h); return !!c && rule.signals.filter((k) => c[k] && c[k].in_band === false).length < rule.required; };

  const tOpen = opened.elapsed_seconds;
  const tClear = cleared?.elapsed_seconds ?? null;
  const first = history.find((h) => isNum(h.t))?.t ?? null;
  const last = [...history].reverse().find((h) => isNum(h.t))?.t ?? null;
  const inHistory = first !== null && first <= tOpen && last >= tOpen;

  // First frame of the unbroken run of breaching frames that led to the alert.
  let crossedAt = null;
  const io = lastAtOrBefore(history, tOpen);
  if (io >= 0 && breaches(history[io]) >= rule.required) {
    let i = io;
    while (i > 0 && !history[i].gap && breaches(history[i - 1]) >= rule.required) i -= 1;
    crossedAt = history[i].t;
  }

  // First frame of the unbroken run of in-band frames that led to the clearing.
  let recoveringFrom = null;
  if (cleared && cleared.reason === 'returned_to_baseline') {
    const ic = lastAtOrBefore(history, tClear);
    if (ic >= 0 && recovering(history[ic])) {
      let j = ic;
      while (j > 0 && !history[j].gap && history[j - 1].t > tOpen && recovering(history[j - 1])) j -= 1;
      recoveringFrom = history[j].t;
    }
  }

  const confirmSeconds = method.confirmation_sim_seconds ?? null;
  const recoverySeconds = method.recovery_sim_seconds ?? null;
  const start = Math.min(crossedAt ?? tOpen, tOpen - (confirmSeconds ?? 0));
  const end = tClear ?? last ?? tOpen;
  const pad = Math.max(60, 0.3 * (end - start));
  const window = first === null ? null : [Math.max(first, start - pad), Math.min(last, end + pad)];

  return {
    alertId, rule: opened.rule, target: opened.target, label: opened.label, scope: rule.scope,
    signals: rule.signals, required: rule.required, sampled: !!rule.sampled,
    opened, cleared, crossedAt, recoveringFrom, inHistory, window,
    confirmSeconds, recoverySeconds,
    triggerZ: method.trigger_z ?? null, recoveryFraction: method.recovery_fraction ?? null,
  };
}

/** Series values for one signal of the story's target: value, expected, threshold, recovery-band edge. */
export function signalSeries(story, history, key) {
  const pick = (h) => (story.target === 'cabin' ? h.cabin : h.crew?.[story.target]);
  const f = story.recoveryFraction;
  const pts = (fn) => history.map((h) => ({ x: h.t, y: fn(pick(h), h) ?? null, gap: h.gap }));
  return {
    value: pts((s) => s?.[key]),
    expected: pts((s) => s?.checks?.[key]?.expected),
    threshold: pts((s) => s?.checks?.[key]?.threshold),
    // Presentation of the server's published rule: recovered when within `recovery_fraction` of the limit.
    band: pts((s) => {
      const c = s?.checks?.[key];
      return c && isNum(c.expected) && isNum(c.threshold) && isNum(f) ? c.expected + f * (c.threshold - c.expected) : null;
    }),
  };
}

/** The four stages of the walkthrough, cumulative (stage n shows everything up to n). */
export const STAGES = ['baseline', 'crossed', 'opened', 'recovery'];
