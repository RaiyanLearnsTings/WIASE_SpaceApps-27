// Cabin environment: dashboard card (mini top-view map + key readings) and the expanded Cabin page
// (large map with the synthetic zone sensors, sensor detail, readings and trends).
import { fmt, statusPill, clockOf, STATUS } from '../format.mjs';
import { drawCharts, sparkline } from '../charts.mjs';
import { cabinMap, sensorStatuses, METRIC_SHORT } from './cabinmap.mjs';
import { cardHead } from './card.mjs';
import { setHTML, setText } from '../dom.mjs';

const READINGS = [
  ['co2_ppm', 'CO₂'], ['temperature_c', 'Temperature'], ['relative_humidity_pct', 'Humidity'], ['noise_dba', 'Noise'],
];
const ZONE_LABEL = { rest: 'Rest', work: 'Work', systems: 'Systems', lab: 'Lab' };

export function readingStatus(f, key, live) {
  if (!live) return 'unavailable';
  const c = f.cabin.comparisons?.[key];
  if (!c) return 'unavailable';
  const rule = key === 'co2_ppm' ? 'co2_high' : (key === 'temperature_c' || key === 'relative_humidity_pct') ? 'cabin_heat_humidity' : null;
  if (rule && f.active_alerts.some((a) => a.rule === rule && a.target === 'cabin')) return 'alert';
  return c.threshold_breached ? 'watch' : 'normal';
}

const valueParts = (v, key) => {
  const text = fmt(v, key);
  const i = text.lastIndexOf(' ');
  return i > 0 ? `${text.slice(0, i)}<small>${text.slice(i + 1)}</small>` : text;
};

function hotSensorsLine(f, live) {
  const st = sensorStatuses(f, { live });
  const hot = (f.cabin.sensors || []).filter((s) => st[s.id] === 'alert' || st[s.id] === 'watch')
    .sort((a, b) => (st[b.id] === 'alert') - (st[a.id] === 'alert'));
  if (!live) return '<span class="muted small">Feed not live</span>';
  if (!hot.length) return '<span class="muted small">All zone sensors in range</span>';
  return hot.slice(0, 3).map((s) => `<span class="flag flag--${st[s.id]}"><span aria-hidden="true">${STATUS[st[s.id]].icon}</span>${ZONE_LABEL[s.zone]} ${METRIC_SHORT[s.metric]}</span>`).join('')
    + (hot.length > 3 ? `<span class="muted small">+${hot.length - 3}</span>` : '');
}

export function mountCabin(el, ctx) {
  const { feed } = ctx;
  setHTML(el, `${cardHead({ idx: '03', title: 'Cabin', kicker: 'Habitat 01 · shared air', page: 'cabin' })}
    <div class="cabin-card">
      <div class="cabin-card__map" id="cabin-mini"></div>
      <div class="cabin-card__side" id="cabin-side"></div>
    </div>
    <footer class="card__foot"><span id="cabin-hot"></span><span class="muted">Humidity, noise, radiation inside</span></footer>`);
  el.dataset.expandCard = 'cabin';

  return function render() {
    const f = feed.state.frame;
    if (!f) return;
    const live = feed.connection === 'live';
    const hist = feed.state.history.slice(-90);
    setHTML(el.querySelector('#cabin-mini'), cabinMap(f, { live, mini: true }));
    setHTML(el.querySelector('#cabin-side'), READINGS.slice(0, 2).map(([key, label]) => {
      const s = readingStatus(f, key, live);
      return `<div class="stat stat--${s}">
        <span class="stat__label">${label}</span>
        <span class="stat__value">${valueParts(f.cabin[key], key)}</span>
        ${sparkline(hist.map((h) => h.cabin[key]), { color: 'currentColor', height: 22 })}
      </div>`;
    }).join(''));
    setHTML(el.querySelector('#cabin-hot'), hotSensorsLine(f, live));
  };
}

/** Expanded Cabin page. */
export const cabinPage = {
  id: 'cabin',
  kicker: () => 'Shared environment · Habitat 01',
  title: () => 'Cabin status',
  mount(body, ctx) {
    const { feed } = ctx;
    let selected = null;
    setHTML(body, `
      <div class="cabin-page">
        <section class="panel cabin-page__map">
          <header class="panel__head"><h3>Top view · zone sensors</h3>
            <div class="legend-inline"><span class="lg lg--normal">In range</span><span class="lg lg--watch">Past threshold</span><span class="lg lg--alert">Driving cabin alert</span></div></header>
          <div class="cabin-page__svg" id="cp-map"></div>
          <p class="footnote">Zone sensors are synthetic offsets of the measured RR-6 cabin profile; scenario effects are concentrated in one zone.
            Alerts are evaluated on the cabin-wide reading. Ring size grows with distance past threshold. No causal link to crew changes is claimed.</p>
        </section>
        <aside class="cabin-page__side">
          <section class="panel" id="cp-sensor"></section>
          <section class="panel"><div class="tiles" id="cp-tiles"></div></section>
          <section class="panel cabin-page__charts" id="cp-charts"></section>
        </aside>
      </div>`);
    const map = body.querySelector('#cp-map');
    const pick = (e) => {
      const g = e.target.closest('[data-sensor]');
      if (!g) return;
      selected = selected === g.dataset.sensor ? null : g.dataset.sensor;
      render();
      map.querySelector(`[data-sensor="${selected || g.dataset.sensor}"]`)?.focus({ preventScroll: true });
    };
    map.addEventListener('click', pick);
    map.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });

    function render() {
      const f = feed.state.frame;
      if (!f) return;
      const live = feed.connection === 'live';
      const hist = feed.state.history;
      const focusedId = document.activeElement?.closest?.('[data-sensor]')?.dataset.sensor;
      setHTML(map, cabinMap(f, { live, selected }));
      if (focusedId) map.querySelector(`[data-sensor="${focusedId}"]`)?.focus({ preventScroll: true });

      const st = sensorStatuses(f, { live });
      const sensors = f.cabin.sensors || [];
      const s = sensors.find((x) => x.id === selected)
        || sensors.filter((x) => st[x.id] !== 'normal').sort((a, b) => (st[b.id] === 'alert') - (st[a.id] === 'alert'))[0];
      setHTML(body.querySelector('#cp-sensor'), s ? `
        <header class="panel__head"><h3>${ZONE_LABEL[s.zone]} · ${METRIC_SHORT[s.metric]} sensor</h3>${statusPill(st[s.id] === 'normal' ? 'normal' : st[s.id])}</header>
        <div class="sensor-detail">
          <div><span class="label">Reading</span><strong class="mono">${fmt(s.value, s.metric)}</strong></div>
          <div><span class="label">Expected</span><span class="mono">${fmt(s.expected, s.metric)}</span></div>
          <div><span class="label">Threshold</span><span class="mono">${fmt(s.threshold, s.metric)}</span></div>
        </div>
        <p class="muted small">${selected ? 'Selected sensor.' : 'Highest-priority sensor shown; click any sensor on the map.'} Synthetic zone channel.</p>`
        : `<header class="panel__head"><h3>Zone sensors</h3>${statusPill(live ? 'normal' : 'unavailable', live ? 'All in range' : 'No data')}</header>
           <p class="muted small">Click a sensor on the map to see its reading against the cabin baseline.</p>`);

      setHTML(body.querySelector('#cp-tiles'), READINGS.map(([key, label]) => {
        const rs = readingStatus(f, key, live);
        return `<div class="stat stat--${rs}"><span class="stat__label">${label}${key === 'noise_dba' ? ' <span class="tag tag--synthetic">SYN</span>' : ''}</span>
          <span class="stat__value">${valueParts(f.cabin[key], key)}</span><span class="stat__meta">thr ${fmt(f.cabin.comparisons[key]?.threshold, key)}</span></div>`;
      }).join('') + `<div class="stat stat--info"><span class="stat__label">Radiation</span>
          <span class="stat__value">${valueParts(f.cabin.radiation?.absorbed_dose_rate_ugy_h, 'absorbed_dose_rate_ugy_h')}</span><span class="stat__meta">Σ ${fmt(f.cabin.radiation?.cumulative_absorbed_dose_ugy, 'cumulative_dose_ugy')} · NASA RadLab</span></div>
        <div class="stat stat--assumed"><span class="stat__label">O₂ / pressure</span>
          <span class="stat__value">21<small>%</small> · 101.3<small>kPa</small></span><span class="stat__meta">assumed</span></div>`);

      const xl = (t) => clockOf(hist.find((h) => h.t === t)?.at);
      setHTML(body.querySelector('#cp-charts'), READINGS.map(([key, label]) => `<figure class="mini-chart">
        <figcaption><span>${label}</span><strong class="mono" data-value="${key}"></strong></figcaption>
        <div class="chart-slot" data-chart="${key}"></div></figure>`).join(''));
      // Values change every frame; the chart frames don't (rebuilding them would discard the charts).
      for (const [key] of READINGS) setText(body.querySelector(`[data-value="${key}"]`), fmt(f.cabin[key], key));
      drawCharts(body.querySelector('#cp-charts'), Object.fromEntries(READINGS.map(([key, label]) => [key, {
        series: [{ name: label, key, color: 'var(--ice)', points: hist.map((h) => ({ x: h.t, y: h.cabin[key], gap: h.gap })) }],
        threshold: f.cabin.comparisons[key]?.threshold, label: `${label} history`, xLabel: xl }])));
    }
    return { render };
  },
};
