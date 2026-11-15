// Astronaut page, right column: region list, or — when a body point is selected — the region
// explanation in tabs (no scrolling): live values vs personal expected/threshold with alert evidence,
// involved organs/nerves + suggested non-diagnostic checks, and (brain) human check-ins.
import { ORGANS, ORGAN_BY_ID, STRUCTURES, organStatus, radiationValue } from '../organs.mjs';
import { ACTIVITY, METRICS, STATUS, fmt, signed, statusPill, clockOf, escapeHtml, isNum } from '../format.mjs';
import { sparkline } from '../charts.mjs';
import { issuesForRegion } from '../issues.mjs';
import { setHTML } from '../dom.mjs';

const PROVENANCE_KEY = {
  heart_rate_bpm: 'heart_rate_bpm', systolic_mmhg: 'blood_pressure', diastolic_mmhg: 'blood_pressure',
  spo2_pct: 'spo2_pct', median_reaction_time_ms: 'median_reaction_time_ms', lapses: 'lapses',
  state_anxiety_score: 'state_anxiety_score', last_sleep_duration_min: 'sleep', co2_ppm: 'co2_ppm',
  temperature_c: 'temperature_c', relative_humidity_pct: 'relative_humidity_pct', noise_dba: 'noise_dba',
};
const SURVEY_LABELS = {
  fatigue: 'Fatigue', sleep_quality: 'Poor sleep', stress: 'Stress', focus: 'Concentration difficulty',
  mood: 'Low / irritable mood', discomfort: 'Physical discomfort',
};

function provenanceTag(ctx, key) {
  const p = ctx.baselines?.provenance?.[PROVENANCE_KEY[key] || key];
  if (!p) return '';
  const text = p.source === 'workbook' ? `Workbook · ${p.sheets.join(', ')}` : p.source === 'synthetic' ? 'Synthetic' : 'Assumed';
  return `<span class="tag tag--${p.source}" title="${escapeHtml(p.note)}">${escapeHtml(text)}</span>`;
}

function metricRow(ctx, m, history, astronautId) {
  const meta = METRICS[m.key];
  const state = m.threshold_breached ? 'watch' : 'normal';
  const dir = m.direction === 'low' ? 'below' : 'above';
  return `<li class="metric metric--${state}">
    <div class="metric__head"><span>${meta.label}${m.scope === 'cabin' ? ' <span class="tag">Shared cabin</span>' : ''}</span>
      <strong class="mono">${fmt(m.value, m.key)}</strong></div>
    <div class="metric__bar" aria-hidden="true">${bar(m)}</div>
    <div class="metric__meta muted small">Expected ${fmt(m.expected, m.key)} · alert ${dir} ${fmt(m.threshold, m.key)} ·
      Δ ${signed(m.delta)} · z ${signed(m.robust_z)}</div>
    <div class="metric__foot">${provenanceTag(ctx, m.key)}</div>
  </li>`;
}

// Position of value between expected and threshold, as a small gauge.
function bar(m) {
  const span = Math.abs(m.threshold - m.expected) || 1;
  const frac = ((m.direction === 'low' ? -1 : 1) * (m.value - m.expected)) / span; // 0 = expected, 1 = threshold
  const pos = Math.max(0, Math.min(1, (frac + 1) / 2.5)); // -1..1.5 mapped to 0..1
  return `<span class="gauge"><span class="gauge__ok"></span><span class="gauge__limit" style="left:${(2 / 2.5) * 100}%"></span>
    <span class="gauge__value" style="left:${pos * 100}%"></span></span>`;
}

function checkinBlock(ctx, astronautId) {
  const summary = ctx.store.get().checkins[astronautId];
  const buttons = `<div class="row"><button type="button" class="btn btn--primary btn--small" data-open="reaction">Start reaction test</button>
    <button type="button" class="btn btn--small" data-open="survey">Daily check-in</button></div>`;
  if (!summary) return `<section class="side-section"><h4>Human check-ins</h4><p class="muted small">Loading…</p>${buttons}</section>`;
  const r = summary.reaction, s = summary.survey;
  const last = r.sessions.at(-1);
  const rb = r.baseline;
  const rtDelta = last && rb.status === 'ready' && isNum(last.median_reaction_time_ms)
    ? ` · ${signed(((last.median_reaction_time_ms / rb.median_reaction_time_ms) - 1) * 100, 0)}% vs own baseline` : '';
  const entry = s.entries.at(-1);
  const sb = s.baseline;
  return `<section class="side-section side-section--human">
    <p class="muted small"><span class="tag tag--human">Human input · wall clock</span> Separate from the simulated stream. Display only: check-ins never open alerts.</p>
    <div class="checkin-card">
      <span class="label">Reaction test (latest)</span>
      ${last ? `<strong class="mono">${fmt(last.median_reaction_time_ms, 'median_reaction_time_ms')}</strong>
        <span class="small">${last.valid_trials} valid · ${last.lapses} lapses (≥500 ms) · ${Number.isFinite(last.errors) ? `${last.errors} error${last.errors === 1 ? '' : 's'} · ` : ''}${last.false_starts} false start${last.false_starts === 1 ? "" : "s"} · ${last.timeouts} timeout${last.timeouts === 1 ? "" : "s"}${last.sufficient ? '' : ' · <b>insufficient trials</b>'}${last.interrupted ? ' · interrupted' : ''}${rtDelta}</span>`
        : '<span class="muted small">No sessions yet.</span>'}
      <span class="muted small">Personal baseline: ${rb.status === 'ready' ? `${fmt(rb.median_reaction_time_ms, 'median_reaction_time_ms')} (first ${rb.needed} sessions)` : `building ${rb.sessions}/${rb.needed} sessions`}</span>
    </div>
    <div class="checkin-card">
      <span class="label">Daily questionnaire (latest, 1 = none … 5 = extreme)</span>
      ${entry ? `<ul class="survey-items">${s.items.map((k) => {
        const v = entry.responses[k];
        const b = sb.status === 'ready' ? sb.items[k] : null;
        const d = isNum(v) && isNum(b) ? v - b : null;
        return `<li><span>${SURVEY_LABELS[k]}</span><span class="dots" aria-label="${v ?? 'skipped'} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${isNum(v) && i <= v ? 'on' : ''}"></i>`).join('')}</span>
          <span class="mono small">${isNum(v) ? v : 'skip'}${isNum(d) && d !== 0 ? ` (${signed(d, 1)})` : ''}</span></li>`;
      }).join('')}</ul>
      <span class="muted small">${entry.answered}/6 answered${isNum(entry.mean_score) ? ` · mean ${entry.mean_score}` : ''} · baseline ${sb.status === 'ready' ? 'ready' : `building ${sb.entries}/${sb.needed}`}${entry.symptoms.length ? ` · symptoms: ${entry.symptoms.join(', ').replaceAll('_', ' ')}` : ''}</span>`
        : '<span class="muted small">No entries yet.</span>'}
    </div>
    ${buttons}
  </section>`;
}

export function mountSidebar(el, ctx) {
  const { store, feed } = ctx;
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-organ-select],[data-close-organ],[data-open],[data-region-tab]');
    if (!t) return;
    if (t.dataset.regionTab) store.set({ regionTab: t.dataset.regionTab });
    else if (t.dataset.organSelect) store.set({ organ: t.dataset.organSelect });
    else if ('closeOrgan' in t.dataset) store.set({ organ: null });
    else if (t.dataset.open === 'reaction') ctx.openReaction();
    else if (t.dataset.open === 'survey') ctx.openSurvey();
  });

  return function render() {
    const f = feed.state.frame;
    if (!f) { setHTML(el, '<div class="side-empty">Waiting for the simulator…<br><span class="muted small">Start it with <code>python3 server/server.py</code></span></div>'); return; }
    const s = store.get();
    const live = feed.connection === 'live';
    const a = f.astronauts.find((x) => x.id === s.astronaut);
    const history = feed.state.history.slice(-120);
    const organ = s.organ && ORGAN_BY_ID[s.organ];

    if (!organ) {
      setHTML(el, `
        <header class="side-head"><div><span class="card-kicker">Recommendations</span>
          <h3>Body regions</h3></div>${statusPill(live ? a.alert_status : 'unavailable')}</header>
        <p class="hint">Click a point on the body, or a region below, to isolate its organs and nerves.</p>
        <ul class="region-list">${ORGANS.map((o) => {
          const st = organStatus(o, a, f, { live });
          const lead = st.metrics[0];
          const value = o.info ? fmt(radiationValue(f), 'absorbed_dose_rate_ugy_h') : lead ? fmt(lead.value, lead.key) : '—';
          return `<li><button type="button" class="region region--${st.status}" data-organ-select="${o.id}">
            <span class="region__dot" aria-hidden="true">${STATUS[st.status].icon}</span>
            <span class="region__name">${o.label}</span><span class="mono small">${value}</span>
            <span class="sr-only">${STATUS[st.status].label}</span></button></li>`;
        }).join('')}</ul>
        ${alertsBlock(f, a)}
        <p class="footnote">Normal means within this person's own range on synthetic data. It is not proof of good health. Not a medical device.</p>`);
      return;
    }

    const st = organStatus(organ, a, f, { live });
    const explain = organ.explain[st.status] || organ.explain.normal || '';
    const tabs = [['readings', 'Readings'], ['why', 'Organs & checks'], ...(organ.checkins ? [['checkins', 'Check-ins']] : [])];
    const tab = tabs.some(([k]) => k === s.regionTab) ? s.regionTab : 'readings';
    let panel = '';
    if (tab === 'readings') {
      panel = `${organ.info ? `<ul class="metrics"><li class="metric"><div class="metric__head"><span>Absorbed dose rate</span><strong class="mono">${fmt(radiationValue(f), 'absorbed_dose_rate_ugy_h')}</strong></div>
          <div class="metric__meta muted small">Cumulative absorbed dose since run start <strong class="mono">${fmt(f.cabin.radiation?.cumulative_absorbed_dose_ugy, 'cumulative_dose_ugy')}</strong> · particle flux ${fmt(f.cabin.radiation?.particle_flux_per_cm2_sr_s)} cm⁻² sr⁻¹ s⁻¹ · dose equivalent ${f.cabin.radiation?.dose_equivalent_rate_usv_h ?? 'not available'}</div>
          <div class="metric__foot">${sparkline(history.map((h) => h.cabin.absorbed_dose_rate_ugy_h))}${provenanceTag(ctx, 'radiation')}</div></li></ul>`
          : `<ul class="metrics">${st.metrics.map((m) => metricRow(ctx, m, history, a.id)).join('')}</ul>`}
        ${st.missing.length && !organ.info ? `<p class="muted small">Unavailable now: ${st.missing.map((k) => METRICS[k]?.label || k).join(', ')}${st.missing.includes('median_reaction_time_ms') ? ' (no cognitive check during sleep, exercise or recovery)' : ''}.</p>` : ''}`;
    } else if (tab === 'why') {
      panel = `<section class="side-section"><h4>Organs & nerves involved</h4>
        <ul class="chips">${organ.structures.map((k) => `<li class="chip chip--${['alert', 'watch'].includes(st.status) ? st.status : 'plain'}">${STRUCTURES[k]}</li>`).join('')}</ul>
        <p class="muted small">${organ.about}</p></section>
        ${organ.nasa?.length ? `<section class="side-section"><h4>NASA context</h4><ul class="nasa-links">${organ.nasa.map((r) =>
          `<li><a href="${r.url}" target="_blank" rel="noopener">${r.title} ↗</a></li>`).join('')}</ul>
          <p class="footnote">Background on why this signal matters in spaceflight. WIASE does not use NASA limits as its thresholds.</p></section>` : ''}
        <section class="side-section"><h4>Suggested checks</h4>
        <ol class="checks">${organ.checks.map((c) => `<li>${c}</li>`).join('')}</ol>
        <p class="footnote">Non-diagnostic prompts tied to the rule that fired. Follow mission procedures; WIASE does not diagnose or treat.</p></section>`;
    } else panel = checkinBlock(ctx, a.id);
    setHTML(el, `
      <header class="side-head side-head--${st.status}">
        <div><span class="card-kicker">Region</span><h3>${organ.label}</h3></div>
        <button type="button" class="icon-btn" data-close-organ aria-label="Close region details">✕</button>
      </header>
      <div class="status-banner status-banner--${st.status}">${statusPill(st.status)}<p>${explain}</p>
        ${st.alerts.map((al) => `<p class="evidence-line"><strong>${escapeHtml(al.label)}</strong> · opened ${clockOf(al.opened_at)} sim UTC${al.target === 'cabin' ? ' · shared cabin' : ''}</p>`).join('')}
        ${issuesForRegion(ctx.issues(), organ.id, a.id).map((x) => `<button type="button" class="btn btn--small${x.level === 'alert' ? ' btn--primary' : ''} banner-btn" data-issue="${x.id}">Response steps: ${escapeHtml(x.title)} →</button>`).join('')}</div>
      <div class="tabs tabs--small" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-region-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
      <div class="side-panel">${panel}</div>`);
  };
}

function alertsBlock(f, a) {
  const alerts = f.active_alerts.filter((x) => x.target === a.id || x.target === 'cabin');
  if (!alerts.length) return '<section class="side-section"><h4>Active alerts</h4><p class="muted small">None for this astronaut or the shared cabin.</p></section>';
  return `<section class="side-section"><h4>Active alerts</h4><ul class="alert-list">${alerts.map((x) =>
    `<li>${statusPill('alert', x.target === 'cabin' ? 'Cabin' : 'Crew')} ${escapeHtml(x.label)} <span class="muted small">since ${clockOf(x.opened_at)}</span></li>`).join('')}</ul></section>`;
}
