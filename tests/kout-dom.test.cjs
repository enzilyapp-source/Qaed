const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
function open(saved) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'kout.html'), 'utf8'), { url: 'https://qaid.test/kout.html', runScripts: 'outside-only' });
  const w = dom.window, doc = w.document, $ = id => doc.getElementById(id);
  w.confirm = () => true;
  const dialog = $('kout-settings-dialog');
  dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  w.localStorage.setItem('qaed.hand.v1', '{"hand":"retained"}');
  w.localStorage.setItem('jinjfa_score_v1', '{"general":"retained"}');
  if (saved) w.localStorage.setItem('qaed.kout.v1', saved);
  w.eval(fs.readFileSync(path.join(root, 'kout-core.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(root, 'kout-app.js'), 'utf8'));
  const choose = (field, value) => doc.querySelector(`[data-kout-field="${field}"][data-kout-value="${value}"]`).click();
  const state = () => JSON.parse(w.localStorage.getItem('qaed.kout.v1'));
  return { dom, w, doc, $, choose, state };
}
test('selections preview a losing bon without changing totals; only register commits', () => {
  const ui = open(); ui.choose('team', 'A'); ui.choose('contract', 'bon'); ui.choose('outcome', 'loss');
  assert.equal(ui.$('kout-score-A').textContent, '0'); assert.equal(ui.$('kout-score-B').textContent, '0');
  assert(ui.$('kout-preview').textContent.includes('18')); assert(ui.$('kout-preview').textContent.includes('الفريق الثاني'));
  assert.equal(ui.state().rounds.length, 0); ui.$('kout-register').click();
  assert.equal(ui.$('kout-score-B').textContent, '18'); assert.equal(ui.state().rounds.length, 1);
  assert(ui.$('kout-register').disabled); ui.$('kout-register').click(); assert.equal(ui.state().rounds.length, 1);
  assert.equal(ui.w.localStorage.getItem('qaed.hand.v1'), '{"hand":"retained"}');
  assert.equal(ui.w.localStorage.getItem('jinjfa_score_v1'), '{"general":"retained"}');
  ui.dom.window.close();
});
test('forced loss awards five; ordinary five loss awards ten', () => {
  const ui = open();
  for (const contract of ['forced', '5']) {
    ui.choose('team', 'B'); ui.choose('contract', contract); ui.choose('outcome', 'loss'); ui.$('kout-register').click();
  }
  assert.equal(ui.$('kout-score-A').textContent, '15'); assert.equal(ui.$('kout-score-B').textContent, '0');
  ui.dom.window.close();
});
test('51-zero stops entry, and undo permits a correction without automatic recommit', () => {
  const ui = open();
  for (const contract of ['bon', '5', '5', '5']) {
    ui.choose('team', 'A'); ui.choose('contract', contract); ui.choose('outcome', 'win'); ui.$('kout-register').click();
  }
  assert.equal(ui.$('kout-score-A').textContent, '51'); assert.equal(ui.$('kout-winner-panel').hidden, false);
  assert(ui.$('kout-winner-detail').textContent.includes('صفر')); assert(ui.$('kout-register').disabled);
  assert([...ui.doc.querySelectorAll('[data-kout-field]')].every(b => b.disabled));
  ui.$('kout-undo').click(); assert.equal(ui.$('kout-score-A').textContent, '46');
  assert(ui.$('kout-winner-panel').hidden); assert.equal(ui.state().rounds.length, 3);
  ui.choose('outcome', 'loss'); ui.$('kout-register').click();
  assert.equal(ui.$('kout-score-A').textContent, '46'); assert.equal(ui.$('kout-score-B').textContent, '10');
  ui.dom.window.close();
});
test('101+ with a nonzero opponent stops the game', () => {
  const ui = open(); ui.choose('team', 'B'); ui.choose('contract', 'forced'); ui.choose('outcome', 'win'); ui.$('kout-register').click();
  for (let i = 0; i < 3; i++) { ui.choose('team', 'A'); ui.choose('contract', 'bon'); ui.choose('outcome', 'win'); ui.$('kout-register').click(); }
  assert.equal(ui.$('kout-score-A').textContent, '108'); assert.equal(ui.$('kout-score-B').textContent, '5');
  assert.equal(ui.$('kout-winner-panel').hidden, false); assert(ui.$('kout-winner-detail').textContent.includes('101'));
  ui.dom.window.close();
});
test('reload preserves history and draft, names render safely, and new game retains names', () => {
  const ui = open(); ui.$('kout-settings-open').click();
  ui.$('kout-name-A').value = '<img src=x onerror=alert(1)>';
  ui.$('kout-settings-form').dispatchEvent(new ui.w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(ui.doc.querySelectorAll('img').length, 0);
  ui.choose('team', 'A'); ui.choose('contract', '6'); ui.choose('outcome', 'win'); ui.$('kout-register').click();
  ui.choose('contract', '8'); const saved = ui.w.localStorage.getItem('qaed.kout.v1'); ui.dom.window.close();
  const restored = open(saved); assert.equal(restored.$('kout-score-A').textContent, '6');
  assert.equal(restored.state().draft.contract, '8'); assert.equal(restored.state().rounds.length, 1);
  restored.$('kout-new').click(); assert.equal(restored.$('kout-score-A').textContent, '0');
  assert(restored.$('kout-team-A').textContent.startsWith('<img')); restored.dom.window.close();
});
test('invalid saved data stays intact while the page works for the current session', () => {
  const ui = open('{invalid-kout'); assert.equal(ui.$('kout-storage-warning').hidden, false);
  ui.choose('team', 'A'); ui.choose('contract', '5'); ui.choose('outcome', 'win'); ui.$('kout-register').click();
  assert.equal(ui.$('kout-score-A').textContent, '5');
  assert.equal(ui.w.localStorage.getItem('qaed.kout.v1'), '{invalid-kout'); ui.dom.window.close();
});
