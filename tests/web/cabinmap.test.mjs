import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cabinMap, sensorStatuses, sensorRadius, toPlan, ZONES } from '../../web/js/panels/cabinmap.mjs';
import { criticalStructures, anchorsFromStructures, ORGANS } from '../../web/js/organs.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../../examples/${name}.json`, import.meta.url)));

test('normal frame: every sensor normal, no rings', () => {
  const f = load('state_normal');
  const st = sensorStatuses(f);
  assert.equal(Object.keys(st).length, 8);
  assert.ok(Object.values(st).every((s) => s === 'normal'));
  assert.ok(!cabinMap(f).includes('class="ring '));
});

test('CO2 alert: exactly one alert sensor (the worst CO2 one), others watch with smaller rings', () => {
  const f = load('state_alerts');
  const st = sensorStatuses(f);
  const co2 = f.cabin.sensors.filter((s) => s.metric === 'co2_ppm');
  const alerts = co2.filter((s) => st[s.id] === 'alert');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, 'work-co2');
  const r = (id) => sensorRadius(co2.find((s) => s.id === id), st[id]);
  assert.ok(r('work-co2') >= r('lab-co2'));
  assert.ok(cabinMap(f).includes('ring--alert'));
});

test('stale feed: sensors unavailable and never coloured as alerts', () => {
  const f = load('state_alerts');
  const st = sensorStatuses(f, { live: false });
  assert.ok(Object.values(st).every((s) => s === 'unavailable'));
  assert.equal(sensorRadius(f.cabin.sensors[0], 'unavailable'), 0);
});

test('sensors land inside their zone on the plan', () => {
  const f = load('state_normal');
  const box = { rest: [60, 40, 330, 260], work: [330, 40, 940, 260], systems: [60, 260, 260, 580], lab: [420, 330, 940, 580] };
  assert.equal(ZONES.length, 4);
  for (const s of f.cabin.sensors) {
    const [x, y] = toPlan(s);
    const [x0, y0, x1, y1] = box[s.zone];
    assert.ok(x > x0 && x < x1 && y > y0 && y < y1, `${s.id} at ${x},${y}`);
  }
});

test('critical structures light up only for alert/watch regions, worst wins', () => {
  const c = criticalStructures({ heart: 'watch', brain: 'alert', marrow: 'info', lungs: 'normal' });
  assert.equal(c.brainstem, 'alert'); // shared by brain (alert) and heart (watch)
  assert.equal(c.vagus, 'watch');
  assert.equal(c.lungs, undefined);
  assert.equal(c.marrow, undefined);
});

test('anchors from the anatomy structures file are finite for every region', () => {
  const list = JSON.parse(readFileSync(new URL('../../web/models/structures.json', import.meta.url))).structures;
  const anchors = anchorsFromStructures(list);
  for (const o of ORGANS) assert.ok(anchors[o.id].every(Number.isFinite), o.id);
  assert.ok(anchors.brain[1] > 1.6 && anchors.marrow[1] < 1.0);
  assert.deepEqual(anchorsFromStructures([]).heart, ORGANS.find((o) => o.id === 'heart').anchor);
});
