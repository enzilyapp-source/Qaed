const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const T = require('../trix-core.js');
const root = path.join(__dirname, '..');
function open(saved) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'trix.html'), 'utf8'), { url: 'https://qaid.test/trix.html', runScripts: 'outside-only' });
  const w = dom.window, $ = id => w.document.getElementById(id); w.confirm = () => true;
  const dialog = $('trix-settings-dialog'); dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'qaed.baloot.v1', 'qaed.spita.v1', 'jinjfa_score_v1']) w.localStorage.setItem(key, 'retained');
  if (saved) w.localStorage.setItem('qaed.trix.v1', saved);
  for (const file of ['trix-core.js', 'trix-app.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const enter = (type, index, value) => { const input = $(`trix-count-${type}-${index}`); input.value = value; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const state = () => JSON.parse(w.localStorage.getItem('qaed.trix.v1'));
  return { dom, w, $, enter, state };
}
function validData(type) {
  return type === 'trix' ? { ranks: [1, 2, 3, 4] } : type === 'king' ? { taker: 'p4', declared: false, declarer: null }
    : { counts: type === 'queens' ? [1, 1, 1, 1] : [4, 3, 3, 3] };
}
function single(state, type) { return T.record(T.setData(T.select(state, type), type, validData(type)), 1); }
test('complex is last, future kingdoms are read-only, and existing saves stay intact', () => {
  const ui = open();
  assert.equal(ui.$('trix-games').lastChild.id, 'trix-game-complex');
  ui.$('trix-kingdoms').children[2].click(); assert.equal(ui.$('trix-review').hidden, false);
  assert([...ui.$('trix-games').children].every(b => b.disabled)); ui.$('trix-current').click();
  assert.equal(ui.$('trix-review').hidden, true); assert(!ui.$('trix-game-tricks').disabled);
  ui.$('trix-game-tricks').click();
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'qaed.baloot.v1', 'qaed.spita.v1', 'jinjfa_score_v1'])
    assert.equal(ui.w.localStorage.getItem(key), 'retained');
  ui.dom.window.close();
});
test('counts must total thirteen; typing and Enter never consume the game', () => {
  const ui = open(); ui.$('trix-game-tricks').click();
  assert(ui.$('trix-register').disabled);
  for (let i = 0; i < 4; i++) ui.enter('tricks', i, '3');
  assert(ui.$('trix-register').disabled); assert(ui.$('trix-validation').textContent.includes('13'));
  ui.enter('tricks', 0, '4'); assert(!ui.$('trix-register').disabled);
  const input = ui.$('trix-count-tricks-0');
  input.dispatchEvent(new ui.w.KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.equal(ui.state().rounds.length, 0); assert(!ui.$('trix-game-tricks').disabled);
  ui.$('trix-register').click(); assert.equal(ui.state().rounds.length, 1); assert(ui.$('trix-game-tricks').disabled);
  ui.$('trix-register').click(); assert.equal(ui.state().rounds.length, 1); ui.dom.window.close();
});
test('counter buttons never go negative and stop increasing once the required total is reached', () => {
  const ui = open(); ui.$('trix-game-diamonds').click();
  let controls = ui.$('trix-count-diamonds-0').parentElement;
  assert(controls.firstChild.disabled); controls.lastChild.click(); assert.equal(ui.$('trix-count-diamonds-0').value, '1');
  ui.enter('diamonds', 0, '13');
  for (let i = 0; i < 4; i++) assert(ui.$('trix-count-diamonds-' + i).parentElement.lastChild.disabled);
  ui.enter('diamonds', 1, '-1'); assert(ui.$('trix-register').disabled); ui.dom.window.close();
});
test('complex supports any two components, requires start, and closes both atomically', () => {
  const ui = open(); ui.$('trix-game-complex').click();
  assert.equal(ui.$('trix-complex-trix'), null); assert(ui.$('trix-complex-start').disabled);
  ui.$('trix-complex-queens').click(); assert(ui.$('trix-complex-start').disabled);
  ui.$('trix-complex-king').click(); assert(!ui.$('trix-complex-start').disabled);
  assert.equal(ui.$('trix-forms').children.length, 0); ui.$('trix-complex-start').click();
  assert.equal(ui.$('trix-forms').children.length, 2);
  ui.enter('queens', 0, '4'); ui.$('trix-king-taker-p2').click();
  ui.$('trix-king-declared').click(); assert(ui.$('trix-register').disabled);
  ui.$('trix-king-declarer-p1').click(); assert(!ui.$('trix-register').disabled);
  assert.equal(ui.state().rounds.length, 0); ui.$('trix-register').click();
  assert.equal(ui.state().rounds.length, 1); assert.deepEqual(ui.state().rounds[0].types, ['queens', 'king']);
  assert(ui.$('trix-game-queens').disabled); assert(ui.$('trix-game-king').disabled); assert(!ui.$('trix-game-trix').disabled);
  const totals = ui.$('trix-table-foot').firstChild.children;
  assert.equal(totals[1].textContent, '-25'); assert.equal(totals[2].textContent, '-150');
  ui.$('trix-undo').click(); assert.equal(ui.state().rounds.length, 0);
  assert(!ui.$('trix-game-queens').disabled); assert(!ui.$('trix-game-king').disabled);
  assert.equal(ui.$('trix-forms').children.length, 2); assert(!ui.$('trix-register').disabled); ui.dom.window.close();
});
test('king announcement uses corrected -150/+75 and allows net -75 for the same player', () => {
  const ui = open(); ui.$('trix-game-king').click(); ui.$('trix-king-taker-p3').click();
  assert.equal(ui.$('trix-preview').children[2].textContent.includes('-75'), true);
  ui.$('trix-king-declared').click(); assert(ui.$('trix-register').disabled);
  ui.$('trix-king-declarer-p4').click();
  assert(ui.$('trix-preview').children[2].textContent.includes('-150'));
  assert(ui.$('trix-preview').children[3].textContent.includes('+75'));
  ui.$('trix-king-declarer-p3').click(); assert(ui.$('trix-preview').children[2].textContent.includes('-75'));
  ui.dom.window.close();
});
test('rank selection swaps positions and scores each unique rank correctly', () => {
  const ui = open(); ui.$('trix-game-trix').click();
  for (let i = 0; i < 4; i++) ui.$(`trix-rank-${i}-${i + 1}`).click();
  assert(!ui.$('trix-register').disabled); ui.$('trix-rank-0-2').click();
  assert.deepEqual(ui.state().draft.data.trix.ranks, [2, 1, 3, 4]);
  const preview = [...ui.$('trix-preview').querySelectorAll('bdi')].map(el => el.textContent);
  assert.deepEqual(preview, ['+150', '+200', '+100', '+50']);
  ui.$('trix-register').click(); assert(ui.$('trix-game-trix').disabled); ui.dom.window.close();
});
test('completing a kingdom moves to the next owner; undo returns to the previous one', () => {
  let state = T.initialState(); for (const type of ['tricks', 'diamonds', 'queens', 'king']) state = single(state, type);
  const ui = open(JSON.stringify(state)); ui.$('trix-game-trix').click();
  for (let i = 0; i < 4; i++) ui.$(`trix-rank-${i}-${i + 1}`).click();
  ui.$('trix-register').click(); assert(ui.$('trix-title').textContent.includes('الثانية'));
  assert.equal(ui.state().rounds.length, 5); assert(!ui.$('trix-game-tricks').disabled);
  ui.$('trix-undo').click(); assert(ui.$('trix-title').textContent.includes('الأولى'));
  assert.equal(ui.state().rounds.length, 4); assert.equal(ui.state().draft.selection, 'trix');
  assert(!ui.$('trix-register').disabled); ui.dom.window.close();
});
test('completed four-kingdom game shows highest total winner and prevents extra results', () => {
  let state = T.initialState(); for (let k = 0; k < 4; k++) for (const type of T.TYPES) state = single(state, type);
  const ui = open(JSON.stringify(state)); assert.equal(ui.$('trix-winner-panel').hidden, false);
  assert(ui.$('trix-winner-name').textContent.includes('اللاعب الأول'));
  assert([...ui.$('trix-games').children].every(button => button.disabled));
  ui.$('trix-undo').click(); assert(ui.$('trix-winner-panel').hidden); assert.equal(ui.state().rounds.length, 19);
  assert(!ui.$('trix-register').disabled); ui.dom.window.close();
});
test('reload restores incomplete complex selections without committing them', () => {
  const ui = open(); ui.$('trix-game-complex').click(); ui.$('trix-complex-tricks').click();
  ui.$('trix-complex-diamonds').click(); ui.$('trix-complex-start').click(); ui.enter('tricks', 0, '7');
  const saved = ui.w.localStorage.getItem('qaed.trix.v1'); ui.dom.window.close();
  const restored = open(saved); assert.equal(restored.$('trix-count-tricks-0').value, '7');
  assert.equal(restored.state().rounds.length, 0); assert(restored.$('trix-register').disabled); restored.dom.window.close();
});
test('player names are safe text; new game preserves names without affecting other games', () => {
  const ui = open(); ui.$('trix-settings-open').click(); ui.$('trix-name-p1').value = '<img src=x onerror=alert(1)>';
  ui.$('trix-settings-form').dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(ui.w.document.querySelectorAll('img').length, 0);
  ui.$('trix-game-king').click(); ui.$('trix-king-taker-p2').click(); ui.$('trix-register').click(); ui.$('trix-new').click();
  assert.equal(ui.state().rounds.length, 0); assert(ui.state().players[0].name.startsWith('<img'));
  assert.equal(ui.w.localStorage.getItem('qaed.hand.v1'), 'retained'); ui.dom.window.close();
});
test('corrupt saved history stays intact while the current session remains usable', () => {
  const ui = open('{bad-trix'); assert.equal(ui.$('trix-storage-warning').hidden, false);
  ui.$('trix-game-king').click(); ui.$('trix-king-taker-p2').click(); ui.$('trix-register').click();
  assert.equal(ui.$('trix-ledger').children.length, 1);
  assert.equal(ui.w.localStorage.getItem('qaed.trix.v1'), '{bad-trix'); ui.dom.window.close();
});
