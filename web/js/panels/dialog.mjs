// Small modal windows (scenarios, settings, check-ins) stacked above an open page.
// Native dialog gives focus trapping and Esc to close.
const dialog = () => document.getElementById('dialog');

export function openDialog({ kicker = '', title, body, wide = false, onClose }) {
  const d = dialog();
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
  d.onclose = () => { onClose?.(); d.innerHTML = ''; };
  d.onclick = (e) => { if (e.target === d) d.close(); }; // click on backdrop
  if (d.open) d.close();
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
