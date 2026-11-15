import test from 'node:test';
import assert from 'node:assert/strict';
import { lineChart, chartGeometry, nearestIndex, readoutRows, sampleTimes } from '../../web/js/charts.mjs';

const pts = (ys, x0 = 0, step = 20) => ys.map((y, i) => ({ x: x0 + i * step, y }));

test('nearestIndex snaps to the closest sample time', () => {
  const xs = [0, 20, 40, 60];
  assert.equal(nearestIndex(xs, -5), 0);
  assert.equal(nearestIndex(xs, 9), 0);
  assert.equal(nearestIndex(xs, 11), 1);
  assert.equal(nearestIndex(xs, 59), 3);
  assert.equal(nearestIndex(xs, 999), 3);
  assert.equal(nearestIndex([42], 0), 0);
});

test('readout keeps missing values as a dash, never 0, and adds a fixed threshold', () => {
  const series = [
    { name: 'Heart rate', key: 'heart_rate_bpm', color: 'red', points: [{ x: 0, y: 71.4 }, { x: 20, y: null }] },
    { color: 'grey', points: [{ x: 0, y: 1 }] }, // unnamed series are not listed
  ];
  assert.deepEqual(readoutRows(series, 0).map((r) => [r.name, r.value]), [['Heart rate', '71 bpm']]);
  assert.deepEqual(readoutRows(series, 20).map((r) => r.value), ['—']);
  assert.deepEqual(readoutRows(series, 40).map((r) => r.value), ['—']); // no sample at all
  const rows = readoutRows(series, 0, { threshold: 95, thresholdKey: 'heart_rate_bpm' });
  assert.deepEqual(rows.at(-1), { name: 'Threshold', color: 'var(--alert)', dashed: true, value: '95 bpm' });
});

test('xDomain zooms the chart and drops samples outside it', () => {
  const series = [{ color: 'red', points: pts([1, 2, 3, 4, 5, 6]) }];
  const g = chartGeometry(series, { width: 400, height: 100, xDomain: [20, 60] });
  assert.equal(g.x0, 20);
  assert.equal(g.x1, 60);
  assert.deepEqual(sampleTimes(series, g), [20, 40, 60]);
  assert.equal(chartGeometry(series, { xDomain: [500, 600] }), null);
  assert.match(lineChart(series, { xDomain: [500, 600] }), /Waiting for data/);
});

test('bands and markers are drawn only inside the domain', () => {
  const series = [{ color: 'red', points: pts([1, 2, 3, 4]) }];
  const svg = lineChart(series, {
    width: 400, height: 100,
    bands: [{ x0: 10, x1: 30, cls: 'band--confirm' }, { x0: 900, x1: 950 }],
    markers: [{ x: 40, label: 'ALERT', cls: 'marker--open' }, { x: 999, label: 'LATER' }],
  });
  assert.equal((svg.match(/<rect class="band/g) || []).length, 1);
  assert.match(svg, /marker--open/);
  assert.match(svg, />ALERT</);
  assert.doesNotMatch(svg, /LATER/);
});

test('lines still break at nulls and gaps (nothing interpolated)', () => {
  const series = [{ color: 'red', points: [{ x: 0, y: 1 }, { x: 20, y: 2 }, { x: 40, y: null }, { x: 60, y: 3 }, { x: 80, y: 4, gap: true }, { x: 100, y: 5 }] }];
  const svg = lineChart(series, { width: 400, height: 100 });
  assert.equal((svg.match(/<path /g) || []).length, 3);
});
