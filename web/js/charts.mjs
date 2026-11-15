// Dependency-free SVG charts. Lines break at null values and at feed gaps; nothing is interpolated.
//
// Readout: hovering (or focusing a chart and using ← → Home End) shows a cursor with the exact values
// at that sample. The cursor is shared by simulated time, so every chart on screen marks the same
// moment. Pages redraw charts every second, so the cursor lives in module state and is re-applied
// after each redraw; the chart markup itself stays a pure string.
import { fmt } from './format.mjs';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function extent(values, pad = 0.12) {
  const nums = values.filter(isNum);
  if (!nums.length) return [0, 1];
  let lo = Math.min(...nums), hi = Math.max(...nums);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

function segments(points) {
  const out = [];
  let current = [];
  for (const p of points) {
    if (!isNum(p.y) || p.gap) { if (current.length) out.push(current); current = []; }
    if (isNum(p.y)) current.push(p);
  }
  if (current.length) out.push(current);
  return out;
}

/** Plot geometry shared by the SVG and the cursor overlay (null when there is nothing to plot). */
export function chartGeometry(series, { height = 120, width = 480, threshold = null, xDomain = null } = {}) {
  const w = Math.max(120, Math.round(width)), h = Math.max(40, Math.round(height)), l = 38, r = 8, t = 8, b = 18;
  let xs = series.flatMap((s) => s.points.map((p) => p.x)).filter(isNum);
  if (xDomain) xs = xs.filter((x) => x >= xDomain[0] && x <= xDomain[1]);
  if (!xs.length) return null;
  const x0 = xDomain ? xDomain[0] : Math.min(...xs);
  const x1 = xDomain ? xDomain[1] : Math.max(...xs, x0 + 1);
  const inX = (p) => !xDomain || (p.x >= x0 && p.x <= x1);
  const ys = series.flatMap((s) => s.points.filter(inX).map((p) => p.y));
  if (isNum(threshold)) ys.push(threshold);
  const [y0, y1] = extent(ys);
  return {
    w, h, l, r, t, b, x0, x1, y0, y1,
    X: (x) => l + ((x - x0) / (x1 - x0 || 1)) * (w - l - r),
    Y: (y) => t + (1 - (y - y0) / (y1 - y0)) * (h - t - b),
  };
}

/**
 * @param {Array<{name?, key?, color, points:{x,y,gap?}[], dashed?}>} series  name/key feed the readout
 * @param {{height?, width?, threshold?, label?, xLabel?:(x)=>string, xDomain?:[number,number],
 *          bands?:{x0,x1,cls?}[], markers?:{x,label?,cls?,row?}[]}} opts
 */
export function lineChart(series, opts = {}) {
  const { threshold = null, label = '', xLabel = null, bands = [], markers = [] } = opts;
  const g = chartGeometry(series, opts);
  if (!g) return `<div class="chart-empty">Waiting for data…</div>`;
  const { w, h, l, r, t, b, x0, x1, y0, y1, X, Y } = g;
  const clampX = (x) => Math.max(x0, Math.min(x1, x));
  let svg = `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">`;
  for (const band of bands) {
    const a = X(clampX(band.x0)), z = X(clampX(band.x1));
    if (z > a) svg += `<rect class="band ${band.cls || ''}" x="${a.toFixed(1)}" y="${t}" width="${(z - a).toFixed(1)}" height="${h - t - b}"/>`;
  }
  for (let i = 0; i <= 2; i++) {
    const v = y0 + ((y1 - y0) * i) / 2;
    svg += `<line class="grid" x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    svg += `<text class="tick" x="${l - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v * 10) / 10}</text>`;
  }
  if (xLabel) {
    svg += `<text class="tick" x="${l}" y="${h - 3}">${xLabel(x0)}</text>`;
    svg += `<text class="tick" x="${w - r}" y="${h - 3}" text-anchor="end">${xLabel(x1)}</text>`;
  }
  if (isNum(threshold)) svg += `<line class="threshold" x1="${l}" x2="${w - r}" y1="${Y(threshold)}" y2="${Y(threshold)}"/>`;
  const inX = (p) => p.x >= x0 && p.x <= x1;
  for (const s of series) {
    const pts = s.points.filter(inX);
    for (const seg of segments(pts)) {
      const d = seg.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 1.4 : 2}" ${s.dashed ? 'stroke-dasharray="4 4"' : ''} vector-effect="non-scaling-stroke"/>`;
    }
    const lastPt = [...pts].reverse().find((p) => isNum(p.y));
    if (lastPt && !s.dashed) svg += `<circle cx="${X(lastPt.x)}" cy="${Y(lastPt.y)}" r="3" fill="${s.color}"/>`;
  }
  for (const m of markers) {
    if (m.x < x0 || m.x > x1) continue;
    const x = X(m.x).toFixed(1);
    svg += `<line class="marker ${m.cls || ''}" x1="${x}" x2="${x}" y1="${t}" y2="${h - b}"/>`;
    if (m.label) {
      const right = X(m.x) > w * 0.7;
      svg += `<text class="marker__label ${m.cls || ''}" x="${right ? Number(x) - 4 : Number(x) + 4}" y="${t + 9 + (m.row || 0) * 11}" text-anchor="${right ? 'end' : 'start'}">${m.label}</text>`;
    }
  }
  return svg + '</svg>';
}

// ---- readout (pure helpers, tested in tests/web/charts.test.mjs) -----------------------------

/** Sorted unique sample times of a chart inside its domain. */
export function sampleTimes(series, g) {
  const set = new Set();
  for (const s of series) for (const p of s.points) if (isNum(p.x) && p.x >= g.x0 && p.x <= g.x1) set.add(p.x);
  return [...set].sort((a, b) => a - b);
}

/** Index of the sample time nearest to t (xs sorted ascending, non-empty). */
export function nearestIndex(xs, t) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= t) lo = mid; else hi = mid;
  }
  return Math.abs(xs[hi] - t) < Math.abs(xs[lo] - t) ? hi : lo;
}

/** Rows for the readout at sample time x: one per named series (null stays "—"), plus a fixed threshold. */
export function readoutRows(series, x, { threshold = null, thresholdKey = null } = {}) {
  const rows = series.filter((s) => s.name).map((s) => {
    const p = s.points.find((q) => q.x === x);
    const y = p && isNum(p.y) ? p.y : null;
    return { name: s.name, color: s.color, dashed: !!s.dashed, value: y === null ? '—' : s.key ? fmt(y, s.key) : String(Math.round(y * 10) / 10) };
  });
  if (isNum(threshold)) rows.push({ name: 'Threshold', color: 'var(--alert)', dashed: true, value: thresholdKey ? fmt(threshold, thresholdKey) : String(threshold) });
  return rows;
}

// ---- drawing into slots ----------------------------------------------------------------------

const cursor = { t: null, via: null, source: null }; // shared sample time; via = 'pointer' | 'key'
let wired = false;
// Slots are re-created on every redraw, so the source chart is remembered by its key + container id.
const slotId = (slot) => `${slot.closest('[id]')?.id || ''}/${slot.dataset.chart}`;
const isSource = (slot) => cursor.source === slotId(slot);

/**
 * Draw charts into placeholder slots at their real pixel size, so axis text is never stretched.
 * Markup: <div class="chart-slot" data-chart="key"></div>; specs: { key: { series, ...lineChart opts } }.
 */
export function drawCharts(root, specs) {
  wire();
  for (const slot of root.querySelectorAll('[data-chart]')) {
    const spec = specs[slot.dataset.chart];
    if (!spec) continue;
    const { series, ...opts } = spec;
    const sized = { ...opts, width: slot.clientWidth || 480, height: slot.clientHeight || opts.height || 120 };
    slot.innerHTML = lineChart(series, sized);
    const g = chartGeometry(series, sized);
    slot._chart = g ? { series, opts: sized, g, xs: sampleTimes(series, g) } : null;
    if (g && slot._chart.xs.length) {
      slot.tabIndex = 0;
      slot.setAttribute('role', 'group');
      slot.setAttribute('aria-label', `${opts.label || 'Trend'}. Use the left and right arrow keys to read values.`);
    } else {
      slot.removeAttribute('tabindex');
    }
    paintCursor(slot);
  }
  // New samples rescale the x axis: keep the hover cursor under a pointer that hasn't moved.
  if (cursor.via === 'pointer' && pointer && !pointerQueued) { pointerQueued = true; requestAnimationFrame(trackPointer); }
}

/** Place (or hide) the cursor line and value box in one slot, reusing its elements between moves. */
function paintCursor(slot) {
  const c = slot._chart;
  let line = slot.querySelector(':scope > .chart-cursor');
  let tip = slot.querySelector(':scope > .chart-tip');
  if (!c || cursor.t === null || !c.xs.length || cursor.t < c.g.x0 || cursor.t > c.g.x1) { line?.remove(); tip?.remove(); return; }
  const x = c.xs[nearestIndex(c.xs, cursor.t)];
  const { g } = c;
  const pct = (g.X(x) / g.w) * 100;
  if (!line) { line = document.createElement('div'); line.className = 'chart-cursor'; slot.append(line); }
  line.style.cssText = `left:${pct}%;top:${g.t}px;bottom:${g.b}px`;
  // Every chart marks the moment; only the chart being hovered or focused shows the value box.
  if (!isSource(slot)) { tip?.remove(); return; }
  if (!tip) { tip = document.createElement('div'); tip.setAttribute('aria-hidden', 'true'); slot.append(tip); }
  // Flip sides with a little hysteresis so the box doesn't jump back and forth near the middle.
  const left = tip.classList.contains('chart-tip--left') ? pct > 45 : pct > 58;
  tip.className = `chart-tip${left ? ' chart-tip--left' : ''}`;
  tip.style.left = `${pct}%`;
  const rows = readoutRows(c.series, x, { threshold: c.opts.threshold, thresholdKey: c.series.find((s) => s.key)?.key });
  const html = `<span class="chart-tip__time mono">${c.opts.xLabel ? c.opts.xLabel(x) : x}</span>${rows.map((r) =>
    `<span class="chart-tip__row"><i class="${r.dashed ? 'is-dashed' : ''}" style="--c:${r.color}"></i>${r.name}<b class="mono">${r.value}</b></span>`).join('')}`;
  if (tip.dataset.html !== html) { tip.innerHTML = html; tip.dataset.html = html; }
}

function paintAll() {
  for (const slot of document.querySelectorAll('.chart-slot')) if (slot._chart) paintCursor(slot);
}

function setCursor(t, via, slot = null) {
  const source = t === null || !slot ? null : slotId(slot);
  if (cursor.t === t && cursor.via === via && cursor.source === source) return;
  cursor.t = t;
  cursor.via = t === null ? null : via;
  cursor.source = source;
  paintAll();
}

function announce(slot) {
  const c = slot._chart;
  if (!c || cursor.t === null) return;
  const x = c.xs[nearestIndex(c.xs, cursor.t)];
  const rows = readoutRows(c.series, x, { threshold: c.opts.threshold, thresholdKey: c.series.find((s) => s.key)?.key });
  let live = document.getElementById('chart-live');
  if (!live) {
    live = Object.assign(document.createElement('div'), { id: 'chart-live', className: 'sr-only' });
    live.style.position = 'fixed'; // never adds height below the no-scroll layout
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
  }
  live.textContent = `${c.opts.xLabel ? c.opts.xLabel(x) : x}: ${rows.map((r) => `${r.name} ${r.value}`).join(', ')}`;
}

let pointer = null;   // last pointer position over the page
let pointerQueued = false;

/** Snap the shared cursor to whatever chart sits under the pointer (null when none). */
function trackPointer() {
  pointerQueued = false;
  if (!pointer) return;
  const slot = document.elementFromPoint(pointer.x, pointer.y)?.closest?.('.chart-slot');
  const c = slot?._chart;
  if (!c || !c.xs.length) { if (cursor.via === 'pointer') setCursor(null); return; }
  const rect = slot.getBoundingClientRect();
  const px = ((pointer.x - rect.left) / rect.width) * c.g.w;
  const t = c.g.x0 + ((px - c.g.l) / (c.g.w - c.g.l - c.g.r)) * (c.g.x1 - c.g.x0);
  setCursor(c.xs[nearestIndex(c.xs, t)], 'pointer', slot);
}

function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  // Touchpads fire pointer moves far faster than the screen refreshes: handle one per frame.
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && e.buttons === 0) return;
    pointer = { x: e.clientX, y: e.clientY };
    if (!pointerQueued) { pointerQueued = true; requestAnimationFrame(trackPointer); }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; if (cursor.via === 'pointer') setCursor(null); });
  document.addEventListener('keydown', (e) => {
    const slot = e.target.closest?.('.chart-slot');
    const c = slot?._chart;
    if (!c || !c.xs.length) return;
    const xs = c.xs;
    const i = cursor.t === null ? xs.length - 1 : nearestIndex(xs, cursor.t);
    const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: xs.length - 1 }[e.key];
    if (e.key === 'Escape' && cursor.t !== null) { e.preventDefault(); e.stopPropagation(); setCursor(null); return; }
    if (next === undefined) return;
    e.preventDefault();
    const start = cursor.t === null && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? xs.length - 1 : next;
    setCursor(xs[Math.max(0, Math.min(xs.length - 1, start))], 'key', slot);
    announce(slot);
  });
  document.addEventListener('focusout', (e) => {
    if (cursor.via === 'key' && e.target.closest?.('.chart-slot') && !e.relatedTarget?.closest?.('.chart-slot')) {
      // A redraw replaces the slot and moves focus back within a frame; only clear on a real blur.
      setTimeout(() => { if (!document.activeElement?.closest?.('.chart-slot')) setCursor(null); }, 0);
    }
  });
}

export function sparkline(values, { color = 'currentColor', height = 28 } = {}) {
  const w = 120, h = height;
  const pts = values.map((y, i) => ({ x: i, y }));
  if (!pts.some((p) => isNum(p.y))) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const [y0, y1] = extent(values, 0.2);
  const X = (x) => (x / Math.max(1, values.length - 1)) * w;
  const Y = (y) => 2 + (1 - (y - y0) / (y1 - y0)) * (h - 4);
  let d = '';
  for (const seg of segments(pts)) d += seg.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
