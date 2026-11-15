// Small modal windows (scenarios, settings, check-ins) stacked above an open page.
// Native dialog gives focus trapping and Esc to close.
const dialog = () => document.getElementById('dialog');

export function openDialog({ kicker = '', title, body, wide = false, onClose }) {
  const d = dialog();
  // Replacing an open dialog (e.g. response steps → walkthrough): run the old one's cleanup now. Its close
  // event arrives a task later, when this dialog is already open, and is ignored below.
  if (d.open) { const prev = d._onClose; d._onClose = null; prev?.(); d.close(); }
  d.className = wide ? 'dialog dialog--wide' : 'dialog';
  d.innerHTML = `
    <header class="dialog__head">
      <div><span class="card-kicker">${kicker}</span><h2 id="dialog-title">${title}</h2></div>
      <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
    </header>
    <div class="dialog__body"></div>`;
  const content = d.querySelector('.dialog__body');
  if (typeof body === 'string') content.innerHTML = body; else content.append(body);
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d._onClose = onClose;
  d.onclose = () => {
    if (d.open) return; // a newer dialog already took over
    const fn = d._onClose;
    d._onClose = null;
    fn?.();
    d.innerHTML = '';
  };
  d.onclick = (e) => { if (e.target === d) d.close(); }; // click on backdrop
  d.showModal();
  return { dialog: d, body: content, close: () => d.close() };
}

export const dialogOpen = () => dialog().open;

/** Status message. Uses a manual popover so it shows above open modal dialogs (top layer). */
export function toast(message, tone = 'info') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.dataset.tone = tone;
  try {
    if (t.matches(':popover-open')) t.hidePopover();
    t.showPopover();
  } catch { /* popover unsupported: the element is still positioned on the page */ }
  t.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.classList.remove('is-visible');
    try { t.hidePopover(); } catch { /* ignore */ }
  }, 3200);
}
