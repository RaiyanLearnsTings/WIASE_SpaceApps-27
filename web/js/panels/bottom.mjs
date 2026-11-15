// Alerts & data: dashboard card (active server alerts + latest event) and the expanded Alerts page
// (trend explorer + event timeline with local acknowledgement). Acknowledging never clears an alert.
import { drawCharts } from '../charts.mjs';
import { cardHead } from './card.mjs';
import { responseProgress } from './respond.mjs';
import { clockOf, fmt, escapeHtml, statusPill } from '../format.mjs';
import { setHTML, setText } from '../dom.mjs';

const REASONS = {
  threshold_exceeded: 'threshold exceeded and confirmed',
  returned_to_baseline: 'returned within recovery band',
  readings_unavailable: 'readings became unavailable (not a confirmed recovery)',
};
const SERIES = ['var(--ink)', 'var(--aqua)', 'var(--steel-2)'];

const TRENDS = {
  heart_rate_bpm: { label: 'Heart rate', unit: 'bpm', crew: true, threshold: (a) => null,
    lines: (id) => [['heart_rate_bpm', 'var(--ice)'], ['heart_rate_expected', 'var(--muted)', true], ['heart_rate_threshold', 'var(--alert)', true]],
    legend: 'solid actual · dashed expected / threshold (activity-adjusted)' },
  bp: { label: 'Blood pressure', unit: 'mmHg', crew: true, lines: () => [['systolic_mmhg', 'var(--ice)'], ['diastolic_mmhg', 'var(--steel-2)']],
    legend: 'systolic · diastolic · telemetry only (no alert rule)' },
  median_reaction_time_ms: { label: 'Reaction time', unit: 'ms', crew: true, lines: () => [['median_reaction_time_ms', 'var(--accent)']],
    threshold: (a) => a?.comparisons.median_reaction_time_ms?.threshold, legend: 'simulated PVT · gaps while asleep / exercising' },
  spo2_pct: { label: 'SpO₂', unit: '%', crew: true, lines: () => [['spo2_pct', 'var(--ok)']], legend: 'telemetry only' },
  co2_ppm: { label: 'Cabin CO₂', unit: 'ppm', lines: () => [['co2_ppm', 'var(--watch)']], cabinThreshold: 'co2_ppm', legend: 'shared cabin · context, not cause' },
  temperature_c: { label: 'Cabin temp', unit: '°C', lines: () => [['temperature_c', 'var(--watch)']], cabinThreshold: 'temperature_c', legend: 'shared cabin' },
};

// Readout name + formatting key for each history field drawn above.
const LINE_META = {
  heart_rate_bpm: ['Heart rate', 'heart_rate_bpm'], heart_rate_expected: ['Expected', 'heart_rate_bpm'],
  heart_rate_threshold: ['Threshold', 'heart_rate_bpm'], systolic_mmhg: ['Systolic', 'systolic_mmhg'],
  diastolic_mmhg: ['Diastolic', 'diastolic_mmhg'], median_reaction_time_ms: ['Reaction time', 'median_reaction_time_ms'],
  spo2_pct: ['SpO₂', 'spo2_pct'], co2_ppm: ['CO₂', 'co2_ppm'], temperature_c: ['Temperature', 'temperature_c'],
};

const targetName = (f, target) => (target === 'cabin' ? 'Cabin' : f.astronauts.find((a) => a.id === target)?.name || target);

export function mountBottom(el, ctx) {
  const { feed, store } = ctx;
  setHTML(el, `${cardHead({ idx: '01', title: 'Alerts', page: 'alerts' })}
    <div class="alerts-card" id="al-body"></div>
    <footer class="card__foot"><span id="al-events"></span><span class="muted">Steps, trends &amp; timeline inside</span></footer>`);
  el.dataset.expandCard = 'alerts';

  return function render() {
    const f = feed.state.frame;
    if (!f) return;
    const live = feed.connection === 'live';
    const issues = ctx.issues();
    const alerts = issues.filter((i) => i.level === 'alert');
    const watch = issues.filter((i) => i.level === 'watch');
    const body = el.querySelector('#al-body');
    if (!live) {
      setHTML(body, `<div class="state state--na"><strong>No live data</strong><span>Statuses are unknown, so they show grey, not green.</span></div>`);
    } else if (!issues.length) {
      setHTML(body, `<div class="state state--ok"><span class="state__mark" aria-hidden="true"></span><strong>All clear</strong>
        <span>All three astronauts and the cabin are inside their personal ranges.</span></div>`);
    } else {
      setHTML(body, `<div class="bigcount">${alerts.length
          ? `<strong class="mono">${alerts.length}</strong><span>active alert${alerts.length === 1 ? '' : 's'}</span>`
          : '<strong class="mono bigcount--quiet">0</strong><span>alerts</span>'}
          ${watch.length ? `<span class="bigcount__watch"><i class="sq sq--watch"></i>${watch.length} to watch</span>` : ''}</div>
        <ul class="alert-rows">${issues.slice(0, 3).map((x) => {
          const pr = responseProgress(ctx, x);
          return `<li><button type="button" class="alert-row" data-issue="${x.id}" aria-label="Response steps: ${escapeHtml(x.title)}, ${escapeHtml(x.who)}">
            <span class="sq sq--${x.level}" aria-hidden="true"></span>
            <span class="alert-row__who">${escapeHtml(x.who.replace('Astronaut ', 'A-'))}</span>
            <span class="alert-row__text">${escapeHtml(x.title)}</span>
            <span class="alert-row__go mono">${pr.acked ? '✓ ack' : pr.done ? `${pr.done}/${pr.total}` : 'Steps'} →</span></button></li>`;
        }).join('')}
          ${issues.length > 3 ? `<li class="muted small alert-rows__more">+${issues.length - 3} more inside</li>` : ''}</ul>`);
    }
    const pending = alerts.filter((x) => !responseProgress(ctx, x).acked).length;
    el.querySelector('#al-events').textContent = pending ? `${pending} awaiting response` : `${feed.state.events.length} event${feed.state.events.length === 1 ? '' : 's'} this run`;
  };
}

export const alertsPage = {
  id: 'alerts',
  kicker: () => 'Issues, response steps & trends',
  title: () => 'Alerts & data',
  mount(body, ctx) {
    const { feed, store } = ctx;
    let metric = 'heart_rate_bpm';
    let page = 0;
    let side = 'issues';
    const PER_PAGE = 6;
    setHTML(body, `
      <div class="alerts-page">
        <section class="panel alerts-page__trends">
          <header class="panel__head"><div class="tabs tabs--small" role="tablist" id="ap-metrics">${Object.entries(TRENDS).map(([k, t]) =>
            `<button type="button" role="tab" data-metric="${k}">${t.label}</button>`).join('')}</div>
            <div class="segmented" role="group" aria-label="Astronaut" id="ap-who"></div></header>
          <div class="alerts-page__chart" id="ap-main"></div>
          <div class="alerts-page__chart alerts-page__chart--crew" id="ap-crew"></div>
        </section>
        <section class="panel alerts-page__events">
          <div class="tabs tabs--small" role="tablist">
            <button type="button" role="tab" data-side="issues">Active issues <span class="count" id="ap-issue-count"></span></button>
            <button type="button" role="tab" data-side="timeline">Timeline</button></div>
          <ul class="issue-list" id="ap-issues"></ul>
          <ol class="events" id="ap-events"></ol>
          <footer class="pager" id="ap-pager"><button type="button" class="btn btn--small" data-page="-1">‹ Newer</button>
            <span class="mono small" id="ap-page"></span><button type="button" class="btn btn--small" data-page="1">Older ›</button></footer>
        </section>
      </div>`);
    body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-metric],[data-who],[data-page],[data-ack],[data-side]');
      if (!t) return;
      if (t.dataset.side) side = t.dataset.side;
      else if (t.dataset.metric) metric = t.dataset.metric;
      else if (t.dataset.who) store.set({ astronaut: t.dataset.who });
      else if (t.dataset.page) page = Math.max(0, page + Number(t.dataset.page));
      else if (t.dataset.ack) {
        const note = body.querySelector(`[data-note="${t.dataset.ack}"]`)?.value.trim() || '';
        store.set({ acks: { ...store.get().acks, [t.dataset.ack]: { at: new Date().toISOString(), note } } });
      }
      render();
    });

    function render() {
      const f = feed.state.frame;
      if (!f) return;
      const s = store.get();
      const hist = feed.state.history;
      const def = TRENDS[metric];
      body.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.metric === metric)));
      setHTML(body.querySelector('#ap-who'), def.crew ? f.astronauts.map((a) => `<button type="button" data-who="${a.id}" aria-pressed="${a.id === s.astronaut}">${a.name.slice(-3)}</button>`).join('') : '');
      const xl = (t) => clockOf(hist.find((h) => h.t === t)?.at);
      const pts = (fn) => hist.map((h) => ({ x: h.t, y: fn(h) ?? null, gap: h.gap }));
      const a = f.astronauts.find((x) => x.id === s.astronaut);
      const threshold = def.cabinThreshold ? f.cabin.comparisons[def.cabinThreshold]?.threshold : def.threshold?.(a);
      const series = def.lines(a.id).map(([key, color, dashed]) => ({ name: LINE_META[key][0], key: LINE_META[key][1], color, dashed,
        points: pts((h) => (def.crew ? h.crew[a.id]?.[key] : h.cabin[key])) }));
      const now = def.crew ? (metric === 'bp' ? `${a.blood_pressure.systolic_mmhg}/${a.blood_pressure.diastolic_mmhg} mmHg` : fmt(a.comparisons[metric]?.value ?? a[metric], metric))
        : fmt(f.cabin[metric], metric);
      setHTML(body.querySelector('#ap-main'), `<figure class="mini-chart mini-chart--large">
        <figcaption><span>${def.crew ? a.name : 'Shared cabin'} · ${def.label}</span><strong class="mono" data-value="main"></strong></figcaption>
        <div class="chart-slot" data-chart="main"></div>
        <span class="muted small">${def.legend} · gaps = disconnected, not interpolated</span></figure>`);
      setText(body.querySelector('[data-value="main"]'), now);
      const firstKey = def.lines(a.id)[0][0];
      setHTML(body.querySelector('#ap-crew'), def.crew ? `<figure class="mini-chart">
        <figcaption><span>Crew comparison · ${def.label}${metric === 'bp' ? ' (systolic)' : ''}</span>
          <span class="series-key">${f.astronauts.map((x, i) => `<i style="background:${SERIES[i]}"></i>${x.name.slice(-3)}`).join(' ')}</span></figcaption>
        <div class="chart-slot" data-chart="crew"></div></figure>`
        : `<p class="muted small">Cabin readings are shared by all crew and are never summed into a crew score.</p>`);
      drawCharts(body, {
        main: { series, threshold, label: `${def.label} trend`, xLabel: xl },
        crew: { series: f.astronauts.map((x, i) => ({ name: x.name, key: LINE_META[firstKey][1], color: SERIES[i], points: pts((h) => h.crew[x.id]?.[firstKey]) })), label: `${def.label} across crew`, xLabel: xl },
      });

      const issues = ctx.issues();
      body.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.side === side)));
      body.querySelector('#ap-issue-count').textContent = issues.length || '';
      body.querySelector('#ap-issues').hidden = side !== 'issues';
      body.querySelector('#ap-events').hidden = side !== 'timeline';
      body.querySelector('#ap-pager').hidden = side !== 'timeline';
      setHTML(body.querySelector('#ap-issues'), issues.length ? issues.slice(0, 6).map((x) => {
        const pr = responseProgress(ctx, x);
        const lead = x.evidence.find((v) => v.breached) || x.evidence[0];
        return `<li class="issue issue--${x.level}">
          <span class="sq sq--${x.level}" aria-hidden="true"></span>
          <div class="issue__text"><strong>${escapeHtml(x.title)}</strong>
            <span class="muted small">${escapeHtml(x.who)}${lead ? ` · ${fmt(lead.value, lead.key)} (limit ${fmt(lead.threshold, lead.key)})` : ''}${x.level === 'watch' ? ' · watch' : ''}</span></div>
          <span class="issue__progress mono small">${pr.acked ? '✓ acknowledged' : `${pr.done}/${pr.total} steps`}</span>
          <button type="button" class="btn btn--small${x.level === 'alert' && !pr.acked ? ' btn--primary' : ''}" data-issue="${x.id}">Response steps</button></li>`;
      }).join('') + (issues.length > 6 ? `<li class="muted small">+${issues.length - 6} more</li>` : '')
        : '<li class="state state--ok"><strong>All clear</strong><span>No alerts or watch items. Trigger a scenario from Simulate to see the response steps.</span></li>');

      const events = feed.state.events;
      const pages = Math.max(1, Math.ceil(events.length / PER_PAGE));
      page = Math.min(page, pages - 1);
      body.querySelector('#ap-page').textContent = `${page + 1} / ${pages}`;
      body.querySelector('[data-page="-1"]').disabled = page === 0;
      body.querySelector('[data-page="1"]').disabled = page >= pages - 1;
      const list = body.querySelector('#ap-events');
      if (list.contains(document.activeElement) && document.activeElement.matches('input')) return; // keep a note being typed
      setHTML(list, events.length ? events.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((e) => {
        const ack = s.acks[e.key];
        return `<li class="event event--${e.type}">
          <span class="mono small">${clockOf(e.at)}</span>
          <span class="pill pill--${e.type === 'opened' ? 'alert' : 'normal'}">${e.type === 'opened' ? '▲ Opened' : '● Cleared'}</span>
          <div class="event__text"><strong>${escapeHtml(targetName(f, e.target))}</strong> ${escapeHtml(e.label)}
            <span class="muted small">${REASONS[e.reason] || e.reason} · <button type="button" class="linkbtn" data-story="${e.alert_id}">How it was detected →</button></span></div>
          ${e.type === 'opened' ? (ack
            ? `<span class="small ack">✓ Acknowledged ${ack.at.slice(11, 16)} UTC${ack.note ? ` — “${escapeHtml(ack.note)}”` : ''}</span>`
            : issues.some((x) => x.id === `${e.rule}:${e.target}`)
              ? `<span class="ack-form"><button type="button" class="btn btn--small" data-issue="${e.rule}:${e.target}">Response steps &amp; acknowledge</button></span>`
              : `<span class="ack-form"><input type="text" data-note="${e.key}" placeholder="Optional note" aria-label="Acknowledgement note" maxlength="140">
               <button type="button" class="btn btn--small" data-ack="${e.key}">Acknowledge</button></span>`) : ''}
        </li>`;
      }).join('') : '<li class="muted">No alert events this run. Trigger a scenario from the top bar to see detection and recovery.</li>');
    }
    return { render };
  },
};
