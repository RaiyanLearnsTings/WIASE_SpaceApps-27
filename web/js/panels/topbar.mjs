// One-row control bar: identity, environment + comms delay, mission clock, speed, connection,
// and three entry points — Simulate (scenarios / recorded chapters), Tour, About — plus Settings.
// Everything that used to crowd a second row lives in the Simulate panel. In the recorded demo the
// free space holds a timeline: play/pause, a seek slider and a tick per chapter.
import { clockOf, elapsedLabel, durationLabel, escapeHtml } from '../format.mjs';
import { openDialog, toast } from './dialog.mjs';
import { openShortcutHelp } from '../shortcuts.mjs';

const DURATIONS = [5, 15, 30, 60];

/** Recorded-demo timeline: play/pause, a seek slider and one tick per chapter. Fills the spacer slot. */
function timelineHtml(run) {
  const ticks = run.chapters.map((c) => `<button type="button" class="scrub__mark" data-chapter="${c.id}"
      style="--p:${(c.at / run.duration_seconds).toFixed(4)}" title="${escapeHtml(c.label)}" aria-label="Jump to chapter: ${escapeHtml(c.label)}"></button>`).join('');
  return `<div class="scrub" role="group" aria-label="Recorded demo timeline">
      <button type="button" class="icon-btn scrub__play" id="play-btn" aria-keyshortcuts="P"></button>
      <div class="scrub__track">
        <input type="range" id="scrub" min="0" max="${run.frames.length - 1}" step="1" value="0" aria-label="Position in the recorded run">
        <div class="scrub__marks">${ticks}</div>
        <span class="scrub__chapter" id="scrub-chapter" aria-hidden="true"></span>
      </div>
    </div>`;
}

export function mountTopbar(el, ctx) {
  const { store, feed, api } = ctx;
  const replay = ctx.mode === 'replay';
  el.innerHTML = `
    <div class="brand" aria-label="WIASE crew health console"><span class="brand__mark" aria-hidden="true">//</span><strong>WIASE</strong></div>
    <div class="group">
      <div class="segmented" role="group" aria-label="Operating environment">
        <button type="button" data-mode="deep">Deep Space</button><button type="button" data-mode="iss">ISS</button>
      </div>
      <span class="mono muted small" id="delay" title="Illustrative one-way communication delay (assumption)"></span>
    </div>
    ${replay ? timelineHtml(ctx.run) : '<span class="spacer"></span>'}
    <div class="clockblock" title="Simulated mission time (UTC) and time since the run started">
      <span class="mono clock" id="sim-clock">--:--:--</span><span class="mono muted small" id="elapsed">T+—</span>
    </div>
    <div class="segmented segmented--quiet" role="group" aria-label="Simulation speed">
      <button type="button" data-speed="1">1×</button><button type="button" data-speed="10">10×</button><button type="button" data-speed="60">60×</button>
    </div>
    <span class="conn" id="conn" role="status"></span>
    <span class="topbar__rule" aria-hidden="true"></span>
    <button type="button" class="btn btn--primary" id="sim-btn">Simulate <span class="count" id="sc-count"></span></button>
    <button type="button" class="btn" id="tour-btn" title="Guided tour of WIASE">Tour</button>
    <button type="button" class="btn" id="about-btn" title="About, data &amp; validation (I)" aria-keyshortcuts="I">About</button>
    <button type="button" class="icon-btn" id="keys-top" aria-label="Keyboard shortcuts" aria-keyshortcuts="Shift+?" title="Keyboard shortcuts (?)">
      <svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x=".75" y=".75" width="16.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>
      <path d="M3.5 3.5h1.5M6.5 3.5h1.5M9.5 3.5h1.5M12.5 3.5h1.5M3.5 6h1.5M6.5 6h1.5M9.5 6h1.5M12.5 6h1.5M5 8.5h8" stroke="currentColor" stroke-width="1.3"/></svg></button>
    <button type="button" class="icon-btn" id="settings-btn" aria-label="Settings and export">⚙</button>`;

  const q = (s) => el.querySelector(s);
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => store.set({ mode: b.dataset.mode })));
  el.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', async () => {
    try { feed.accept(await api.speed(Number(b.dataset.speed))); } catch (e) { toast(e.message, 'error'); }
  }));
  q('#sim-btn').addEventListener('click', () => openSimulate(ctx));
  q('#settings-btn').addEventListener('click', () => openSettings(ctx));
  q('#tour-btn').addEventListener('click', () => ctx.tour?.start());
  q('#about-btn').addEventListener('click', () => ctx.openPage('about'));
  q('#keys-top').addEventListener('click', () => openShortcutHelp(ctx));

  let scrubbing = false;
  if (replay) wireTimeline();

  /**
   * Timeline input. Dragging is handled here rather than by the native slider: the track is measured
   * once when the press starts, so nothing that changes width in the bar mid-drag can move the value
   * under the pointer (mouse, touchpad or touch). Two-finger swipes / wheel scrub too, and seeks are
   * coalesced to one per animation frame. Arrow keys / Home / End still go through the native slider.
   * Seeking backwards replays from the start, which begins a new pass (like a server reset).
   */
  function wireTimeline() {
    const range = q('#scrub');
    const track = q('.scrub__track');
    const max = Number(range.max);
    let pending = null, drag = null, wheelAcc = 0, wheelTimer = 0;
    const flush = () => {
      const v = pending;
      pending = null;
      if (v !== null) feed.seek(v);
    };
    const queue = (v) => {
      const clamped = Math.max(0, Math.min(max, Math.round(v)));
      range.value = String(clamped);
      range.style.setProperty('--p', (clamped / max).toFixed(4));
      if (pending === null) requestAnimationFrame(flush);
      pending = clamped;
    };
    const valueAt = (clientX) => {
      const thumb = 12;
      return ((clientX - drag.left - thumb / 2) / Math.max(1, drag.width - thumb)) * max;
    };
    const end = () => {
      if (!drag) return;
      drag = null;
      scrubbing = false;
      track.classList.remove('is-dragging');
      if (!wheelTimer) feed.hold(false);
    };

    q('#play-btn').addEventListener('click', () => ctx.togglePause());
    range.addEventListener('input', () => queue(Number(range.value))); // keyboard
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.scrub__mark')) return;
      e.preventDefault();
      const r = range.getBoundingClientRect();
      drag = { left: r.left, width: r.width, id: e.pointerId };
      scrubbing = true;
      feed.hold(true);
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
      range.focus({ preventScroll: true });
      queue(valueAt(e.clientX));
    });
    track.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) queue(valueAt(e.clientX)); });
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
    track.addEventListener('mousedown', (e) => { if (!e.target.closest('.scrub__mark')) e.preventDefault(); }); // no native drag on top
    track.addEventListener('wheel', (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      // Scroll distance maps to distance along the track (like dragging the thumb), but never faster than
      // one frame per 3 px, so a short track doesn't make a touchpad swipe jump across the whole run.
      wheelAcc += e.deltaMode === 1 ? d * 16 : e.deltaMode === 2 ? d * range.clientWidth : d;
      const perFrame = Math.max(3, Math.max(1, range.clientWidth - 12) / max);
      const steps = Math.trunc(wheelAcc / perFrame);
      if (!steps) return;
      wheelAcc -= steps * perFrame;
      feed.hold(true);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelTimer = 0; wheelAcc = 0; if (!drag) feed.hold(false); }, 350);
      queue((pending ?? Math.max(0, feed.index)) + steps);
    }, { passive: false });
    el.querySelectorAll('[data-chapter]').forEach((b) => b.addEventListener('click', () => api.trigger(b.dataset.chapter)));
  }

  return function render() {
    const f = feed.state.frame;
    const s = store.get();
    const conn = q('#conn');
    const label = ctx.mode === 'replay' && feed.connection === 'live' ? 'Recorded'
      : { connecting: 'Connecting', live: 'Live', stale: 'Stale', offline: 'Offline' }[feed.connection];
    conn.className = `conn conn--${feed.connection}${ctx.mode === 'replay' ? ' conn--replay' : ''}`;
    conn.innerHTML = `<span class="conn__dot" aria-hidden="true"></span><span class="conn__label">${label}</span><span class="sr-only"> simulator connection</span>`;
    conn.title = ctx.mode === 'replay' ? `Pre-recorded run of the WIASE simulator (synthetic data). Chapter: ${feed.currentChapter().label}. Run the Python server locally for the live simulator.`
      : feed.lastMessageAt ? `Last frame received ${new Date(feed.lastMessageAt).toISOString().slice(11, 19)} UTC (wall clock)` : '';
    q('#sim-clock').textContent = f ? `${clockOf(f.clock.simulated_at)} UTC` : '--:--:-- UTC';
    q('#elapsed').textContent = elapsedLabel(f?.clock.elapsed_seconds);
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode)));
    el.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === f?.clock.speed)));
    q('#delay').textContent = s.mode === 'deep' ? `${s.delayMin} min delay` : 'live link';
    q('#sc-count').textContent = f?.active_scenarios.length || '';
    if (replay) renderTimeline();
  };

  function renderTimeline() {
    const play = q('#play-btn');
    const range = q('#scrub');
    const chapter = feed.currentChapter();
    const icon = feed.paused ? 'play' : 'pause';
    if (play.dataset.icon !== icon) {
      play.dataset.icon = icon;
      play.innerHTML = feed.paused
        ? '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" fill="currentColor"/></svg>';
    }
    play.setAttribute('aria-label', feed.paused ? 'Play recording (P)' : 'Pause recording (P)');
    play.title = play.getAttribute('aria-label');
    play.classList.toggle('is-paused', feed.paused);
    if (!scrubbing) {
      range.value = String(Math.max(0, feed.index));
      range.style.setProperty('--p', (Math.max(0, feed.index) / feed.last).toFixed(4));
    }
    range.setAttribute('aria-valuetext', `${elapsedLabel(Math.max(0, feed.index) * feed.step)} of ${elapsedLabel(feed.run.duration_seconds)} · ${chapter.label}${feed.paused ? ' · paused' : ''}`);
    el.querySelectorAll('[data-chapter]').forEach((b) => b.classList.toggle('is-current', b.dataset.chapter === chapter.id));
    const chapterText = `${feed.paused ? 'Paused · ' : ''}${chapter.label}`;
    const chapterEl = q('#scrub-chapter');
    if (chapterEl.textContent !== chapterText) { chapterEl.textContent = chapterText; chapterEl.title = chapterText; }
  }
}

/** Simulate panel: live scenarios (server) or recorded chapters (static demo). */
function openSimulate(ctx) {
  const { feed, api, store } = ctx;
  const body = document.createElement('div');
  body.className = 'simulate';
  const replay = ctx.mode === 'replay';
  const draw = () => {
    const f = feed.state.frame;
    if (!f) return;
    if (replay) {
      const now = feed.currentChapter().id;
      body.innerHTML = `<p class="muted">This is a recorded run of the WIASE simulator. Jump to any moment; the dashboard updates as if it were live.</p>
        <ol class="sim-list">${ctx.run.chapters.map((c, i) => `<li class="sim-row${c.id === now ? ' is-current' : ''}">
          <span class="sim-row__n mono">${String(i + 1).padStart(2, '0')}</span>
          <div><strong>${escapeHtml(c.label)}</strong><span class="muted small">${escapeHtml(c.description)}</span></div>
          <button type="button" class="btn btn--small" data-jump="${c.id}">${c.id === now ? 'Playing' : 'Jump'}</button></li>`).join('')}</ol>
        <div class="row"><button type="button" class="btn" data-restart>Restart from the beginning</button></div>`;
      return;
    }
    const crew = f.astronauts;
    const active = f.active_scenarios;
    if (body.contains(document.activeElement) && document.activeElement.matches('select')) return;
    const keep = { target: body.querySelector('#sc-target')?.value || store.get().astronaut, duration: body.querySelector('#sc-duration')?.value || '15' };
    body.innerHTML = `<p class="muted">Inject a synthetic change and watch detection, the alert and recovery. Alerts confirm after 12 simulated seconds.</p>
      <div class="row sim-opts">
        <label class="field">Crew target<select id="sc-target">${crew.map((a) => `<option value="${a.id}" ${a.id === keep.target ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
        <label class="field">Duration<select id="sc-duration">${DURATIONS.map((m) => `<option value="${m}" ${String(m) === keep.duration ? 'selected' : ''}>${m} sim min</option>`).join('')}</select></label>
      </div>
      <ol class="sim-list">${ctx.scenarios.map((sc) => {
        const on = active.filter((a) => a.id === sc.id);
        return `<li class="sim-row${on.length ? ' is-current' : ''}">
          <span class="tag">${sc.scope === 'cabin' ? 'Cabin' : 'Crew'}</span>
          <div><strong>${escapeHtml(sc.label)}</strong><span class="muted small">${escapeHtml(sc.description)}${on.map((a) => ` · <b>active on ${a.target}, ${durationLabel(a.remaining_seconds)} left</b>`).join('')}</span></div>
          <button type="button" class="btn btn--small" data-trigger="${sc.id}" data-scope="${sc.scope}">Trigger</button></li>`;
      }).join('')}</ol>
      <div class="row"><button type="button" class="btn" data-clear ${active.length ? '' : 'disabled'}>Clear all scenarios</button>
        <span class="spacer"></span><button type="button" class="btn" data-reset title="Restart the simulated clock and clear scenarios">Reset run</button></div>`;
  };
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-jump],[data-restart],[data-trigger],[data-clear],[data-reset]');
    if (!t) return;
    try {
      if (t.dataset.jump) { await api.trigger(t.dataset.jump); dlg.close(); toast(`Jumped to: ${ctx.run.chapters.find((c) => c.id === t.dataset.jump).label}`); }
      else if ('restart' in t.dataset || 'reset' in t.dataset) { feed.accept(await api.reset()); dlg.close(); toast(replay ? 'Recording restarted.' : 'Simulation reset — new run started.'); }
      else if ('clear' in t.dataset) feed.accept(await api.clear());
      else {
        const target = t.dataset.scope === 'cabin' ? 'cabin' : body.querySelector('#sc-target').value;
        feed.accept(await api.trigger(t.dataset.trigger, target, Number(body.querySelector('#sc-duration').value) * 60));
        toast(`${ctx.scenarios.find((s) => s.id === t.dataset.trigger).label} started.`);
      }
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });
  draw();
  const off = feed.subscribe(draw);
  const dlg = openDialog({ kicker: replay ? 'Recorded demo' : 'Simulation controls', title: replay ? 'Chapters' : 'Scenarios', body, onClose: off });
}

function openSettings(ctx) {
  const { store } = ctx;
  const s = store.get();
  const body = document.createElement('form');
  body.className = 'settings';
  body.innerHTML = `
    <label class="field">One-way communication delay in Deep Space mode: <strong id="delay-out">${s.delayMin} min</strong>
      <input type="range" min="1" max="22" step="1" value="${s.delayMin}" name="delay">
    </label>
    <p class="muted small">Illustrative assumption (Mars one-way light time is roughly 3–22 minutes). It only affects simulated
      ground-review packets. ISS mode is simplified to a zero-delay link.</p>
    <hr>
    <div class="row"><div><strong>Export session</strong><p class="muted small">Current state, history, events, acknowledgements and check-ins as one JSON file, with provenance.</p></div>
      <span class="spacer"></span><button type="button" class="btn" id="export-btn">Export JSON ↓</button></div>
    <hr>
    <div class="row"><div><strong>Keyboard shortcuts</strong><p class="muted small">Open astronauts and pages, pause the recording, read chart values. Press <kbd>?</kbd> any time.</p></div>
      <span class="spacer"></span><button type="button" class="btn" id="keys-btn">Show shortcuts</button></div>`;
  body.delay.addEventListener('input', () => {
    body.querySelector('#delay-out').textContent = `${body.delay.value} min`;
    store.set({ delayMin: Number(body.delay.value) });
  });
  body.querySelector('#export-btn').addEventListener('click', () => ctx.exportSession());
  body.querySelector('#keys-btn').addEventListener('click', () => openShortcutHelp(ctx));
  openDialog({ kicker: 'Preferences', title: 'Settings', body });
}
