// Expanded "page" view: a native modal <dialog> over the dashboard with a darkened, blurred backdrop.
// Native dialog gives focus trapping, Esc to close and focus return to the button that opened it.
//
// A page is { id, kicker(ctx), title(ctx), head?(ctx) -> html, mount(body, ctx) -> { render(), destroy?() },
//             onCancel?(ctx) -> true when it consumed Esc }.

export function createPageHost(ctx) {
  const dialog = document.getElementById('page');
  let active = null; // { page, view }

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
    else if (e.target.closest('[data-page-close]')) close();
  });
  dialog.addEventListener('cancel', (e) => {
    if (active?.page.onCancel?.(ctx)) e.preventDefault();
  });
  // The close event arrives a task after close(). If a page was opened again in between (e.g. Esc then
  // a keyboard shortcut), that late event must not tear down the new page.
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    active?.view.destroy?.();
    active = null;
    dialog.innerHTML = '';
    document.body.classList.remove('has-page');
  });

  function open(page) {
    if (active) { active.view.destroy?.(); active = null; } // open, or closed with its close event still pending
    dialog.className = `page page--${page.id}`;
    dialog.setAttribute('aria-labelledby', 'page-title');
    dialog.innerHTML = `
      <header class="page__head">
        <div class="page__title"><span class="card-kicker" id="page-kicker"></span><h2 id="page-title"></h2></div>
        <div class="page__tools" id="page-tools"></div>
        <button type="button" class="icon-btn" data-page-close aria-label="Close and return to the dashboard">✕</button>
      </header>
      <div class="page__body"></div>`;
    const body = dialog.querySelector('.page__body');
    const view = page.mount(body, ctx);
    active = { page, view };
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('has-page');
    render();
    dialog.querySelector('[data-page-close]').focus({ preventScroll: true });
  }

  function render() {
    if (!active) return;
    const { page, view } = active;
    dialog.querySelector('#page-kicker').textContent = page.kicker(ctx);
    dialog.querySelector('#page-title').textContent = page.title(ctx);
    const tools = dialog.querySelector('#page-tools');
    const html = page.head?.(ctx) ?? '';
    if (tools.dataset.html !== html) { tools.innerHTML = html; tools.dataset.html = html; }
    view.render();
  }

  function close() { if (dialog.open) dialog.close(); }

  // `active` is only reported while the dialog is actually open (it is cleared a task after closing).
  return { open, close, render, get active() { return dialog.open ? active?.page.id ?? null : null; }, el: dialog };
}
