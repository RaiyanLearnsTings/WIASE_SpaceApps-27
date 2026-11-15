// Shared dashboard card header: section number, title, one-line context, and a single "Open" affordance.
// The whole card body is also clickable (see app.mjs, data-expand-card), so the button is a clear hint, not the only way in.
export function cardHead({ idx, title, kicker = '', page = null }) {
  return `<header class="card__head">
    <span class="card__idx mono" aria-hidden="true">${idx}</span><h2>${title}</h2>
    ${kicker ? `<span class="card-kicker">${kicker}</span>` : ''}
    <span class="spacer"></span>
    ${page ? `<button type="button" class="open-btn" data-expand="${page}" aria-label="Open ${title}">Open <span aria-hidden="true">↗</span></button>` : ''}
  </header>`;
}
