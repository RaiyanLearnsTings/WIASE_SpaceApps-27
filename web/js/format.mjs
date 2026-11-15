// Formatting helpers and metric metadata shared by every panel. Pure module (no DOM).

export const METRICS = {
  heart_rate_bpm: { label: 'Heart rate', unit: 'bpm', digits: 0 },
  systolic_mmhg: { label: 'Systolic BP', unit: 'mmHg', digits: 0 },
  diastolic_mmhg: { label: 'Diastolic BP', unit: 'mmHg', digits: 0 },
  spo2_pct: { label: 'SpO₂', unit: '%', digits: 1 },
  median_reaction_time_ms: { label: 'Reaction time (median)', unit: 'ms', digits: 0 },
  lapses: { label: 'Lapses', unit: '', digits: 0 },
  state_anxiety_score: { label: 'State anxiety (STAI-S)', unit: '/80', digits: 0 },
  last_sleep_duration_min: { label: 'Last sleep', unit: 'min', digits: 0 },
  co2_ppm: { label: 'Cabin CO₂', unit: 'ppm', digits: 0 },
  temperature_c: { label: 'Cabin temperature', unit: '°C', digits: 1 },
  relative_humidity_pct: { label: 'Relative humidity', unit: '%', digits: 1 },
  noise_dba: { label: 'Cabin noise', unit: 'dBA', digits: 1, synthetic: true },
  absorbed_dose_rate_ugy_h: { label: 'Absorbed dose rate', unit: 'µGy/h', digits: 2 },
  cumulative_dose_ugy: { label: 'Cumulative absorbed dose', unit: 'µGy', digits: 2 },
};

export const STATUS = {
  alert: { label: 'Alert', icon: '▲', rank: 4 },
  watch: { label: 'Watch', icon: '◆', rank: 3 },
  unavailable: { label: 'No data', icon: '○', rank: 2 },
  normal: { label: 'Normal', icon: '●', rank: 1 },
  info: { label: 'Telemetry', icon: 'ℹ', rank: 0 },
};

export const ACTIVITY = {
  sleeping: 'Sleeping', awake_in_bed: 'Awake in bed', exercising: 'Exercising',
  recovering: 'Post-exercise recovery', working: 'Working', resting: 'Resting',
};

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Number with units, or an em dash for missing values (never 0). */
export function fmt(value, key, { unit = true } = {}) {
  if (!isNum(value)) return '—';
  const meta = METRICS[key] || { digits: 1, unit: '' };
  const text = value.toLocaleString('en-US', {
    minimumFractionDigits: meta.digits, maximumFractionDigits: meta.digits,
  });
  return unit && meta.unit ? `${text} ${meta.unit}` : text;
}

export function signed(value, digits = 1) {
  if (!isNum(value)) return '—';
  const s = value.toFixed(digits);
  return value > 0 ? `+${s}` : s;
}

/** "08:42:10" from an ISO UTC string. */
export function clockOf(iso) {
  return typeof iso === 'string' && iso.length >= 19 ? iso.slice(11, 19) : '--:--:--';
}

export function dayOf(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

/** Elapsed seconds as "T+1d 02:15". */
export function elapsedLabel(seconds) {
  if (!isNum(seconds)) return 'T+—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `T+${d ? `${d}d ` : ''}${pad(h)}:${pad(m)}`;
}

export function durationLabel(seconds) {
  if (!isNum(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** Tagged template that escapes interpolations unless wrapped with raw(). */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = values[i - 1];
    const text = v && v.__raw ? v.value : Array.isArray(v) ? v.map((x) => (x && x.__raw ? x.value : escapeHtml(x))).join('') : escapeHtml(v);
    return out + text + s;
  }, '');
}
export const raw = (value) => ({ __raw: true, value: String(value ?? '') });

export function statusPill(status, text) {
  const meta = STATUS[status] || STATUS.unavailable;
  return `<span class="pill pill--${status}"><span aria-hidden="true">${meta.icon}</span>${escapeHtml(text ?? meta.label)}</span>`;
}
