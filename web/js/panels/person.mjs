// Individual astronaut page: static facts + personal baselines (left), the 3D body with out-of-range
// structures lit (centre), region details & recommendations (right) and key-measurement trends (bottom).
import { ACTIVITY, METRICS, fmt, signed, statusPill, clockOf, isNum } from '../format.mjs';
import { drawCharts } from '../charts.mjs';
import { mountSidebar } from './sidebar.mjs';
import { hhmm } from './schedule.mjs';
import { ATTRIBUTION } from '../body/anatomy.mjs';

const BASELINE_ROWS = [
  ['heart_rate_bpm', 'Heart rate'], ['spo2_pct', 'SpO₂'], ['systolic_mmhg', 'Systolic'], ['diastolic_mmhg', 'Diastolic'],
  ['median_reaction_time_ms', 'Reaction time'], ['lapses', 'Lapses'], ['state_anxiety_score', 'Anxiety'],
];

export const personPage = {
  id: 'person',
  kicker: (ctx) => {
    const a = ctx.currentAstronaut();
    return a ? `${ACTIVITY[a.activity] || a.activity}${a.sleep.stage ? ` · ${a.sleep.stage}` : ''} · synthetic telemetry` : '';
  },
  title: (ctx) => ctx.currentAstronaut()?.name || 'Astronaut',
  head: (ctx) => {
    const f = ctx.feed.state.frame;
    if (!f) return '';
    const s = ctx.store.get();
    const live = ctx.feed.connection === 'live';
    const a = ctx.currentAstronaut();
    return `${statusPill(live ? a.alert_status : 'unavailable')}
      <div class="segmented" role="group" aria-label="Switch astronaut">${f.astronauts.map((x) =>
        `<button type="button" data-switch="${x.id}" aria-pressed="${x.id === s.astronaut}">${x.name.slice(-3)}</button>`).join('')}</div>`;
  },
  onCancel(ctx) {
    if (ctx.store.get().organ) { ctx.store.set({ organ: null }); return true; }
    return false;
  },
  mount(body, ctx) {
    const { feed, store } = ctx;
    body.innerHTML = `
      <div class="person">
        <section class="panel person__facts">
          <header class="panel__head"><h3>Facts & baselines</h3></header>
          <dl class="facts" id="pp-facts"></dl>
          <table class="baselines" id="pp-baselines"></table>
        </section>
        <section class="person__stage">
          <div class="legend" aria-label="Legend">
            <span class="legend__item legend__item--normal">Normal</span><span class="legend__item legend__item--watch">Watch</span>
            <span class="legend__item legend__item--alert">Alert</span><span class="legend__item legend__item--info">Telemetry</span>
            <span class="legend__item legend__item--unavailable">No data</span>
          </div>
          <div class="person__viewer" id="pp-viewer"></div>
          <div class="view-tools" role="toolbar" aria-label="Camera views" id="pp-views">
            <span class="label">View</span>
            ${['front', 'back', 'left', 'right', 'iso'].map((v) => `<button type="button" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
            <button type="button" data-view="reset" class="is-strong">Reset</button>
          </div>
          <p class="stage__hint">Drag to orbit · right-drag to pan · scroll to zoom · click a point or organ to isolate it.
            Lit structures = regions outside this astronaut's range.</p>
          <p class="credit" title="Model licence: web/models/LICENSE.txt">${ATTRIBUTION}</p>
        </section>
        <aside class="panel person__side" id="pp-side" aria-label="Region details and recommendations"></aside>
        <section class="panel person__trends"><div class="trend-row" id="pp-trends"></div></section>
      </div>`;
    body.querySelector('#pp-viewer').append(ctx.viewerHost);
    ctx.viewer?.resize?.();
    const sideRender = mountSidebar(body.querySelector('#pp-side'), ctx);
    body.querySelector('#pp-views').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) ctx.viewer?.setView(b.dataset.view);
    });
    body.querySelector('#pp-views').hidden = !!ctx.viewerIsFallback;
    const onSwitch = (e) => {
      const b = e.target.closest('[data-switch]');
      if (b) store.set({ astronaut: b.dataset.switch, organ: null });
    };
    ctx.pageEl.addEventListener('click', onSwitch);

    return {
      render() {
        const f = feed.state.frame;
        if (!f) return;
        const a = ctx.currentAstronaut();
        const base = ctx.baselines?.astronauts.find((x) => x.id === a.id);
        const live = feed.connection === 'live';
        ctx.withFocus(body.querySelector('#pp-side'), sideRender);

        const plan = base?.schedule;
        body.querySelector('#pp-facts').innerHTML = `
          <div><dt>Crew ID</dt><dd class="mono">${a.id}</dd></div>
          <div><dt>Activity</dt><dd>${ACTIVITY[a.activity] || a.activity}${a.sleep.stage ? ` · ${a.sleep.stage}` : ''}</dd></div>
          <div><dt>Last sleep</dt><dd>${isNum(a.sleep.last_sleep_duration_min) ? `${Math.floor(a.sleep.last_sleep_duration_min / 60)}h ${Math.round(a.sleep.last_sleep_duration_min % 60)}m` : '—'}${isNum(a.sleep.last_sleep_efficiency_pct) ? ` · ${a.sleep.last_sleep_efficiency_pct}% eff.` : ''}</dd></div>
          <div><dt>Exercise · bed</dt><dd class="mono">${plan ? `${hhmm(plan.exercise_minute)} · ${hhmm(plan.bedtime_minute)}` : '—'}</dd></div>
          <div><dt>Sleep source</dt><dd>${base ? `${base.sleep_source.participant} · night ${base.sleep_source.template_night}` : '—'} <span class="tag tag--workbook">BIDSleep</span></dd></div>`;

        body.querySelector('#pp-baselines').innerHTML = `<thead><tr><th>Metric</th><th>Baseline</th><th>Now</th><th>z</th></tr></thead><tbody>
          ${BASELINE_ROWS.map(([key, label]) => {
            const b = base?.baseline[key];
            const c = a.comparisons[key];
            const st = !live || !c ? 'unavailable' : c.threshold_breached ? 'watch' : 'normal';
            return `<tr class="row--${st}"><th scope="row">${label}</th>
              <td class="mono">${b ? `${fmt(b.center, key, { unit: false })}<small> ±${fmt(b.spread, key, { unit: false })}</small>` : '—'}</td>
              <td class="mono">${c ? fmt(c.value, key, { unit: false }) : '—'}<small> ${METRICS[key].unit}</small></td>
              <td class="mono">${c ? signed(c.robust_z) : '—'}</td></tr>`;
          }).join('')}</tbody>`;

        const hist = feed.state.history;
        const id = a.id;
        const pts = (fn) => hist.map((h) => ({ x: h.t, y: fn(h) ?? null, gap: h.gap }));
        const xl = (t) => clockOf(hist.find((h) => h.t === t)?.at);
        const charts = [
          { title: 'Heart rate', value: fmt(a.heart_rate_bpm, 'heart_rate_bpm'), series: [
            { color: 'var(--ice)', points: pts((h) => h.crew[id]?.heart_rate_bpm) },
            { color: 'var(--muted)', dashed: true, points: pts((h) => h.crew[id]?.heart_rate_expected) },
            { color: 'var(--alert)', dashed: true, points: pts((h) => h.crew[id]?.heart_rate_threshold) }] },
          { title: 'Blood pressure', value: `${a.blood_pressure.systolic_mmhg}/${a.blood_pressure.diastolic_mmhg} mmHg`, series: [
            { color: 'var(--ice)', points: pts((h) => h.crew[id]?.systolic_mmhg) },
            { color: 'var(--steel-2)', points: pts((h) => h.crew[id]?.diastolic_mmhg) }] },
          { title: 'Reaction time (sim)', value: fmt(a.cognition?.median_reaction_time_ms, 'median_reaction_time_ms'),
            series: [{ color: 'var(--accent)', points: pts((h) => h.crew[id]?.median_reaction_time_ms) }], threshold: a.comparisons.median_reaction_time_ms?.threshold },
          { title: 'SpO₂', value: fmt(a.spo2_pct, 'spo2_pct'), series: [{ color: 'var(--ok)', points: pts((h) => h.crew[id]?.spo2_pct) }] },
        ];
        const trends = body.querySelector('#pp-trends');
        trends.innerHTML = charts.map((c, i) => `<figure class="mini-chart">
          <figcaption><span>${c.title}</span><strong class="mono">${c.value}</strong></figcaption>
          <div class="chart-slot" data-chart="${i}"></div></figure>`).join('');
        drawCharts(trends, Object.fromEntries(charts.map((c, i) => [i, { series: c.series, threshold: c.threshold, label: `${c.title} trend`, xLabel: xl }])));
      },
      destroy() {
        ctx.pageEl.removeEventListener('click', onSwitch);
        ctx.viewerHost.remove();
        if (store.get().organ) store.set({ organ: null });
      },
    };
  },
};
