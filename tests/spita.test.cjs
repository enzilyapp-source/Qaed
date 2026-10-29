const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../spita-core.js');
const draft = (p, a, b) => S.edit(S.edit(p, p.participants[0].id, a), p.participants[1].id, b);
const play = (p, a, b) => S.record(draft(p, a, b), 1);
test('Spita is manual with independent individual and team profiles', () => {
  const state = S.initialState(); assert.equal(state.profiles.individual.participants.length, 6);
  const p = S.edit(state.profiles.individual, 'p1', '-40');
  assert.equal(p.draft.p2, undefined); assert.equal(p.rounds.length, 0);
  assert.deepEqual(Object.values(S.totals(p)), [0, 0, 0, 0, 0, 0]);
  assert.throws(() => S.record(p)); assert.equal(state.profiles.teams.target, -150);
});
for (const mode of ['individual', 'teams']) {
  test(`${mode}: -150 pauses, extension is optional, -200 ends the extension`, () => {
    let p = S.profile(mode, 2); p = play(p, '-149', '50');
    assert(!S.completed(p)); assert(!S.canExtend(p));
    p = play(p, '-1', '10'); assert(S.completed(p)); assert(S.canExtend(p));
    assert.throws(() => S.record(p)); assert.equal(S.edit(p, p.participants[0].id, '1'), p);
    p = S.extend(p); assert.equal(p.target, -200); assert(!S.completed(p));
    p = play(p, '-49', '10'); assert(!S.completed(p));
    p = play(p, '-1', '10'); assert(S.completed(p)); assert(!S.canExtend(p));
    assert.throws(() => S.extend(p)); assert.equal(S.leaders(p)[0].id, p.participants[0].id);
  });
  test(`${mode}: +10000 stops even before -150`, () => {
    let p = S.profile(mode, 2); p = play(p, '-10', '9999'); assert(!S.completed(p));
    p = play(p, '-5', '1'); assert(S.completed(p));
    assert.equal(S.termination(p).reason, 'loss-limit'); assert(!S.canExtend(p));
    assert.throws(() => S.extend(p));
  });
}
test('+10000 overrides an otherwise extendable -150 in the same round', () => {
  const p = play(S.profile('teams'), '-150', '10000');
  assert.equal(S.termination(p).reason, 'loss-limit'); assert(!S.canExtend(p));
  assert.throws(() => S.extend(p)); assert.equal(S.leaders(p)[0].id, 'A');
});
test('loss threshold also applies during -200 extension, including overshoot', () => {
  let p = S.extend(play(S.profile('teams'), '-150', '9999'));
  p = play(p, '-10', '5'); assert(S.completed(p));
  assert.equal(S.termination(p).reason, 'loss-limit'); assert.equal(S.totals(p).B, 10004);
});
test('overshooting -150 permits extension only while -200 has not been reached', () => {
  const p = play(S.profile('teams'), '-160', '100'); assert(S.canExtend(p));
  assert(!S.completed(S.extend(p)));
  const done = play(S.profile('teams'), '-220', '100'); assert(S.completed(done)); assert(!S.canExtend(done));
});
test('there is no seven/nine-round limit in Spita', () => {
  let p = S.profile('teams');
  for (let i = 0; i < 12; i++) p = play(p, '-1', '2');
  assert.equal(p.rounds.length, 12); assert(!S.completed(p));
});
test('both team directions and ties use the lowest accumulated total', () => {
  const p = play(S.profile('teams'), '100', '-150'); assert.equal(S.leaders(p)[0].id, 'B');
  const tie = play(S.profile('teams'), '-150', '-150');
  assert.deepEqual(S.leaders(tie).map(p => p.id), ['A', 'B']); assert(S.canExtend(tie));
});
test('undo restores the round for correction and recalculates stopping conditions', () => {
  let p = play(S.profile('teams'), '-149', '100'); p = play(p, '-1', '9900');
  assert(S.completed(p)); p = S.undo(p); assert(!S.completed(p));
  assert.deepEqual(S.totals(p), { A: -149, B: 100 });
  assert.deepEqual(p.draft, { A: '-1', B: '9900' }); assert.equal(p.rounds.length, 1);
  p = S.record(S.edit(p, 'B', '10')); assert(S.canExtend(p));
});
test('new game resets target to -150 but preserves names and player count', () => {
  let p = S.configure(S.profile('individual', 2), 'individual', 2, 0, ['علي', 'سالم']);
  p = S.extend(play(p, '-150', '50')); p = S.newGame(p);
  assert.equal(p.target, -150); assert.equal(p.rounds.length, 0);
  assert.equal(p.participants[0].name, 'علي'); assert.equal(p.participants.length, 2);
});
test('cannot change player count while entries or rounds exist', () => {
  const p = S.edit(S.profile('individual', 2), 'p1', '20');
  assert.throws(() => S.configure(p, 'individual', 3, 0, []));
  assert.throws(() => S.configure(play(S.profile('individual', 2), '-1', '20'), 'individual', 3, 0, []));
});
test('manual input supports Arabic digits, signs and validation', () => {
  let p = S.edit(S.profile('teams'), 'A', '٤٠'); p = S.sign(p, 'A', -1);
  assert.equal(S.parse(p.draft.A), -40); assert.equal(p.draft.B, undefined);
  p = S.edit(p, 'B', '۲۰۰'); assert.deepEqual(S.totals(S.record(p)), { A: -40, B: 200 });
  for (const text of ['', '-', '1.5', '1e3', '100001']) assert.throws(() => S.record(draft(S.profile('teams'), text, '0')));
});
test('storage round-trip preserves extended game, mode histories and pending draft', () => {
  const state = S.initialState(); state.mode = 'teams';
  state.profiles.teams = S.extend(play(state.profiles.teams, '-150', '50'));
  state.profiles.teams = S.edit(state.profiles.teams, 'B', '300');
  assert.deepEqual(S.restore(JSON.stringify(state)), state);
  for (const key of ['qaed.hand.v1', 'qaed.kout.v1', 'qaed.baloot.v1', 'jinjfa_score_v1']) assert.notEqual(S.STORAGE_KEY, key);
});
test('storage rejects malformed data and rounds after a hard loss stop', () => {
  assert.throws(() => S.restore('{bad'));
  const state = S.initialState();
  state.profiles.teams = play(state.profiles.teams, '-20', '10000');
  state.profiles.teams.rounds.push({ scores: { A: -1, B: 1 }, note: '', timestamp: 1 });
  assert.throws(() => S.restore(JSON.stringify(state)));
});
