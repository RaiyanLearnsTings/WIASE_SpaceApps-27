// Dependency-free SVG charts. Lines break at null values and at feed gaps; nothing is interpolated.

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

/**
 * @param {Array<{name, color, points:{x,y,gap?}[], dashed?}>} series
 * @param {{height?, threshold?, unit?, label?, xLabel?:(x)=>string}} opts
 */
export function lineChart(series, { height = 120, width = 480, threshold = null, label = '', xLabel = null } = {}) {
  const w = Math.max(120, Math.round(width)), h = Math.max(40, Math.round(height)), l = 38, r = 8, t = 8, b = 18;
  const xs = series.flatMap((s) => s.points.map((p) => p.x)).filter(isNum);
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  if (isNum(threshold)) ys.push(threshold);
  if (!xs.length) return `<div class="chart-empty">Waiting for data…</div>`;
  const [x0, x1] = [Math.min(...xs), Math.max(...xs, Math.min(...xs) + 1)];
  const [y0, y1] = extent(ys);
  const X = (x) => l + ((x - x0) / (x1 - x0)) * (w - l - r);
  const Y = (y) => t + (1 - (y - y0) / (y1 - y0)) * (h - t - b);
  let svg = `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}">`;
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
  for (const s of series) {
    for (const seg of segments(s.points)) {
      const d = seg.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join('');
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 1.4 : 2}" ${s.dashed ? 'stroke-dasharray="4 4"' : ''} vector-effect="non-scaling-stroke"/>`;
    }
    const lastPt = [...s.points].reverse().find((p) => isNum(p.y));
    if (lastPt && !s.dashed) svg += `<circle cx="${X(lastPt.x)}" cy="${Y(lastPt.y)}" r="3" fill="${s.color}"/>`;
  }
  return svg + '</svg>';
}

/**
 * Draw charts into placeholder slots at their real pixel size, so axis text is never stretched.
 * Markup: <div class="chart-slot" data-chart="key"></div>; specs: { key: { series, ...lineChart opts } }.
 */
export function drawCharts(root, specs) {
  for (const slot of root.querySelectorAll('[data-chart]')) {
    const spec = specs[slot.dataset.chart];
    if (!spec) continue;
    const { series, ...opts } = spec;
    slot.innerHTML = lineChart(series, { ...opts, width: slot.clientWidth || 480, height: slot.clientHeight || opts.height || 120 });
  }
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
