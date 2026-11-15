import test from 'node:test';
import assert from 'node:assert/strict';
import { actionFor, isTypingTarget, keyForPage } from '../../web/js/shortcuts.mjs';

test('on-screen key hints match the shortcut map', () => {
  for (const page of ['alerts', 'todo', 'cabin', 'about']) {
    assert.deepEqual(actionFor({ key: keyForPage(page).toLowerCase() }), { type: 'page', id: page });
  }
  assert.equal(keyForPage('person'), null);
});

const key = (k, extra = {}) => ({ key: k, ...extra });

test('number keys open astronauts, letters open pages', () => {
  assert.deepEqual(actionFor(key('2')), { type: 'astronaut', index: 1 });
  assert.deepEqual(actionFor(key('a')), { type: 'page', id: 'alerts' });
  assert.deepEqual(actionFor(key('T')), { type: 'page', id: 'todo' });
  assert.deepEqual(actionFor(key('c')), { type: 'page', id: 'cabin' });
  assert.deepEqual(actionFor(key('i')), { type: 'page', id: 'about' });
  assert.deepEqual(actionFor(key('?')), { type: 'help' });
  assert.equal(actionFor(key('4')), null);
  assert.equal(actionFor(key('x')), null);
});

test('pause only exists in the recorded demo', () => {
  assert.equal(actionFor(key('p')), null);
  assert.deepEqual(actionFor(key('p'), { replay: true }), { type: 'pause' });
});

test('modified keys are left to the browser', () => {
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(actionFor(key('a', { [mod]: true })), null);
});

test('typing in a field never triggers a shortcut', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'range' }), false);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});
