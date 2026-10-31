// Optional DOM integration checks: install jsdom outside the static site, then
// NODE_PATH=/path/to/qa/node_modules node --test tests/hand-dom.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'hand-core.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'hand-app.js'), 'utf8');
function open(saved, blocked = false) {
  const dom = new JSDOM(html, { url: 'https://qaid.test/', runScripts: 'outside-only' });
  const w = dom.window, doc = w.document;
  w.confirm = () => true;
  const dialog = doc.querySelector('dialog');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => dialog.removeAttribute('open');
  if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('storage unavailable'); } });
  else {
    w.localStorage.setItem('jinjfa_score_v1', '{"legacy":"untouched"}');
    if (saved) w.localStorage.setItem('qaed.hand.v1', saved);
  }
  w.eval(core); w.eval(app);
  const el = id => doc.getElementById(id);
  const enter = (id, value) => { const input = el(id); input.value = value; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const click = id => el(id).click();
  const state = () => JSON.parse(w.localStorage.getItem('qaed.hand.v1'));
  return { dom, w, doc, el, enter, click, state };
}
test('typing, sign buttons, Enter and form submission never record a round', () => {
  const ui = open();
  ui.enter('score-p1', '40'); ui.el('score-p1').parentElement.firstChild.click();
  assert.equal(ui.el('score-p1').value, '-40'); assert.equal(ui.el('score-p6').value, '+200');
  ui.el('score-p1').dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const event = new ui.w.Event('submit', { bubbles: true, cancelable: true });
  ui.el('score-form').dispatchEvent(event); assert(event.defaultPrevented);
  assert.equal(ui.state().profiles.individual.rounds.length, 0);
  assert.equal(ui.el('history-body').children.length, 0);
  ui.click('register-round'); assert.equal(ui.state().profiles.individual.rounds.length, 1);
  assert.equal(ui.el('history-body').children.length, 1);
  assert.equal(ui.w.localStorage.getItem('jinjfa_score_v1'), '{"legacy":"untouched"}');
  ui.dom.window.close();
});
test('manual penalties are editable and represented correctly in history and totals', () => {
  const ui = open(); ui.enter('score-p1', '-40'); ui.enter('score-p2', '95'); ui.enter('score-p1', '-80');
  assert.equal(ui.el('score-p2').value, '95'); assert.equal(ui.el('score-p3').value, '+400');
  ui.click('register-round');
  assert.equal(ui.state().profiles.individual.rounds[0].scores.p2, 95);
  assert(ui.el('history-total').textContent.includes('-80'));
  assert.equal(ui.el('history-total').querySelectorAll('.leader').length, 1);
  ui.dom.window.close();
});
test('team switch and reload preserve independent individual/team histories and drafts', () => {
  const ui = open(); ui.enter('score-p1', '-40'); ui.click('register-round');
  ui.doc.querySelector('[data-mode=teams]').click();
  assert.equal(ui.el('score-inputs').children.length, 2);
  ui.enter('score-B', '-160'); ui.click('register-round'); ui.enter('score-A', '-80');
  const saved = ui.w.localStorage.getItem('qaed.hand.v1'); ui.dom.window.close();
  const restored = open(saved);
  assert.equal(restored.el('score-A').value, '-80'); assert.equal(restored.el('score-B').value, '+400');
  assert.equal(restored.state().profiles.teams.rounds.length, 1);
  assert.equal(restored.state().profiles.individual.rounds.length, 1);
  restored.dom.window.close();
});
test('seven rounds lock entry, show the lowest winner, and extend only up to nine', () => {
  const ui = open(); ui.doc.querySelector('[data-mode=teams]').click();
  for (let i = 0; i < 7; i++) { ui.enter('score-A', '-40'); ui.click('register-round'); }
  assert.equal(ui.el('winner-panel').hidden, false); assert(ui.el('winner-name').textContent.includes('الفريق A'));
  assert(ui.el('score-A').disabled); assert(ui.el('register-round').disabled);
  ui.click('register-round'); assert.equal(ui.state().profiles.teams.rounds.length, 7);
  ui.click('extend-game'); assert(!ui.el('score-A').disabled);
  ui.enter('score-B', '-40'); ui.click('register-round'); ui.click('extend-game');
  ui.enter('score-B', '-40'); ui.click('register-round');
  assert.equal(ui.state().profiles.teams.rounds.length, 9); assert(ui.el('extend-game').hidden);
  ui.dom.window.close();
});
test('undo restores the last round for correction without committing it', () => {
  const ui = open(); ui.enter('score-p1', '-40'); ui.click('register-round'); ui.click('undo-round');
  assert.equal(ui.state().profiles.individual.rounds.length, 0);
  assert.equal(ui.el('score-p1').value, '-40'); assert(ui.el('history-wrap').hidden);
  ui.dom.window.close();
});
test('settings support player count, nine rounds, and safe text for player names', () => {
  const ui = open(); ui.click('settings-open');
  ui.el('player-count').value = '3'; ui.el('player-count').dispatchEvent(new ui.w.Event('change'));
  ui.el('participant-names').querySelector('input').value = '<img src=x onerror=alert(1)>';
  ui.el('round-limit').value = '9';
  ui.el('settings-form').dispatchEvent(new ui.w.Event('submit', { cancelable: true, bubbles: true }));
  assert.equal(ui.el('score-inputs').children.length, 3); assert.equal(ui.state().profiles.individual.roundLimit, 9);
  assert.equal(ui.doc.querySelectorAll('img').length, 0);
  assert(ui.doc.querySelector('.player-label').textContent.startsWith('<img'));
  ui.enter('score-p1', '-40'); ui.click('settings-open'); assert(ui.el('player-count').disabled);
  ui.dom.window.close();
});
test('blocked storage keeps the page usable with an understandable warning', () => {
  const ui = open(undefined, true);
  assert.equal(ui.el('storage-warning').hidden, false);
  ui.enter('score-p1', '-40'); ui.click('register-round');
  assert.equal(ui.el('history-body').children.length, 1);
  ui.dom.window.close();
});
test('corrupt storage is retained instead of being silently overwritten', () => {
  const ui = open('{old-corrupt-data');
  ui.enter('score-p1', '-40'); ui.click('register-round');
  assert.equal(ui.w.localStorage.getItem('qaed.hand.v1'), '{old-corrupt-data');
  assert.equal(ui.el('history-body').children.length, 1);
  ui.dom.window.close();
});
test('mobile scoreboard shows recorded totals only and follows undo and mode changes', () => {
  const ui = open();
  const totals = () => Array.from(ui.el('current-scores').querySelectorAll('bdi'), el => el.textContent);
  assert.deepEqual(totals(), ['0', '0', '0', '0', '0', '0']);
  ui.enter('score-p1', '-40'); assert.equal(totals()[0], '0');
  ui.click('register-round'); assert.deepEqual(totals(), ['-40', '+200', '+200', '+200', '+200', '+200']);
  ui.click('undo-round'); assert.deepEqual(totals(), ['0', '0', '0', '0', '0', '0']);
  ui.doc.querySelector('[data-mode="teams"]').click(); assert.deepEqual(totals(), ['0', '0']);
  ui.dom.window.close();
});
