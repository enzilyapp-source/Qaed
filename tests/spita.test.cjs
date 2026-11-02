const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../spita-core.js');
const draft = (p, a, b) => S.edit(S.edit(p, p.participants[0].id, a), p.participants[1].id, b);
const play = (p, a, b) => S.record(draft(p, a, b), 1);
test('Spita defaults to positive Standard and keeps independent manual profiles', () => {
  const state = S.initialState(); assert.equal(state.profiles.individual.participants.length, 6);
  const p = S.edit(state.profiles.individual, 'p1', '-40');
  assert.equal(p.draft.p2, undefined); assert.equal(p.rounds.length, 0);
  assert.deepEqual(Object.values(S.totals(p)), [0, 0, 0, 0, 0, 0]);
  assert.throws(() => S.record(p)); assert.equal(state.profiles.teams.target, 150);
});
for (const mode of ['individual', 'teams']) {
  test(`${mode}: +150 pauses, optional +200 extension stops at +200`, () => {
    let p = play(S.profile(mode, 2), '149', '-50');
    assert(!S.completed(p)); assert(!S.canExtend(p));
    p = play(p, '1', '10'); assert(S.completed(p)); assert(S.canExtend(p));
    assert.throws(() => S.record(p)); assert.equal(S.edit(p, p.participants[0].id, '1'), p);
    p = S.extend(p); assert.equal(p.target, 200); assert(!S.completed(p));
    p = play(p, '49', '10'); assert(!S.completed(p));
    p = play(p, '1', '10'); assert(S.completed(p)); assert(!S.canExtend(p));
    assert.throws(() => S.extend(p)); assert.equal(S.leaders(p)[0].id, p.participants[1].id);
  });
  test(`${mode}: negative totals never trigger the positive end limit`, () => {
    const p = play(S.profile(mode, 2), '-200', '-150');
    assert(!S.completed(p)); assert(!S.canExtend(p));
  });
  test(`${mode}: custom +5000 stops at or above limit with no standard extension`, () => {
    let p = S.setRules(S.profile(mode, 2), 'custom', '٥٠٠٠');
    p = play(p, '150', '20'); assert(!S.completed(p));
    p = play(p, '4849', '10'); assert(!S.completed(p));
    p = play(p, '1', '0'); assert(S.completed(p)); assert(!S.canExtend(p));
    assert.throws(() => S.extend(p)); assert.equal(p.target, 5000);
    assert.equal(S.leaders(p)[0].id, p.participants[1].id);
  });
}
test('overshooting +150 permits extension only before +200 is reached', () => {
  const p = play(S.profile('teams'), '160', '100'); assert(S.canExtend(p));
  assert(!S.completed(S.extend(p)));
  const done = play(S.profile('teams'), '220', '100'); assert(S.completed(done)); assert(!S.canExtend(done));
});
test('there is no extra +10000 cap when custom target is greater', () => {
  let p = S.setRules(S.profile('teams'), 'custom', '20000');
  p = play(p, '10000', '-150'); assert(!S.completed(p));
  p = play(p, '10001', '5'); assert(S.completed(p)); assert.equal(S.totals(p).A, 20001);
});
test('there is no seven/nine-round limit', () => {
  let p = S.profile('teams');
  for (let i = 0; i < 12; i++) p = play(p, '-1', '2');
  assert.equal(p.rounds.length, 12); assert(!S.completed(p));
});
test('winner is the lowest accumulated total, including ties', () => {
  const p = play(S.profile('teams'), '100', '150'); assert.equal(S.leaders(p)[0].id, 'A');
  const tie = play(S.profile('teams'), '150', '150');
  assert.deepEqual(S.leaders(tie).map(p => p.id), ['A', 'B']); assert(S.canExtend(tie));
});
test('undo restores the round and reopens the game', () => {
  let p = play(S.profile('teams'), '149', '-100'); p = play(p, '1', '10');
  assert(S.completed(p)); p = S.undo(p); assert(!S.completed(p));
  assert.deepEqual(S.totals(p), { A: 149, B: -100 });
  assert.deepEqual(p.draft, { A: '1', B: '10' }); assert.equal(p.rounds.length, 1);
  p = S.record(p); assert(S.canExtend(p));
});
test('new game resets standard extension but retains names and custom target', () => {
  let p = S.configure(S.profile('individual', 2), 'individual', 2, 0, ['علي', 'سالم']);
  p = S.newGame(S.extend(play(p, '150', '50')));
  assert.equal(p.target, 150); assert.equal(p.rounds.length, 0);
  assert.equal(p.participants[0].name, 'علي'); assert.equal(p.participants.length, 2);
  p = S.setRules(p, 'custom', '5000'); p = S.newGame(play(p, '20', '10'));
  assert.equal(p.rule, 'custom'); assert.equal(p.target, 5000);
});
test('rules and roster cannot change after a round; invalid limits are rejected', () => {
  const p = S.edit(S.profile('individual', 2), 'p1', '20');
  assert.throws(() => S.configure(p, 'individual', 3, 0, []));
  const started = play(S.profile('teams'), '10', '20');
  assert.throws(() => S.setRules(started, 'custom', '5000'));
  for (const value of ['', '0', '-150', '1.5', 'abc', '1e3', '1000000001'])
    assert.throws(() => S.setRules(S.profile('teams'), 'custom', value));
  assert.throws(() => S.setRules(S.profile('teams'), 'other', '5000'));
});
test('manual signed input supports Arabic digits and validation', () => {
  let p = S.edit(S.profile('teams'), 'A', '٤٠'); p = S.sign(p, 'A', -1);
  assert.equal(S.parse(p.draft.A), -40); assert.equal(p.draft.B, undefined);
  p = S.edit(p, 'B', '۲۰۰'); assert.deepEqual(S.totals(S.record(p)), { A: -40, B: 200 });
  for (const text of ['', '-', '1.5', '1e3', '100001']) assert.throws(() => S.record(draft(S.profile('teams'), text, '0')));
});
test('storage round-trip preserves rules, extension and draft', () => {
  const state = S.initialState(); state.mode = 'teams';
  state.profiles.teams = S.extend(play(state.profiles.teams, '150', '50'));
  state.profiles.teams = S.edit(state.profiles.teams, 'B', '30');
  state.profiles.individual = S.setRules(state.profiles.individual, 'custom', '5000');
  assert.deepEqual(S.restore(JSON.stringify(state)), state);
});
test('old negative-target storage migrates without changing or dropping scores', () => {
  const state = S.initialState(); state.version = 1;
  for (const mode of ['individual', 'teams']) { state.profiles[mode].target = -150; delete state.profiles[mode].rule; }
  state.profiles.teams.rounds = [
    {scores: {A: -40, B: 200}, timestamp: 1, note: 'قديم'},
    {scores: {A: -40, B: 200}, timestamp: 2, note: 'قديم ٢'}
  ];
  const restored = S.restore(JSON.stringify(state));
  assert.equal(restored.version, 2); assert.equal(restored.profiles.teams.target, 150);
  assert.deepEqual(restored.profiles.teams.rounds, state.profiles.teams.rounds);
  assert.deepEqual(S.totals(restored.profiles.teams), {A: -80, B: 400});
  assert(S.completed(restored.profiles.teams));
  assert.deepEqual(S.restore(JSON.stringify(restored)), restored);
  const undone = S.undo(restored.profiles.teams); assert.equal(undone.rounds.length, 1);
  assert.equal(S.undo(undone).rounds.length, 0);
});
test('storage rejects invalid rules and extra rounds after the end', () => {
  assert.throws(() => S.restore('{bad'));
  const state = S.initialState(); state.profiles.teams = play(state.profiles.teams, '150', '20');
  state.profiles.teams.rounds.push({ scores: { A: 1, B: 1 }, note: '', timestamp: 1 });
  assert.throws(() => S.restore(JSON.stringify(state)));
  state.profiles.teams = S.profile('teams'); state.profiles.teams.rule = 'invalid';
  assert.throws(() => S.restore(JSON.stringify(state)));
});
