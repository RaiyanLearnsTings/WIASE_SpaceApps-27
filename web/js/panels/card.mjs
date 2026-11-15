// Shared dashboard card header: section number, title, one-line context, and a single "Open" affordance.
// The whole card body is also clickable (see app.mjs, data-expand-card), so the button is a clear hint, not the only way in.
// Each card shows its keyboard shortcut next to "Open" (see shortcuts.mjs) so the keys are discoverable.
import { keyForPage } from '../shortcuts.mjs';

/** Small visible key hint; screen readers get the shortcut from aria-keyshortcuts instead. */
export const keyHint = (keys) => `<span class="key-hint" aria-hidden="true">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span>`;

export function cardHead({ idx, title, kicker = '', page = null, keys = null }) {
  const key = page ? keyForPage(page) : null;
  return `<header class="card__head">
    <span class="card__idx mono" aria-hidden="true">${idx}</span><h2>${title}</h2>
    ${kicker ? `<span class="card-kicker">${kicker}</span>` : ''}
    <span class="spacer"></span>
    ${keys ? keyHint(keys) : ''}
    ${page ? `<button type="button" class="open-btn" data-expand="${page}" aria-label="Open ${title}"${key ? ` aria-keyshortcuts="${key}" title="Open ${title} (${key})"` : ''}>Open <span aria-hidden="true">↗</span>${key ? keyHint([key]) : ''}</button>` : ''}
  </header>`;
}
