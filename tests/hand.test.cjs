const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../hand-core.js');
const fill = (p, first = '-40') => H.edit(p, p.participants[0].id, first);

test('fresh Hand is six individual players and seven rounds, with separate team profile', () => {
  const s = H.initialState(); assert.equal(s.mode, 'individual');
  assert.equal(s.profiles.individual.participants.length, 6); assert.equal(s.profiles.individual.roundLimit, 7);
  assert.deepEqual(s.profiles.teams.participants.map(p => p.id), ['A', 'B']);
});
for (const [winning, penalty] of Object.entries(H.PENALTIES)) {
  test(`${winning} suggests +${penalty} for all five others without recording a round`, () => {
    const original = H.profile(), draft = fill(original, winning);
    assert.equal(draft.draft.p1, winning);
    for (let i = 2; i <= 6; i++) assert.equal(H.parse(draft.draft[`p${i}`]), penalty);
    assert.equal(original.draft.p1, undefined); assert.equal(draft.rounds.length, 0);
    assert.deepEqual(Object.values(H.totals(draft)), [0, 0, 0, 0, 0, 0]);
  });
}
test('enter a positive number first, then minus sets its sign and fills suggestions', () => {
  let p = H.edit(H.profile(), 'p1', '40'); p = H.sign(p, 'p1', -1);
  assert.equal(H.parse(p.draft.p1), -40); assert.equal(H.parse(p.draft.p2), 200);
  p = H.sign(p, 'p1', 1); assert.equal(H.parse(p.draft.p1), 40);
  assert.equal(p.draft.p2, ''); assert.equal(p.rounds.length, 0);
});
test('manual overrides survive updating the winning value; new round resets suggestions', () => {
  let p = fill(H.profile()); p = H.edit(p, 'p2', '73'); p = H.edit(p, 'p1', '-80');
  assert.equal(H.parse(p.draft.p2), 73); assert.equal(H.parse(p.draft.p3), 400);
  p = H.record(p, 100); assert.equal(p.rounds[0].scores.p2, 73); assert.deepEqual(p.draft, {});
  p = fill(p); assert.equal(H.parse(p.draft.p2), 200);
});
test('a manually entered score before auto-fill is preserved', () => {
  let p = H.edit(H.profile(), 'p3', '0'); p = fill(p);
  assert.equal(H.parse(p.draft.p3), 0); assert.equal(H.parse(p.draft.p2), 200);
});
test('incomplete input, non-integers and out-of-range values cannot be recorded', () => {
  for (const value of ['', '-', '+', '1.5', '1e3', 'NaN', '100001', '-100001']) {
    const p = H.edit(fill(H.profile()), 'p2', value);
    assert.throws(() => H.record(p)); assert.equal(p.rounds.length, 0);
  }
});
test('Arabic/Persian digits and unicode minus are accepted', () => {
  assert.equal(H.parse('−٤٠'), -40); assert.equal(H.parse('+۴۰۰'), 400);
  const p = fill(H.profile(), '−٨٠'); assert.equal(H.parse(p.draft.p2), 400);
});
test('teams use the same Hand mapping, and only explicit record changes totals', () => {
  const draft = H.edit(H.profile('teams'), 'B', '-160');
  assert.deepEqual(H.totals(draft), { A: 0, B: 0 });
  const saved = H.record(draft, 123);
  assert.deepEqual(H.totals(saved), { A: 800, B: -160 });
  assert.equal(H.leaders(saved)[0].id, 'B');
});
test('round seven ends play; explicitly extending allows eight and nine only', () => {
  let p = H.profile('teams');
  for (let i = 0; i < 7; i++) p = H.record(H.edit(p, 'A', '-40'));
  assert(H.completed(p)); assert.equal(H.leaders(p)[0].id, 'A');
  assert.throws(() => H.record(p)); assert.equal(H.edit(p, 'A', '-80'), p);
  p = H.extend(p); assert(!H.completed(p)); p = H.record(H.edit(p, 'B', '-80'));
  assert.equal(p.rounds.length, 8); p = H.extend(p);
  p = H.record(H.edit(p, 'A', '-240')); assert.equal(p.rounds.length, 9);
  assert(H.completed(p)); assert.throws(() => H.extend(p));
});
test('winner uses lowest accumulated total and includes tied players', () => {
  let p = H.profile('teams'); p = H.record(H.edit(p, 'A', '-40'));
  p = H.record(H.edit(p, 'B', '-40'));
  assert.deepEqual(H.totals(p), { A: 160, B: 160 });
  assert.deepEqual(H.leaders(p).map(x => x.id), ['A', 'B']);
});
test('undo restores draft for correction and does not re-record it automatically', () => {
  let p = H.profile('teams'); p = H.record({ ...H.edit(p, 'A', '-40'), note: 'جولة أولى' });
  p = H.undo(p); assert.equal(p.rounds.length, 0); assert.deepEqual(H.totals(p), { A: 0, B: 0 });
  assert.equal(H.parse(p.draft.A), -40); assert.equal(p.note, 'جولة أولى');
  p = H.record(H.edit(p, 'B', '175')); assert.deepEqual(H.totals(p), { A: -40, B: 175 });
});
test('configuration does not permit deleting players from a live game', () => {
  let p = fill(H.profile()); assert.throws(() => H.configure(p, 'individual', 3, 7, []));
  p = H.record(p); assert.throws(() => H.configure(p, 'individual', 3, 7, []));
  assert.equal(H.configure(H.newGame(p), 'individual', 3, 9, []).participants.length, 3);
});
test('new game preserves names and settings; other modes and legacy storage stay separate', () => {
  const state = H.initialState(); state.profiles.teams = H.record(H.edit(state.profiles.teams, 'A', '-40'));
  state.profiles.individual = H.newGame(H.record(fill(state.profiles.individual)));
  assert.equal(state.profiles.teams.rounds.length, 1); assert.equal(state.profiles.individual.rounds.length, 0);
  assert.notEqual(H.STORAGE_KEY, 'jinjfa_score_v1');
});
test('storage round-trip includes unsaved values and independent histories', () => {
  const state = H.initialState(); state.profiles.individual = H.edit(fill(state.profiles.individual), 'p3', '99');
  state.profiles.teams = H.record(H.edit(state.profiles.teams, 'A', '-80'));
  assert.deepEqual(H.restore(JSON.stringify(state)), state);
  assert.throws(() => H.restore('{broken')); assert.throws(() => H.restore('{"version":2}'));
});
test('all-zero round is valid when every score was entered deliberately', () => {
  let p = H.profile('teams'); p = H.edit(H.edit(p, 'A', '0'), 'B', '0');
  assert.equal(H.record(p).rounds.length, 1);
});
