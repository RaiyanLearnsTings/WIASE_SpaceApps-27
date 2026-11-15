// Keyboard shortcuts. The key → action mapping is pure (tests/web/shortcuts.test.mjs); the installer
// ignores keys while typing, while a small dialog owns the keyboard (check-ins, the reaction test,
// response steps), during the guided tour, and whenever a modifier is held.
import { openDialog, dialogOpen, toast } from './panels/dialog.mjs';

export const SHORTCUTS = [
  { keys: ['1', '2', '3'], label: 'Open astronaut 001 · 002 · 003' },
  { keys: ['A'], label: 'Alerts & data' },
  { keys: ['T'], label: 'To-do & check-ins' },
  { keys: ['C'], label: 'Cabin map' },
  { keys: ['I'], label: 'About, data & validation' },
  { keys: ['P'], label: 'Pause / play the recording', replayOnly: true },
  { keys: ['← →'], label: 'Read values on a focused chart' },
  { keys: ['?'], label: 'Show these shortcuts' },
  { keys: ['Esc'], label: 'Close the open window' },
];

const PAGE_KEYS = { a: 'alerts', t: 'todo', c: 'cabin', i: 'about' };

/** The shortcut letter for a page id (for on-screen hints), or null. */
export const keyForPage = (page) => Object.entries(PAGE_KEYS).find(([, id]) => id === page)?.[0].toUpperCase() ?? null;

/** @returns {{type:'astronaut', index:number}|{type:'page', id:string}|{type:'pause'}|{type:'help'}|null} */
export function actionFor(e, { replay = false } = {}) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const key = String(e.key || '');
  if (key === '?') return { type: 'help' };
  if (key === '1' || key === '2' || key === '3') return { type: 'astronaut', index: Number(key) - 1 };
  const k = key.toLowerCase();
  if (PAGE_KEYS[k]) return { type: 'page', id: PAGE_KEYS[k] };
  if (k === 'p' && replay) return { type: 'pause' };
  return null;
}

/** True when the key press belongs to a text field or other control that reads keys itself. */
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
  if (tag === 'input') return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes((el.type || '').toLowerCase());
  return false;
}

export function openShortcutHelp(ctx) {
  const replay = ctx.mode === 'replay';
  const rows = SHORTCUTS.filter((s) => replay || !s.replayOnly).map((s) => `<tr><th scope="row">${s.keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</th><td>${s.label}</td></tr>`).join('');
  openDialog({ kicker: 'Help', title: 'Keyboard shortcuts', body: `<table class="shortcut-table" id="shortcut-help"><tbody>${rows}</tbody></table>
    <p class="footnote">Shortcuts pause while you type, during a check-in and during the guided tour. The keys are also shown next to each card's Open button.</p>` });
}

const helpOpen = () => !!document.querySelector('#dialog[open] #shortcut-help');

export function installShortcuts(ctx) {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || isTypingTarget(e.target) || ctx.tour?.active) return;
    // Other small dialogs (check-ins, the reaction test, response steps) own the keyboard.
    // The shortcut list itself doesn't: a shortcut closes it and runs, "?" toggles it.
    if (dialogOpen() && !helpOpen()) return;
    const action = actionFor(e, { replay: ctx.mode === 'replay' });
    if (!action) return;
    e.preventDefault();
    if (helpOpen()) { document.getElementById('dialog').close(); if (action.type === 'help') return; }
    if (action.type === 'help') openShortcutHelp(ctx);
    else if (action.type === 'pause') { ctx.togglePause(); toast(ctx.feed.paused ? 'Recording paused. Press P to play.' : 'Playing.'); }
    // The page host clears `active` in its close event, a moment after close(): check the dialog itself too.
    const showing = (id) => ctx.pages.el.open && ctx.pages.active === id;
    if (action.type === 'page') { if (showing(action.id)) ctx.pages.close(); else ctx.openPage(action.id); }
    else {
      const id = (ctx.baselines?.astronauts || ctx.feed.state.frame?.astronauts || [])[action.index]?.id;
      if (!id) return;
      if (showing('person') && ctx.store.get().astronaut === id) ctx.pages.close(); else ctx.openPerson(id);
    }
  });
}
