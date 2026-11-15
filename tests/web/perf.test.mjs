import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setHTML, setText, setClass, liteMode, lowPowerDevice, medianInterval } from '../../web/js/dom.mjs';
import { ReplayFeed } from '../../web/js/replay.mjs';

test('setHTML / setText / setClass write only when the content changes', () => {
  let writes = 0;
  const el = { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { writes++; this._h = v; }, textContent: 'a', className: 'x' };
  assert.equal(setHTML(el, '<b>1</b>'), true);
  assert.equal(setHTML(el, '<b>1</b>'), false);
  assert.equal(setHTML(el, '<b>2</b>'), true);
  assert.equal(writes, 2);
  assert.equal(setHTML(null, 'x'), false);
  setText(el, 'a'); setClass(el, 'x');
  assert.deepEqual([el.textContent, el.className], ['a', 'x']);
  setText(el, 'b'); setClass(el, 'y');
  assert.deepEqual([el.textContent, el.className], ['b', 'y']);
});

test('reduced effects: automatic on low-power hardware, overridable either way', () => {
  const weak = { hardwareConcurrency: 4, deviceMemory: 8 };
  const strong = { hardwareConcurrency: 10, deviceMemory: 16 };
  assert.equal(lowPowerDevice(weak), true);
  assert.equal(lowPowerDevice({ hardwareConcurrency: 8, deviceMemory: 2 }), true);
  assert.equal(lowPowerDevice(strong), false);
  assert.equal(lowPowerDevice({}), false); // unknown hardware: assume capable
  assert.equal(liteMode('auto', weak), true);
  assert.equal(liteMode('auto', strong), false);
  assert.equal(liteMode('on', strong), true);
  assert.equal(liteMode('off', weak), false);
});

test('frame pacing: median interval ignores a single hitch', () => {
  assert.equal(medianInterval([0, 16, 33, 50, 120, 136]), 17);
  assert.equal(medianInterval([0, 40, 80, 120]), 40);
  assert.equal(medianInterval([5]), 0);
});

test('tour freeze stops playback between chapter jumps, and seeking still works', () => {
  const run = JSON.parse(readFileSync(new URL('../../web/demo/run.json', import.meta.url)));
  const feed = new ReplayFeed(run, { now: () => 0 });
  feed.seek(0);
  feed.setFrozen(true);
  for (let i = 0; i < 20; i++) feed.tick(250);
  assert.equal(feed.index, 0);
  feed.seekTime(run.chapters[1].at);
  assert.ok(feed.index > 0);
  const at = feed.index;
  feed.setFrozen(false);
  for (let i = 0; i < 4; i++) feed.tick(250);
  assert.ok(feed.index > at);
});
