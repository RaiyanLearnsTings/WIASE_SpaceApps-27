import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectIssues, issuesForRegion, PROTOCOLS, REGION_PROTOCOLS } from '../../web/js/issues.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../../examples/${name}.json`, import.meta.url)));

test('every protocol has steps with an owner, an escalation rule and a re-check', () => {
  for (const [id, p] of Object.entries(PROTOCOLS)) {
    assert.ok(p.steps.length >= 3, id);
    for (const [who, text] of p.steps) assert.ok(who && text, id);
    assert.ok(p.escalate && p.recheck && p.why, id);
  }
  for (const list of Object.values(REGION_PROTOCOLS)) for (const id of list) assert.ok(PROTOCOLS[id], id);
});

test('normal frame: no alert-level issues', () => {
  assert.ok(collectIssues(load('state_normal')).every((i) => i.level !== 'alert'));
});

test('alert frame: server alerts become alert issues first, with evidence, and are not duplicated as watch', () => {
  const issues = collectIssues(load('state_alerts'));
  assert.equal(issues[0].level, 'alert');
  const ids = issues.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  const co2 = issues.find((i) => i.id === 'co2_high:cabin');
  assert.equal(co2.level, 'alert');
  assert.ok(co2.evidence.some((e) => e.key === 'co2_ppm'));
  // cabin issues apply to every astronaut's lungs region
  assert.ok(issuesForRegion(issues, 'lungs', 'astro-3').some((i) => i.id === 'co2_high:cabin'));
});

test('stale feed hides issues rather than showing all-clear evidence', () => {
  assert.deepEqual(collectIssues(load('state_alerts'), { live: false }), []);
});
