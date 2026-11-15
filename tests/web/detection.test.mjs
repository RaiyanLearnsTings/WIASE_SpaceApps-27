import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReplayFeed } from '../../web/js/replay.mjs';
import { sampleOf } from '../../web/js/feed.mjs';
import { alertStory, signalSeries, RULES } from '../../web/js/detection.mjs';

const run = JSON.parse(readFileSync(new URL('../../web/demo/run.json', import.meta.url)));
const method = run.baselines.method;

function playedFeed() {
  const feed = new ReplayFeed(run);
  feed.seek(0);
  feed.seek(feed.last);
  return feed;
}

test('history samples keep the server comparison for every rule signal', () => {
  const s = sampleOf(run.frames[0]);
  const crew = s.crew[run.frames[0].astronauts[0].id];
  for (const rule of Object.values(RULES)) {
    const checks = rule.scope === 'cabin' ? s.cabin.checks : crew.checks;
    for (const key of rule.signals) {
      assert.ok(key in checks, key);
      if (checks[key]) assert.deepEqual(Object.keys(checks[key]), ['expected', 'threshold', 'breached', 'in_band']);
    }
  }
});

test('every recorded alert can be walked through, in the right order', () => {
  const feed = playedFeed();
  const opened = feed.state.events.filter((e) => e.type === 'opened');
  assert.ok(opened.length >= 3, 'the recording has several alerts');
  for (const e of opened) {
    const s = alertStory(e.alert_id, feed.state.events, feed.state.history, method);
    assert.ok(s, `story for ${e.rule}`);
    assert.equal(s.inHistory, true);
    assert.equal(s.confirmSeconds, method.confirmation_sim_seconds);
    if (s.crossedAt !== null) {
      assert.ok(s.crossedAt <= e.elapsed_seconds, `${e.rule}: crossed before it opened`);
    } else {
      // Crossed and confirmed between two stored frames: the next frame must already show the breach.
      const next = feed.state.history.find((h) => h.t >= e.elapsed_seconds);
      const checks = RULES[e.rule].scope === 'cabin' ? next.cabin.checks : next.crew[e.target].checks;
      assert.ok(RULES[e.rule].signals.filter((k) => checks[k]?.breached).length >= RULES[e.rule].required, `${e.rule}: breach visible on the next frame`);
    }
    assert.ok(s.cleared, `${e.rule}: the recording ends recovered`);
    if (s.cleared.reason === 'returned_to_baseline') {
      assert.ok(s.recoveringFrom > e.elapsed_seconds && s.recoveringFrom <= s.cleared.elapsed_seconds, `${e.rule}: recovery inside the episode`);
    }
    assert.ok(s.window[0] <= (s.crossedAt ?? e.elapsed_seconds) && s.window[1] >= s.cleared.elapsed_seconds, `${e.rule}: window shows the whole episode`);
  }
});

test('the frames the story marks are the server\'s own flags', () => {
  const feed = playedFeed();
  const e = feed.state.events.find((x) => x.type === 'opened' && x.rule === 'co2_high');
  const s = alertStory(e.alert_id, feed.state.events, feed.state.history, method);
  const at = (t) => feed.state.history.find((h) => h.t === t).cabin.checks.co2_ppm;
  assert.equal(at(s.crossedAt).breached, true);
  const before = feed.state.history[feed.state.history.findIndex((h) => h.t === s.crossedAt) - 1];
  assert.equal(before.cabin.checks.co2_ppm.breached, false);
  assert.equal(at(s.recoveringFrom).in_band, true);
});

test('recovery-band edge sits between expected and threshold', () => {
  const feed = playedFeed();
  const e = feed.state.events.find((x) => x.type === 'opened' && x.rule === 'co2_high');
  const s = alertStory(e.alert_id, feed.state.events, feed.state.history, method);
  const v = signalSeries(s, feed.state.history, 'co2_ppm');
  const i = v.band.findIndex((p) => p.y !== null);
  assert.ok(v.expected[i].y < v.band[i].y && v.band[i].y < v.threshold[i].y);
});

test('unknown alerts and other runs give no story', () => {
  const feed = playedFeed();
  assert.equal(alertStory(99999, feed.state.events, feed.state.history, method), null);
  assert.equal(alertStory(1, [], [], method), null);
});
