const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'general.html'), 'utf8');
function open(saved) {
  const dom = new JSDOM(html, { url: 'https://qaid.test/general.html', runScripts: 'outside-only' });
  const w = dom.window, $ = id => w.document.getElementById(id);
  w.confirm = () => true;
  w.localStorage.setItem('qaed.hand.v1', 'untouched');
  if (saved) w.localStorage.setItem('jinjfa_score_v1', saved);
  w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  return { dom, w, $, saved: () => w.localStorage.getItem('jinjfa_score_v1') };
}
test('general registration, signed points, note, undo and reload retain legacy storage', () => {
  const ui = open();
  ui.$('inputA').value = '24'; ui.$('inputB').value = '-6';
  ui.$('roundNoteInput').value = 'الجولة الأولى'; ui.$('saveRoundBtn').click();
  assert.equal(ui.$('scoreA').textContent, '24'); assert.equal(ui.$('scoreB').textContent, '-6');
  const restored = open(ui.saved());
  assert.equal(restored.$('scoreA').textContent, '24');
  assert(restored.$('logBody').textContent.includes('الجولة الأولى'));
  restored.$('undoBtn').click();
  assert.equal(restored.$('scoreA').textContent, '0'); assert.equal(restored.$('roundCount').textContent, '0');
  assert.equal(restored.w.localStorage.getItem('qaed.hand.v1'), 'untouched');
  ui.dom.window.close(); restored.dom.window.close();
});
test('old flat-format games still restore after the visual update', () => {
  const ui = open(JSON.stringify({ nameA: 'أحمد', nameB: 'علي', target: 150, scoreA: 30, scoreB: 10, rounds: [{ a: 30, b: 10, note: 'قديم' }] }));
  assert.equal(ui.$('nameA').textContent, 'أحمد'); assert.equal(ui.$('scoreA').textContent, '30');
  assert.equal(ui.$('targetPoints').value, '150'); assert(ui.$('logBody').textContent.includes('قديم'));
  ui.dom.window.close();
});
test('mode profiles stay independent and solo names are rendered as text', () => {
  const ui = open(); ui.$('inputA').value = '12'; ui.$('saveRoundBtn').click();
  ui.$('modeSolo').click(); ui.$('configurePlayersBtn').click();
  ui.$('playerCount').value = '3'; ui.$('playerCount').dispatchEvent(new ui.w.Event('change'));
  ui.$('playerName0').value = 'سالم'; ui.$('playerName1').value = 'علي'; ui.$('playerName2').value = 'حمد';
  ui.$('saveSettingsBtn').click();
  assert.equal(ui.w.document.querySelectorAll('.soloInput').length, 3);
  ui.w.document.querySelector('.soloInput').value = '7'; ui.$('saveRoundBtn').click();
  const data = JSON.parse(ui.saved());
  assert.equal(data.profiles.solo.players[0].score, 7);
  data.profiles.solo.players[0].name = '<img src=x onerror=alert(1)>';
  const restored = open(JSON.stringify(data));
  assert.equal(restored.$('soloGrid').querySelector('img'), null);
  assert(restored.$('soloGrid').textContent.includes('<img'));
  restored.$('modeTeams').click(); assert.equal(restored.$('scoreA').textContent, '12');
  assert.equal(restored.$('modeTeams').getAttribute('aria-pressed'), 'true');
  ui.dom.window.close(); restored.dom.window.close();
});
test('settings goal and winner dialog still work with the shared design', () => {
  const ui = open(); ui.$('settingsBtn').click();
  assert.equal(ui.$('settingsOverlay').style.display, 'flex');
  ui.$('setNameA').value = 'فريق A'; ui.$('targetPoints').value = '20'; ui.$('saveSettingsBtn').click();
  assert.equal(ui.$('settingsOverlay').style.display, 'none');
  ui.$('inputA').value = '20'; ui.$('saveRoundBtn').click();
  assert.equal(ui.$('winnerOverlay').style.display, 'flex'); assert.equal(ui.$('winnerWho').textContent, 'فريق A');
  ui.$('winnerNewGameBtn').click(); assert.equal(ui.$('scoreA').textContent, '0');
  assert.equal(ui.$('targetPoints').value, '20'); ui.dom.window.close();
});

test('sign controls select positive or negative and rounds accumulate algebraically', () => {
  const ui = open();
  assert.equal(ui.$('modePlayers'), null);
  ui.$('inputA').value = '40'; ui.$('decA').click(); assert.equal(ui.$('inputA').value, '-40');
  ui.$('decA').click(); assert.equal(ui.$('inputA').value, '-40');
  ui.$('saveRoundBtn').click(); ui.$('inputA').value = '-60'; ui.$('incA').click();
  assert.equal(ui.$('inputA').value, '60'); ui.$('saveRoundBtn').click();
  assert.equal(ui.$('scoreA').textContent, '20');
  ui.$('modeSolo').click(); ui.$('configurePlayersBtn').click();
  ui.$('playerCount').value = '4'; ui.$('playerCount').dispatchEvent(new ui.w.Event('change'));
  ui.$('playerName3').value = 'خالد'; ui.$('saveSettingsBtn').click();
  assert.equal(ui.$('soloGrid').querySelectorAll('.soloInput').length, 4);
  assert(ui.$('soloGrid').textContent.includes('خالد'));
  let inputs = ui.$('soloGrid').querySelectorAll('.soloInput'); inputs[0].value = '40';
  ui.$('soloGrid').querySelector('.solo-dec').click(); ui.$('saveRoundBtn').click();
  inputs = ui.$('soloGrid').querySelectorAll('.soloInput'); inputs[0].value = '60'; ui.$('saveRoundBtn').click();
  assert.equal(JSON.parse(ui.saved()).profiles.solo.players[0].score, 20);
  ui.$('configurePlayersBtn').click(); assert(ui.$('playerCount').disabled);
  ui.$('playerName3').value = 'بدر'; ui.$('saveSettingsBtn').click();
  assert.equal(JSON.parse(ui.saved()).profiles.solo.players[3].name, 'بدر');
  assert.equal(JSON.parse(ui.saved()).profiles.solo.rounds.length, 2);
  const restored = open(ui.saved()); assert(restored.$('soloGrid').textContent.includes('بدر'));
  ui.dom.window.close(); restored.dom.window.close();
});
test('retired players mode migrates scores and undo history to individual without deleting old profiles', () => {
  const ui = open(); const data = JSON.parse(ui.saved()); ui.dom.window.close();
  data.mode = 'players'; data.profiles.players.nameA = 'سالم';
  data.profiles.players.scoreA = -40; data.profiles.players.scoreB = 20;
  data.profiles.players.rounds = [{a: -40, b: 20, note: 'قديم'}];
  const restored = open(JSON.stringify(data));
  const state = JSON.parse(restored.saved()); assert.equal(state.mode, 'solo');
  assert.equal(state.profiles.solo.players[0].score, -40);
  assert.equal(state.profiles.players.scoreA, -40); assert(state.profiles.legacySolo);
  assert(restored.$('logBody').textContent.includes('قديم'));
  restored.$('undoBtn').click(); assert.equal(JSON.parse(restored.saved()).profiles.solo.players[0].score, 0);
  restored.dom.window.close();
});
test('manual typing accepts Arabic, English and signed scores in both modes', () => {
  const ui = open();
  assert.equal(ui.$('inputA').type, 'text');
  ui.$('inputA').value = '−٤٠'; ui.$('inputB').value = '+20'; ui.$('saveRoundBtn').click();
  assert.equal(ui.$('scoreA').textContent, '-40'); assert.equal(ui.$('scoreB').textContent, '20');
  ui.$('inputA').value = '٦٠'; ui.$('saveRoundBtn').click(); assert.equal(ui.$('scoreA').textContent, '20');
  ui.$('modeSolo').click();
  let inputs = ui.$('soloGrid').querySelectorAll('.soloInput');
  inputs[0].value = '-۳۰'; inputs[1].value = '٤٥'; ui.$('saveRoundBtn').click();
  let state = JSON.parse(ui.saved()); assert.equal(state.profiles.solo.players[0].score, -30);
  assert.equal(state.profiles.solo.players[1].score, 45);
  inputs = ui.$('soloGrid').querySelectorAll('.soloInput'); inputs[0].value = '٢٠';
  ui.$('soloGrid').querySelector('.solo-dec').click(); assert.equal(inputs[0].value, '-20');
  ui.$('saveRoundBtn').click(); state = JSON.parse(ui.saved());
  assert.equal(state.profiles.solo.players[0].score, -50); ui.dom.window.close();
});
test('invalid typed scores never commit a partial round or arbitrary negative points', () => {
  const ui = open();
  for (const invalid of ['-', 'abc', '1.5', '100001']) {
    ui.$('inputA').value = invalid; ui.$('inputB').value = '20'; ui.$('saveRoundBtn').click();
    assert.equal(ui.$('roundCount').textContent, '0'); assert.equal(ui.$('scoreB').textContent, '0');
  }
  ui.$('inputA').value = '40'; ui.$('saveRoundBtn').click(); assert.equal(ui.$('scoreA').textContent, '40');
  ui.dom.window.close();
});
