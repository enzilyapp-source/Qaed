const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
function open(saved) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'spita.html'), 'utf8'), { url: 'https://qaid.test/spita.html', runScripts: 'outside-only' });
  const w = dom.window, $ = id => w.document.getElementById(id); w.confirm = () => true;
  const dialog = $('settings-dialog'); dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'qaed.baloot.v1']) w.localStorage.setItem(key, 'retained');
  if (saved) w.localStorage.setItem('qaed.spita.v1', saved);
  for (const file of ['hand-core.js', 'spita-core.js', 'hand-app.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const enter = (id, value) => { $(id).value = value; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const state = () => JSON.parse(w.localStorage.getItem('qaed.spita.v1'));
  return { dom, w, $, enter, state };
}
test('Spita inputs are manual, and only registration changes history', () => {
  const ui = open(); ui.enter('score-p1', '-40'); assert.equal(ui.$('score-p2').value, '');
  for (let i = 2; i <= 6; i++) ui.enter('score-p' + i, '100');
  ui.$('score-p1').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.equal(ui.state().profiles.individual.rounds.length, 0);
  ui.$('register-round').click(); assert.equal(ui.state().profiles.individual.rounds.length, 1);
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'qaed.baloot.v1']) assert.equal(ui.w.localStorage.getItem(key), 'retained');
  ui.dom.window.close();
});
test('team game pauses at -150 and explicitly extends to -200', () => {
  const ui = open(); ui.w.document.querySelector('[data-mode=teams]').click();
  ui.enter('score-A', '-150'); ui.enter('score-B', '50'); ui.$('register-round').click();
  assert.equal(ui.$('winner-panel').hidden, false); assert(!ui.$('extend-game').hidden);
  assert(ui.$('register-round').disabled); assert(ui.$('extend-game').textContent.includes('200'));
  ui.$('extend-game').click(); assert(!ui.$('score-A').disabled); assert(ui.$('winner-panel').hidden);
  assert.equal(ui.state().profiles.teams.target, -200);
  ui.enter('score-A', '-50'); ui.enter('score-B', '10'); ui.$('register-round').click();
  assert.equal(ui.$('winner-panel').hidden, false); assert(ui.$('extend-game').hidden);
  ui.dom.window.close();
});
test('+10000 ends play with no extension, even with simultaneous -150', () => {
  const ui = open(); ui.w.document.querySelector('[data-mode=teams]').click();
  ui.enter('score-A', '-150'); ui.enter('score-B', '10000'); ui.$('register-round').click();
  assert.equal(ui.$('winner-panel').hidden, false); assert(ui.$('extend-game').hidden);
  assert(ui.$('winner-detail').textContent.includes('10000')); assert(ui.$('register-round').disabled);
  ui.$('undo-round').click(); assert(ui.$('winner-panel').hidden);
  assert.equal(ui.$('score-B').value, '10000'); assert.equal(ui.state().profiles.teams.rounds.length, 0);
  ui.dom.window.close();
});
test('Spita settings omit the Hand round count and allow individual player setup', () => {
  const ui = open(); ui.$('settings-open').click(); assert(ui.$('round-limit').parentElement.hidden);
  ui.$('player-count').value = '3'; ui.$('player-count').dispatchEvent(new ui.w.Event('change'));
  ui.$('settings-form').dispatchEvent(new ui.w.Event('submit', { cancelable: true, bubbles: true }));
  assert.equal(ui.$('score-inputs').children.length, 3);
  assert(!ui.$('round-label').textContent.includes('/')); ui.dom.window.close();
});
test('reload keeps extension and draft, with independent modes; new game resets the target', () => {
  const ui = open(); ui.w.document.querySelector('[data-mode=teams]').click();
  ui.enter('score-A', '-150'); ui.enter('score-B', '20'); ui.$('register-round').click(); ui.$('extend-game').click();
  ui.enter('score-A', '-20'); const saved = ui.w.localStorage.getItem('qaed.spita.v1'); ui.dom.window.close();
  const restored = open(saved); assert.equal(restored.$('score-A').value, '-20');
  assert.equal(restored.state().profiles.teams.target, -200); assert.equal(restored.state().profiles.individual.rounds.length, 0);
  restored.$('new-game').click(); assert.equal(restored.state().profiles.teams.target, -150);
  assert.equal(restored.state().profiles.teams.rounds.length, 0); restored.dom.window.close();
});
test('Baloot title no longer contains the removed race slogan', () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'baloot.html'), 'utf8'));
  assert.equal(dom.window.document.getElementById('baloot-title').textContent, 'البلوت');
  assert(!dom.window.document.body.textContent.includes('السباق إلى 152')); dom.window.close();
});
