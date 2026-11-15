import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGANS, ORGAN_BY_ID, STRUCTURES, STRUCTURE_OWNER, organStatus, worstStatus } from '../../web/js/organs.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../../examples/${name}.json`, import.meta.url)));
const astro = (f, id) => f.astronauts.find((a) => a.id === id);

test('every structure referenced exists and has a click owner', () => {
  for (const o of ORGANS) for (const s of o.structures) {
    assert.ok(STRUCTURES[s], `${o.id} -> ${s}`);
    // The skin shell is deliberately not clickable so drags on the body orbit the camera.
    if (s !== 'skin') assert.ok(STRUCTURE_OWNER[s], `owner for ${s}`);
  }
});

test('normal frame: no region is in alert', () => {
  const f = load('state_normal');
  for (const o of ORGANS) assert.notEqual(organStatus(o, astro(f, 'astro-1'), f).status, 'alert');
});

test('alerts map to the right regions and targets', () => {
  const f = load('state_alerts'); // HR alert on astro-2 + cabin CO2
  assert.equal(organStatus(ORGAN_BY_ID.heart, astro(f, 'astro-2'), f).status, 'alert');
  assert.notEqual(organStatus(ORGAN_BY_ID.heart, astro(f, 'astro-1'), f).status, 'alert');
  for (const id of ['astro-1', 'astro-2', 'astro-3']) {
    assert.equal(organStatus(ORGAN_BY_ID.lungs, astro(f, id), f).status, 'alert'); // shared cabin
  }
});

test('stale feed and missing data are never shown as normal', () => {
  const f = load('state_normal');
  assert.equal(organStatus(ORGAN_BY_ID.heart, astro(f, 'astro-1'), f, { live: false }).status, 'unavailable');
  const blank = { ...astro(f, 'astro-1'), comparisons: {} };
  assert.equal(organStatus(ORGAN_BY_ID.vessels, blank, f).status, 'unavailable');
});

test('a breached telemetry-only metric is watch, not alert', () => {
  const f = load('state_normal');
  const a = structuredClone(astro(f, 'astro-1'));
  a.comparisons.systolic_mmhg = { value: 170, expected: 110, threshold: 140, threshold_breached: true };
  assert.equal(organStatus(ORGAN_BY_ID.vessels, a, f).status, 'watch');
});

test('radiation is info-only', () => {
  const f = load('state_normal');
  assert.equal(organStatus(ORGAN_BY_ID.marrow, astro(f, 'astro-1'), f).status, 'info');
  assert.equal(worstStatus(['normal', 'info', 'watch']), 'watch');
});
