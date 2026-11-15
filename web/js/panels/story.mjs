// "How was this detected?" — a four-step walkthrough of one server alert: personal baseline, past
// threshold (not yet an alert), confirmed, recovery. Each step adds its marks to the same zoomed
// charts, so a viewer can see the deterministic rule work on real frames. Everything shown comes
// from the server (events, per-sample comparisons, baselines → method); see detection.mjs.
import { alertStory, signalSeries, STAGES } from '../detection.mjs';
import { drawCharts } from '../charts.mjs';
import { METRICS, fmt, clockOf, durationLabel, escapeHtml } from '../format.mjs';
import { openDialog } from './dialog.mjs';
import { setHTML } from '../dom.mjs';

const STAGE_TITLE = ['Personal baseline', 'Past threshold, not yet an alert', 'Alert confirmed', 'Recovery'];
const label = (k) => METRICS[k]?.label || k;

export function openStory(ctx, alertId, { stage: startStage = 0 } = {}) {
  const { feed } = ctx;
  let stage = startStage;
  const body = document.createElement('div');
  body.className = 'story';
  setHTML(body, `
    <div class="story__side">
      <ol class="story__list" id="st-list">${STAGE_TITLE.map((t, i) => `<li><button type="button" data-goto="${i}">
        <span class="mono">${i + 1}</span>${t}</button></li>`).join('')}</ol>
      <div class="story__text" id="st-text" aria-live="polite"></div>
      <div class="row story__nav">
        <button type="button" class="btn btn--small" data-move="-1">‹ Back</button><span class="spacer"></span>
        <button type="button" class="btn btn--small btn--primary" data-move="1" id="st-next">Next ›</button></div>
    </div>
    <div class="story__charts" id="st-charts"></div>`);

  const atOf = (t) => feed.state.history.find((h) => h.t === t)?.at;
  // Axis labels can fall between frames: offset the simulated clock from the nearest stored frame.
  const clockAt = (t) => {
    const ref = feed.state.history.find((h) => typeof h.at === 'string' && typeof h.t === 'number');
    return ref ? clockOf(new Date(Date.parse(ref.at) + (t - ref.t) * 1000).toISOString()) : '--:--:--';
  };
  const who = (story) => (story.target === 'cabin' ? 'The shared cabin'
    : feed.state.frame?.astronauts.find((a) => a.id === story.target)?.name || story.target);
  const sampleAfter = (t) => feed.state.history.find((h) => h.t >= t);

  function text(s) {
    const n = s.signals.length;
    const signals = s.signals.map(label).join(n > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1');
    const confirm = s.confirmSeconds ?? '—';
    if (stage === 0) {
      return `<p><strong>${escapeHtml(who(s))}</strong> is compared with ${s.target === 'cabin' ? 'its' : 'their'} <em>own</em> expected
        ${escapeHtml(signals)}${s.rule === 'heart_rate_high' ? ', adjusted for the current activity' : ''} (grey dashed).</p>
        <p>The threshold (red dashed) sits ${s.triggerZ ?? 3} personal spreads above expected, or a fixed minimum change if that is
        larger. ${n > 1 ? `This rule needs <strong>${s.required} of ${n}</strong> signals past threshold together.` : ''}</p>`;
    }
    if (stage === 1) {
      const first = s.crossedAt !== null
        ? `At <span class="mono">${clockOf(atOf(s.crossedAt))}</span> the server first reported ${s.required === 1 ? 'the reading' : `${s.required} of ${n} signals`} past threshold.`
        : `It went past threshold <em>between</em> two frames${ctx.run ? ` (this recording keeps one every ${ctx.run.step_seconds} simulated seconds)` : ''}, so the first frame you see is already past it.`;
      return `<p>${first}</p><p>That is <strong>not an alert yet</strong>. It has to stay past threshold for at least
        <strong>${confirm} simulated seconds</strong>${s.sampled ? ' and on a fresh check-in sample' : ''} (yellow band) before it counts,
        so one noisy reading can't raise an alert.</p>`;
    }
    if (stage === 2) {
      const h = sampleAfter(s.opened.elapsed_seconds);
      const src = h && (s.target === 'cabin' ? h.cabin : h.crew?.[s.target]);
      const rows = s.signals.map((k) => {
        const c = src?.checks?.[k];
        return `<li class="${c?.breached ? 'is-out' : ''}"><span>${label(k)}</span><b class="mono">${fmt(src?.[k], k)}</b>
          <span class="muted small">limit ${fmt(c?.threshold, k)}</span></li>`;
      }).join('');
      return `<p>At <span class="mono">${clockOf(s.opened.at)}</span> the server opened the alert
        “${escapeHtml(s.label)}” (red line).</p><ul class="story__evidence">${rows}</ul>
        <p class="muted small">The crew now gets response steps. Acknowledging records the response; it never clears an alert.</p>`;
    }
    const pct = s.recoveryFraction !== null ? Math.round(s.recoveryFraction * 100) : null;
    const bandText = `the recovery band (aqua dashed${pct !== null ? `, ${pct}% of the way from expected to threshold` : ''})`;
    if (!s.cleared) {
      return `<p><strong>Still open.</strong> It clears only after the readings stay inside ${bandText} for
        <strong>${s.recoverySeconds ?? '—'} simulated seconds</strong>.</p>
        <p class="muted small">The band is lower than the trigger, so an alert doesn't flicker on and off around the threshold.</p>`;
    }
    if (s.cleared.reason === 'readings_unavailable') {
      return `<p>At <span class="mono">${clockOf(s.cleared.at)}</span> the readings became unavailable, so the alert closed.</p>
        <p><strong>This is not a confirmed recovery</strong>: missing data is never shown as normal.</p>`;
    }
    return `<p>${s.recoveringFrom !== null ? `From <span class="mono">${clockOf(atOf(s.recoveringFrom))}</span> the readings were back inside ${bandText}. ` : `The readings returned inside ${bandText}. `}
      After <strong>${s.recoverySeconds ?? '—'} s</strong> in the band (aqua band) the alert cleared at
      <span class="mono">${clockOf(s.cleared.at)}</span>, open for ${durationLabel(s.cleared.elapsed_seconds - s.opened.elapsed_seconds)} in total.</p>
      <p class="muted small">The band is lower than the trigger, so an alert doesn't flicker on and off around the threshold.</p>`;
  }

  function specFor(s, key) {
    const v = signalSeries(s, feed.state.history, key);
    const tOpen = s.opened.elapsed_seconds;
    const tClear = s.cleared?.elapsed_seconds ?? null;
    const recovered = s.cleared?.reason === 'returned_to_baseline';
    const series = [
      { name: label(key), key, color: 'var(--ice)', points: v.value },
      { name: 'Expected', key, color: 'var(--muted)', dashed: true, points: v.expected },
      { name: 'Threshold', key, color: 'var(--alert)', dashed: true, points: v.threshold },
    ];
    if (stage >= 3) series.push({ name: 'Recovery band', key, color: 'var(--aqua)', dashed: true, points: v.band });
    const bands = [];
    const markers = [];
    if (stage >= 1 && s.confirmSeconds !== null) bands.push({ x0: tOpen - s.confirmSeconds, x1: tOpen, cls: 'band--confirm' });
    if (stage >= 1 && s.crossedAt !== null && s.crossedAt < tOpen) markers.push({ x: s.crossedAt, label: 'PAST', cls: 'marker--cross', row: 1 });
    if (stage >= 2) markers.push({ x: tOpen, label: 'ALERT', cls: 'marker--open' });
    if (stage >= 3 && recovered && s.recoverySeconds !== null) bands.push({ x0: tClear - s.recoverySeconds, x1: tClear, cls: 'band--recover' });
    if (stage >= 3 && tClear !== null) markers.push({ x: tClear, label: 'CLEARED', cls: 'marker--clear' });
    return { series, bands, markers, xDomain: s.window, label: `${label(key)} around the alert`, xLabel: clockAt };
  }

  // Only touch the live text when it changes, so screen readers don't re-announce it every frame.
  const setText = (htmlText) => {
    const el = body.querySelector('#st-text');
    if (el.dataset.html !== htmlText) { setHTML(el, htmlText); el.dataset.html = htmlText; }
  };

  function draw() {
    const s = alertStory(alertId, feed.state.events, feed.state.history, ctx.baselines?.method);
    const charts = body.querySelector('#st-charts');
    body.querySelectorAll('[data-goto]').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.goto) === stage)));
    body.querySelector('[data-move="-1"]').disabled = stage === 0;
    body.querySelector('#st-next').textContent = stage === STAGES.length - 1 ? 'Done' : 'Next ›';
    if (!s) {
      setText('<p class="muted">This alert belongs to an earlier run, so its frames are no longer here.</p>');
      setHTML(charts, '');
      return;
    }
    setText(`<h4>${stage + 1} · ${STAGE_TITLE[stage]}</h4>${text(s)}`);
    if (!s.inHistory) {
      setHTML(charts, `<p class="muted">This alert is older than the trend history kept in this browser, so its frames can't be drawn. The steps on the left still describe the rule.</p>`);
      return;
    }
    setHTML(charts, s.signals.map((k) => `<figure class="mini-chart">
      <figcaption><span>${label(k)}</span><span class="muted small">${s.target === 'cabin' ? 'Cabin' : escapeHtml(who(s))}</span></figcaption>
      <div class="chart-slot" data-chart="${k}"></div></figure>`).join(''));
    drawCharts(charts, Object.fromEntries(s.signals.map((k) => [k, specFor(s, k)])));
  }

  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto],[data-move]');
    if (!b) return;
    if (b.dataset.move === '1' && stage === STAGES.length - 1) { dlg.close(); return; }
    stage = Math.max(0, Math.min(STAGES.length - 1, b.dataset.goto !== undefined ? Number(b.dataset.goto) : stage + Number(b.dataset.move)));
    draw();
  });

  const opened = feed.state.events.find((e) => e.alert_id === alertId && e.type === 'opened');
  const dlg = openDialog({
    kicker: 'How was this detected?', title: escapeHtml(opened?.label || 'Alert'), body, wide: true,
    onClose: feed.subscribe(() => draw()),
  });
  requestAnimationFrame(() => { draw(); body.querySelector('#st-next').focus({ preventScroll: true }); });
  return dlg;
}
