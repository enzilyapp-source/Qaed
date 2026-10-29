const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
function open(saved) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'baloot.html'), 'utf8'), { url: 'https://qaid.test/baloot.html', runScripts: 'outside-only' });
  const w = dom.window, $ = id => w.document.getElementById(id); w.confirm = () => true;
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'jinjfa_score_v1']) w.localStorage.setItem(key, 'retained');
  if (saved) w.localStorage.setItem('qaed.baloot.v1', saved);
  w.eval(fs.readFileSync(path.join(root, 'baloot-core.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'baloot-app.js'), 'utf8'));
  const enter = (team, value) => { $('baloot-input-' + team).value = value; $('baloot-input-' + team).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const state = () => JSON.parse(w.localStorage.getItem('qaed.baloot.v1'));
  return { dom, w, $, enter, state };
}
test('both manual fields needed; Enter and form submission never save', () => {
  const ui = open(); ui.enter('A', '12'); assert(ui.$('baloot-register').disabled);
  assert.equal(ui.$('baloot-input-B').value, ''); ui.enter('B', '4');
  ui.$('baloot-input-B').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const event = new ui.w.Event('submit', { bubbles: true, cancelable: true }); ui.$('baloot-form').dispatchEvent(event);
  assert(event.defaultPrevented); assert.equal(ui.state().rounds.length, 0);
  ui.$('baloot-register').click(); assert.equal(ui.$('baloot-total-A').textContent, '12');
  assert.equal(ui.$('baloot-total-B').textContent, '4'); assert.equal(ui.state().rounds.length, 1);
  assert(ui.$('baloot-register').disabled); ui.$('baloot-register').click(); assert.equal(ui.state().rounds.length, 1);
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'jinjfa_score_v1']) assert.equal(ui.w.localStorage.getItem(key), 'retained');
  ui.dom.window.close();
});
test('152 locks inputs and registration, undo restores correction and reopens play', () => {
  const ui = open(); ui.enter('A', '140'); ui.enter('B', '50'); ui.$('baloot-register').click();
  ui.enter('A', '12'); ui.enter('B', '0'); ui.$('baloot-register').click();
  assert.equal(ui.$('baloot-winner-panel').hidden, false); assert(ui.$('baloot-winner-name').textContent.includes('A'));
  assert(ui.$('baloot-input-A').disabled); assert(ui.$('baloot-input-B').disabled); assert(ui.$('baloot-register').disabled);
  ui.$('baloot-undo').click(); assert(ui.$('baloot-winner-panel').hidden);
  assert.equal(ui.$('baloot-total-A').textContent, '140'); assert.equal(ui.$('baloot-input-A').value, '12');
  assert.equal(ui.state().rounds.length, 1); ui.dom.window.close();
});
test('reload preserves round ledger and unsaved values; new game resets only Baloot', () => {
  const ui = open(); ui.enter('A', '١٦'); ui.enter('B', '0'); ui.$('baloot-register').click(); ui.enter('B', '8');
  const saved = ui.w.localStorage.getItem('qaed.baloot.v1'); ui.dom.window.close();
  const restored = open(saved); assert.equal(restored.$('baloot-total-A').textContent, '16');
  assert.equal(restored.$('baloot-input-B').value, '8'); restored.$('baloot-new').click();
  assert.equal(restored.state().rounds.length, 0); assert.equal(restored.$('baloot-input-B').value, '');
  assert.equal(restored.w.localStorage.getItem('qaed.kout.v1'), 'retained'); restored.dom.window.close();
});
test('equal totals at the target show a tie and stop play', () => {
  const ui = open(); ui.enter('A', '152'); ui.enter('B', '152'); ui.$('baloot-register').click();
  assert(ui.$('baloot-winner-name').textContent.includes('تعادل')); assert(ui.$('baloot-register').disabled);
  ui.dom.window.close();
});
test('corrupt storage is retained while the page continues without persistence', () => {
  const ui = open('{broken'); assert.equal(ui.$('baloot-storage-warning').hidden, false);
  ui.enter('A', '10'); ui.enter('B', '6'); ui.$('baloot-register').click();
  assert.equal(ui.$('baloot-total-A').textContent, '10');
  assert.equal(ui.w.localStorage.getItem('qaed.baloot.v1'), '{broken'); ui.dom.window.close();
});
