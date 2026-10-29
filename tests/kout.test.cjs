const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../kout-core.js');
function select(state, team, contract, outcome) {
  return K.choose(K.choose(K.choose(state, 'team', team), 'contract', contract), 'outcome', outcome);
}
function play(state, team, contract, outcome = 'win') { return K.record(select(state, team, contract, outcome), 123); }
const cases = [['5', 5, 10], ['6', 6, 12], ['7', 7, 14], ['8', 8, 16], ['bon', 36, 18], ['forced', 5, 5]];
for (const [contract, winPoints, lossPoints] of cases)
  for (const team of ['A', 'B'])
    for (const outcome of ['win', 'loss'])
      test(`${team} ${contract} ${outcome}: only the correct side receives points`, () => {
        const other = team === 'A' ? 'B' : 'A', recipient = outcome === 'win' ? team : other;
        const points = outcome === 'win' ? winPoints : lossPoints;
        const draft = select(K.initialState(), team, contract, outcome);
        assert.deepEqual(K.totals(draft), { A: 0, B: 0 });
        assert.equal(draft.rounds.length, 0);
        const state = K.record(draft);
        assert.equal(K.totals(state)[recipient], points);
        assert.equal(K.totals(state)[recipient === 'A' ? 'B' : 'A'], 0);
      });
test('incomplete selections cannot record a round', () => {
  let state = K.initialState(); assert.throws(() => K.record(state));
  state = K.choose(state, 'team', 'A'); assert.throws(() => K.record(state));
  state = K.choose(state, 'contract', 'bon'); assert.throws(() => K.record(state));
  assert.equal(state.rounds.length, 0);
});
test('forced five loss differs from an ordinary five loss', () => {
  assert.deepEqual(K.totals(play(K.initialState(), 'A', '5', 'loss')), { A: 0, B: 10 });
  assert.deepEqual(K.totals(play(K.initialState(), 'A', 'forced', 'loss')), { A: 0, B: 5 });
});
test('exactly 101 finishes even with a nonzero opponent', () => {
  let state = play(K.initialState(), 'B', 'forced');
  for (const bid of ['bon', 'bon', '7', '7', '7']) state = play(state, 'A', bid);
  assert.equal(K.totals(state).A, 93); assert.equal(K.winner(state), null);
  state = play(state, 'A', '8');
  assert.equal(K.winner(state).team, 'A'); assert.equal(K.winner(state).reason, 'target');
  assert.deepEqual(K.totals(state), { A: 101, B: 5 });
});
test('crossing 101 also finishes; 100 versus nonzero does not', () => {
  let state = play(K.initialState(), 'B', 'forced');
  for (let i = 0; i < 20; i++) state = play(state, 'A', '5');
  assert.equal(K.winner(state), null); assert.equal(K.totals(state).A, 100);
  state = play(state, 'A', '6'); assert.equal(K.winner(state).team, 'A');
  assert.equal(K.totals(state).A, 106);
});
for (const team of ['A', 'B']) {
  test(`${team}: exactly 51 versus zero wins and prevents further recording`, () => {
    let state = K.initialState();
    for (const bid of ['bon', '5', '5']) state = play(state, team, bid);
    assert.equal(K.winner(state), null); state = play(state, team, '5');
    assert.equal(K.totals(state)[team], 51); assert.equal(K.winner(state).team, team);
    assert.equal(K.winner(state).reason, 'shutout');
    assert.throws(() => K.record(state)); assert.equal(K.choose(state, 'team', team), state);
  });
}
test('50 versus zero does not finish, but crossing 51 does', () => {
  let state = K.initialState();
  for (let i = 0; i < 10; i++) state = play(state, 'A', '5');
  assert.equal(K.totals(state).A, 50); assert.equal(K.winner(state), null);
  state = play(state, 'A', '5'); assert.equal(K.winner(state).reason, 'shutout');
});
test('51+ does not activate shutout when the other team has any points', () => {
  let state = play(K.initialState(), 'B', '5');
  for (const bid of ['bon', '5', '5', '5']) state = play(state, 'A', bid);
  assert.deepEqual(K.totals(state), { A: 51, B: 5 }); assert.equal(K.winner(state), null);
});
test('undo removes points, restores draft, and reopens a finished game', () => {
  let state = K.initialState();
  for (const bid of ['bon', '5', '5', '5']) state = play(state, 'A', bid);
  state = K.undo(state); assert.equal(K.winner(state), null); assert.equal(K.totals(state).A, 46);
  assert.deepEqual(state.draft, { team: 'A', contract: '5', outcome: 'win' });
  assert.equal(state.rounds.length, 3); state = K.record(K.choose(state, 'outcome', 'loss'));
  assert.deepEqual(K.totals(state), { A: 46, B: 10 });
});
test('new game resets only Kout history/draft while retaining names', () => {
  let state = K.rename(K.initialState(), 'ربعنا', 'ربعهم');
  state = play(state, 'A', 'bon'); state = K.newGame(state);
  assert.deepEqual(state.names, { A: 'ربعنا', B: 'ربعهم' });
  assert.equal(state.rounds.length, 0); assert.deepEqual(K.totals(state), { A: 0, B: 0 });
  assert.notEqual(K.STORAGE_KEY, 'qaed.hand.v1'); assert.notEqual(K.STORAGE_KEY, 'jinjfa_score_v1');
});
test('storage round-trip preserves history and pending selections', () => {
  let state = play(K.initialState(), 'B', '7', 'loss'); state = K.choose(state, 'contract', 'forced');
  assert.deepEqual(K.restore(JSON.stringify(state)), state);
  assert.throws(() => K.restore('{bad')); assert.throws(() => K.restore('{"version":2}'));
});
test('storage refuses invalid contracts and rounds recorded after a winner', () => {
  const bad = K.initialState(); bad.rounds.push({ team: 'A', contract: 'unknown', outcome: 'win', timestamp: 1 });
  assert.throws(() => K.restore(JSON.stringify(bad)));
  let done = K.initialState(); for (const bid of ['bon', '5', '5', '5']) done = play(done, 'A', bid);
  done.rounds.push({ team: 'A', contract: '5', outcome: 'win', timestamp: 1 });
  assert.throws(() => K.restore(JSON.stringify(done)));
});
