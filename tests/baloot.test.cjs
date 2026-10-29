const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../baloot-core.js');
const draft = (state, a, b) => B.edit(B.edit(state, 'A', a), 'B', b);
const play = (state, a, b) => B.record(draft(state, a, b), 1);
test('manual drafts do not affect sums until explicitly recorded', () => {
  const state = draft(B.initialState(), '12', '4');
  assert.deepEqual(B.totals(state), { A: 0, B: 0 }); assert.equal(state.rounds.length, 0);
  const saved = B.record(state); assert.deepEqual(B.totals(saved), { A: 12, B: 4 });
  assert.deepEqual(saved.draft, { A: '', B: '' }); assert.equal(state.rounds.length, 0);
});
for (const team of ['A', 'B']) test(`${team} reaching exactly 152 stops the game`, () => {
  let state = play(B.initialState(), team === 'A' ? 151 : 20, team === 'B' ? 151 : 20);
  assert.equal(B.winner(state), null);
  state = play(state, team === 'A' ? 1 : 3, team === 'B' ? 1 : 3);
  assert.deepEqual(B.winner(state).teams, [team]); assert.throws(() => B.record(state));
  assert.equal(B.edit(state, team, '1'), state);
});
test('crossing 152 stops too; there is no Kout 51-zero rule in Baloot', () => {
  let state = play(B.initialState(), 51, 0); assert.equal(B.winner(state), null);
  state = play(state, 100, 10); assert.equal(B.winner(state), null);
  state = play(state, 9, 0); assert.deepEqual(B.totals(state), { A: 160, B: 10 });
  assert.deepEqual(B.winner(state).teams, ['A']);
});
test('if both cross in one round the higher sum wins; equal sums are a tie', () => {
  const state = play(B.initialState(), 153, 158); assert.deepEqual(B.winner(state).teams, ['B']);
  const tie = play(B.initialState(), 152, 152); assert(B.winner(tie).tie);
  assert.deepEqual(B.winner(tie).teams, ['A', 'B']); assert.throws(() => B.record(tie));
});
test('both scores required; zero is explicit, and negatives/fractions are invalid', () => {
  for (const value of ['', '-', '-5', '1.5', '1e3', 'NaN', '100001'])
    assert.throws(() => B.record(draft(B.initialState(), value, '1')));
  assert.deepEqual(B.totals(play(B.initialState(), '0', '0')), { A: 0, B: 0 });
  assert.equal(B.parse('١٥٢'), 152); assert.equal(B.parse('۱۵۲'), 152);
});
test('undo reopens game and restores a draft without adding its scores back', () => {
  let state = play(B.initialState(), 140, 30); state = play(state, 12, 5);
  state = B.undo(state); assert.equal(B.winner(state), null);
  assert.deepEqual(B.totals(state), { A: 140, B: 30 }); assert.deepEqual(state.draft, { A: '12', B: '5' });
  state = B.record(B.edit(state, 'A', '10')); assert.deepEqual(B.totals(state), { A: 150, B: 35 });
});
test('storage preserves rounds and unsaved draft independently of other games', () => {
  const state = draft(play(B.initialState(), 20, 5), '10', '6');
  assert.deepEqual(B.restore(JSON.stringify(state)), state);
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'jinjfa_score_v1']) assert.notEqual(B.STORAGE_KEY, key);
  assert.deepEqual(B.newGame(state), B.initialState());
});
test('invalid history or recording after a winner is rejected on restore', () => {
  assert.throws(() => B.restore('{bad'));
  const state = play(B.initialState(), 152, 30); state.rounds.push({ A: 1, B: 1, timestamp: 1 });
  assert.throws(() => B.restore(JSON.stringify(state)));
  const negative = B.initialState(); negative.rounds.push({ A: -5, B: 1, timestamp: 1 });
  assert.throws(() => B.restore(JSON.stringify(negative)));
});
