// Response window for one issue: why it matters, what the crew might notice, live evidence, an
// ordered checklist with an owner per step, when to escalate, when to re-check, and acknowledgement.
// Checklist progress and acknowledgements are local to this browser session (reset on a new run);
// acknowledging records that the crew responded — it never clears or silences an alert.
import { PROTOCOLS, collectIssues } from '../issues.mjs';
import { METRICS, fmt, statusPill, clockOf, escapeHtml } from '../format.mjs';
import { openDialog, toast } from './dialog.mjs';

const label = (k) => METRICS[k]?.label || k;

/** Acknowledge the server's "opened" event for an alert issue, so the Alerts timeline agrees. */
function ackEventKey(ctx, issue) {
  const e = ctx.feed.state.events.find((x) => x.type === 'opened' && x.rule === issue.protocol && x.target === issue.target);
  return e?.key || null;
}

export function responseProgress(ctx, issue) {
  const r = ctx.store.get().responses[issue.id];
  const total = PROTOCOLS[issue.protocol].steps.length;
  return { done: r?.done?.length || 0, total, acked: !!r?.ackAt };
}

export function openResponse(ctx, issueId) {
  const { store, feed } = ctx;
  const body = document.createElement('div');
  body.className = 'respond';
  let last = null;

  const draw = () => {
    if (document.activeElement?.id === 'resp-note' && body.contains(document.activeElement)) return; // don't wipe a note being typed
    const live = feed.connection === 'live';
    const issue = collectIssues(feed.state.frame, { live }).find((i) => i.id === issueId) || (last && { ...last, resolved: true });
    if (!issue) { body.innerHTML = '<p class="muted">This issue is no longer active.</p>'; return; }
    last = issue;
    const p = PROTOCOLS[issue.protocol];
    const r = store.get().responses[issue.id] || { done: [] };
    const focused = document.activeElement?.closest?.('[data-step],#resp-note');
    const focusSel = focused?.dataset.step ? `[data-step="${focused.dataset.step}"]` : focused ? '#resp-note' : null;
    const note = body.querySelector('#resp-note')?.value ?? r.note ?? '';
    body.innerHTML = `
      <div class="respond__grid">
        <section class="respond__info">
          <div class="respond__status">${issue.resolved ? statusPill('normal', 'Back in range') : statusPill(issue.level)}
            <strong>${escapeHtml(issue.who)}</strong>${issue.since ? `<span class="muted small">since ${clockOf(issue.since)} sim UTC</span>` : ''}</div>
          <p>${p.why}</p>
          <h4>Live evidence</h4>
          <table class="evidence-table"><tbody>${issue.evidence.map((e) => `<tr class="${e.breached ? 'is-out' : ''}">
            <th scope="row">${label(e.key)}</th><td class="mono">${fmt(e.value, e.key)}</td>
            <td class="muted small">expected ${fmt(e.expected, e.key)} · limit ${fmt(e.threshold, e.key)}</td></tr>`).join('')}</tbody></table>
          <h4>What you might notice</h4>
          <ul class="notice">${p.notice.map((n) => `<li>${n}</li>`).join('')}</ul>
          ${issue.level === 'watch' ? '<p class="footnote">Watch: past a personal threshold without a confirmed alert, or a telemetry-only signal. Shown so nothing is hidden.</p>' : ''}
        </section>
        <section class="respond__steps">
          <div class="respond__head"><h4>Do now</h4><span class="mono small">${r.done.length}/${p.steps.length} done</span></div>
          <ol class="steps">${p.steps.map(([who, text], i) => `<li class="${r.done.includes(i) ? 'is-done' : ''}">
            <label><input type="checkbox" data-step="${i}" ${r.done.includes(i) ? 'checked' : ''}>
              <span class="steps__n mono">${i + 1}</span><span class="steps__text">${text}<span class="steps__who">${who}</span></span></label></li>`).join('')}</ol>
          <div class="escalate"><strong>Escalate if</strong><span>${p.escalate}</span></div>
          <p class="recheck"><span class="label">Re-check</span>${p.recheck}</p>
          <div class="respond__ack">
            ${r.ackAt ? `<span class="ack">✓ Acknowledged ${r.ackAt.slice(11, 16)} UTC${r.note ? ` — “${escapeHtml(r.note)}”` : ''}</span>`
              : `<input type="text" id="resp-note" maxlength="140" placeholder="Note (optional): what you found or did" aria-label="Acknowledgement note" value="${escapeHtml(note)}">
                 <button type="button" class="btn btn--primary" data-ack>Acknowledge</button>`}
          </div>
          <p class="footnote">Non-diagnostic; follow mission procedures. Acknowledging never clears an alert.</p>
        </section>
      </div>`;
    if (focusSel) body.querySelector(focusSel)?.focus({ preventScroll: true });
  };

  body.addEventListener('change', (e) => {
    const box = e.target.closest('[data-step]');
    if (!box) return;
    const i = Number(box.dataset.step);
    const all = store.get().responses;
    const r = all[issueId] || { done: [] };
    const done = box.checked ? [...new Set([...r.done, i])] : r.done.filter((x) => x !== i);
    store.set({ responses: { ...all, [issueId]: { ...r, done } } });
    draw();
  });
  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ack]')) return;
    const issue = last;
    const note = body.querySelector('#resp-note')?.value.trim() || '';
    const at = new Date().toISOString();
    const all = store.get().responses;
    const patch = { responses: { ...all, [issueId]: { ...(all[issueId] || { done: [] }), ackAt: at, note } } };
    const key = issue && ackEventKey(ctx, issue);
    if (key && !store.get().acks[key]) patch.acks = { ...store.get().acks, [key]: { at, note } };
    store.set(patch);
    toast('Acknowledged. Keep following the steps until readings are back in range.');
    draw();
  });

  draw();
  const off = feed.subscribe(draw);
  const p = PROTOCOLS[issueId.split(':')[0]];
  openDialog({ kicker: 'Response steps', title: p?.title || 'Issue', body, wide: true, onClose: off });
}
