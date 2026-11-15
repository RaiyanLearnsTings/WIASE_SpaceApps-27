// Top-view habitat floor plan with the synthetic zone sensors from frame.cabin.sensors.
// Pure module (returns SVG strings) — tested in tests/web/cabinmap.test.mjs.
//
// Sensor status rules (no new thresholds; mirrors the server):
//   watch — the sensor's own reading is past the cabin threshold (server sets sensor.status)
//   alert — the matching cabin-wide alert is active AND this is the sensor furthest past threshold
//           for that metric (the alert itself is always evaluated on the cabin-wide reading)

export const ZONES = [
  // lx/top: label anchor (inset from the zone's top-left); hatches are kept clear of these corners.
  { id: 'rest', label: 'REST', d: 'M60 40H330V260H60Z', lx: 78, top: 40 },
  { id: 'work', label: 'WORK', d: 'M330 40H940V260H330Z', lx: 348, top: 40 },
  { id: 'systems', label: 'SYSTEMS', d: 'M60 260H260V580H60Z', lx: 78, top: 260 },
  { id: 'lab', label: 'LAB', d: 'M420 330H940V580H420Z', lx: 438, top: 330 },
];
const CORRIDOR = 'M260 260H940V330H420V580H260Z';
// Hatches between modules: [x, y, w, h]
const HATCHES = [[326, 120, 8, 60], [196, 256, 52, 8], [560, 256, 80, 8], [256, 282, 8, 48], [416, 470, 8, 60]];

export const METRIC_RULE = { co2_ppm: 'co2_high', temperature_c: 'cabin_heat_humidity', relative_humidity_pct: 'cabin_heat_humidity', noise_dba: null };
export const METRIC_SHORT = { co2_ppm: 'CO₂', temperature_c: 'TEMP', relative_humidity_pct: 'RH', noise_dba: 'NOISE' };

export const toPlan = (s) => [60 + s.x * 880, 40 + s.y * 540];

/** How far past threshold a sensor is, in units of (threshold − expected). ≤ 0 means inside. */
export function excess(s) {
  const span = Math.abs(s.threshold - s.expected) || 1;
  return (s.value - s.threshold) / span;
}

export function sensorStatuses(frame, { live = true } = {}) {
  const sensors = frame?.cabin?.sensors || [];
  const out = {};
  for (const s of sensors) out[s.id] = !live ? 'unavailable' : s.status === 'watch' ? 'watch' : 'normal';
  if (!live) return out;
  const activeRules = new Set((frame.active_alerts || []).filter((a) => a.target === 'cabin').map((a) => a.rule));
  for (const metric of Object.keys(METRIC_RULE)) {
    if (!activeRules.has(METRIC_RULE[metric])) continue;
    const worst = sensors.filter((s) => s.metric === metric && out[s.id] === 'watch')
      .sort((a, b) => excess(b) - excess(a))[0];
    if (worst) out[worst.id] = 'alert';
  }
  return out;
}

/** Radius (plan units) of the affected-area ring; 0 when the sensor is inside its range. */
export function sensorRadius(s, status) {
  if (status !== 'watch' && status !== 'alert') return 0;
  return Math.round(Math.min(120, Math.max(40, 40 + 80 * Math.max(0, excess(s)))));
}

const fmtValue = (s) => {
  const d = { co2_ppm: 0, temperature_c: 1, relative_humidity_pct: 0, noise_dba: 0 }[s.metric] ?? 1;
  const unit = { co2_ppm: ' ppm', temperature_c: '°C', relative_humidity_pct: '%', noise_dba: ' dBA' }[s.metric] ?? '';
  return Number.isFinite(s.value) ? `${s.value.toFixed(d)}${unit}` : '—';
};

/**
 * @param frame   live frame (may be null)
 * @param opts    { live, mini, selected } — mini hides labels for the dashboard card
 */
export function cabinMap(frame, { live = true, mini = false, selected = null } = {}) {
  const sensors = frame?.cabin?.sensors || [];
  const statuses = sensorStatuses(frame, { live });
  const zoneWorst = {};
  for (const s of sensors) {
    const st = statuses[s.id];
    if (st === 'alert' || (st === 'watch' && zoneWorst[s.zone] !== 'alert')) zoneWorst[s.zone] = st;
  }
  const rings = sensors.map((s) => {
    const st = statuses[s.id];
    const r = sensorRadius(s, st);
    if (!r) return '';
    const [x, y] = toPlan(s);
    return `<circle class="ring ring--${st}" cx="${x}" cy="${y}" r="${r}"/>`;
  }).join('');
  const dots = sensors.map((s) => {
    const st = statuses[s.id];
    const [x, y] = toPlan(s);
    const label = `${METRIC_SHORT[s.metric]} sensor, ${s.zone}: ${fmtValue(s)}, ${st === 'normal' ? 'within range' : st}`;
    const anchorRight = x > 840;
    return `<g class="sensor sensor--${st}${selected === s.id ? ' is-selected' : ''}" ${mini ? '' : `tabindex="0" role="button" data-sensor="${s.id}"`} aria-label="${label}">
      <circle class="sensor__hit" cx="${x}" cy="${y}" r="22"/>
      <circle class="sensor__dot" cx="${x}" cy="${y}" r="${mini ? 16 : 8}"/>
      ${mini ? '' : `<text class="sensor__tag" x="${anchorRight ? x - 14 : x + 14}" y="${y - 6}" text-anchor="${anchorRight ? 'end' : 'start'}">${METRIC_SHORT[s.metric]}</text>
      <text class="sensor__val" x="${anchorRight ? x - 14 : x + 14}" y="${y + 12}" text-anchor="${anchorRight ? 'end' : 'start'}">${fmtValue(s)}</text>`}
    </g>`;
  }).join('');

  return `<svg class="cabinmap${mini ? ' cabinmap--mini' : ''}" viewBox="${mini ? '40 20 920 580' : '0 0 1000 620'}" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Top view of the habitat: Rest, Work, Systems and Lab modules with ${sensors.length} synthetic zone sensors">
    <defs><pattern id="plan-grid${mini ? '-m' : ''}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" class="plan-grid"/></pattern></defs>
    <rect x="0" y="0" width="1000" height="620" fill="url(#plan-grid${mini ? '-m' : ''})"/>
    <path class="hull" d="M48 28H952V592H48Z"/>
    <path class="corridor" d="${CORRIDOR}"/>
    ${ZONES.map((z) => `<path class="zone zone--${zoneWorst[z.id] || 'normal'}" d="${z.d}"/>
      <text class="zone__label" x="${z.lx}" y="${z.top + (mini ? 46 : 32)}">${z.label}</text>`).join('')}
    ${HATCHES.map(([x, y, w, h]) => `<rect class="hatch" x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('')}
    <g class="rings">${rings}</g>
    <g class="sensors">${dots}</g>
  </svg>`;
}
