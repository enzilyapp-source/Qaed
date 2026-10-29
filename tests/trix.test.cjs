const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../trix-core.js');
function data(type) {
  if (type === 'tricks' || type === 'diamonds') return { counts: [4, 3, 3, 3] };
  if (type === 'queens') return { counts: [1, 1, 1, 1] };
  if (type === 'king') return { taker: 'p4', declared: false, declarer: null };
  return { ranks: [1, 2, 3, 4] };
}
function single(state, type, custom = data(type)) {
  return T.record(T.setData(T.select(state, type), type, custom), 1);
}
function complexDraft(state, types) {
  state = T.select(state, 'complex');
  for (const type of types) state = T.toggleComponent(state, type);
  state = T.startComplex(state);
  for (const type of types) state = T.setData(state, type, data(type));
  return state;
}
test('four fixed players have four independent kingdoms, with all five contracts open', () => {
  const state = T.initialState(); assert.equal(state.players.length, 4); assert.equal(T.currentKingdom(state), 0);
  for (let i = 0; i < 4; i++) assert.deepEqual(T.remaining(state, i), ['tricks', 'diamonds', 'queens', 'king', 'trix']);
});
test('tricks require exactly thirteen nonnegative integer counts and score -15 each', () => {
  assert.deepEqual(T.scoreComponent('tricks', { counts: [13, 0, 0, 0] }), [-195, 0, 0, 0]);
  assert.deepEqual(T.scoreComponent('tricks', { counts: ['٤', '٣', '۳', '3'] }), [-60, -45, -45, -45]);
  for (const counts of [[3, 3, 3, 3], [4, 4, 3, 3], [-1, 7, 7, 0], [1.5, 4.5, 3, 4], ['', 13, 0, 0], [13, 0, 0]])
    assert.throws(() => T.scoreComponent('tricks', { counts }));
});
test('diamonds require thirteen and score -10 each', () => {
  assert.deepEqual(T.scoreComponent('diamonds', { counts: [2, 3, 4, 4] }), [-20, -30, -40, -40]);
  assert.throws(() => T.scoreComponent('diamonds', { counts: [2, 3, 3, 4] }));
});
test('four queens total -100 and each scores -25', () => {
  assert.deepEqual(T.scoreComponent('queens', { counts: [0, 2, 1, 1] }), [0, -50, -25, -25]);
  assert.deepEqual(T.scoreComponent('queens', { counts: [4, 0, 0, 0] }), [-100, 0, 0, 0]);
  assert.throws(() => T.scoreComponent('queens', { counts: [1, 1, 1, 0] }));
  assert.throws(() => T.scoreComponent('queens', { counts: [2, 1, 1, 1] }));
});
for (const taker of T.PLAYER_IDS) {
  test(`undeclared king: only ${taker} loses 75`, () => {
    const scores = T.scoreComponent('king', { taker, declared: false, declarer: 'p1' });
    assert.equal(scores[T.PLAYER_IDS.indexOf(taker)], -75); assert.equal(scores.reduce((a, b) => a + b, 0), -75);
  });
}
test('declared king subtracts 150 from the taker and adds 75 to announcer', () => {
  assert.deepEqual(T.scoreComponent('king', { taker: 'p2', declared: true, declarer: 'p1' }), [75, -150, 0, 0]);
  assert.throws(() => T.scoreComponent('king', { taker: 'p2', declared: true, declarer: null }));
  assert.throws(() => T.scoreComponent('king', { taker: null, declared: false, declarer: null }));
});
test('a declared king taken by its announcer combines both operations to net -75', () => {
  assert.deepEqual(T.scoreComponent('king', { taker: 'p3', declared: true, declarer: 'p3' }), [0, 0, -75, 0]);
});
test('trix ranks are unique 1–4 and award 200/150/100/50', () => {
  assert.deepEqual(T.scoreComponent('trix', { ranks: [3, 4, 2, 1] }), [100, 50, 150, 200]);
  for (const ranks of [[1, 1, 3, 4], [1, 2, 3, null], [0, 1, 2, 3], [1, 2, 3], [1, 2, 3, 5]])
    assert.throws(() => T.scoreComponent('trix', { ranks }));
});
test('rank UI helper swaps used places instead of creating duplicate ranks', () => {
  let state = T.select(T.initialState(), 'trix'); state = T.setData(state, 'trix', { ranks: [1, 2, 3, 4] });
  state = T.setRank(state, 0, 2); assert.deepEqual(state.draft.data.trix.ranks, [2, 1, 3, 4]);
  state = T.setRank(state, 0, 2); assert.deepEqual(state.draft.data.trix.ranks, [null, 1, 3, 4]);
  assert(T.validateDraft(state));
});
test('counter edits and complete previews never consume a contract before record', () => {
  const original = T.initialState();
  const draft = T.setData(T.select(original, 'tricks'), 'tricks', data('tricks'));
  assert.deepEqual(T.preview(draft), [-60, -45, -45, -45]);
  assert.equal(draft.rounds.length, 0); assert.deepEqual(T.totals(draft), [0, 0, 0, 0]);
  assert.equal(T.used(draft, 0).length, 0); assert.equal(original.draft.selection, null);
  const saved = T.record(draft); assert.deepEqual(T.used(saved, 0), ['tricks']);
  assert.throws(() => T.select(saved, 'tricks')); assert.throws(() => T.record(saved));
});
test('incomplete input does not create a partial record or close any type', () => {
  const state = T.select(T.initialState(), 'tricks'); assert.throws(() => T.record(state));
  assert.equal(T.used(state, 0).length, 0); assert.equal(state.rounds.length, 0);
});
for (const types of [['queens', 'king'], ['tricks', 'diamonds', 'queens'], ['tricks', 'diamonds', 'queens', 'king']])
  test(`complex supports exactly the selected ${types.length} available components`, () => {
    const draft = complexDraft(T.initialState(), types);
    const expected = types.reduce((sum, type) => T.scoreComponent(type, data(type)).map((n, i) => sum[i] + n), [0, 0, 0, 0]);
    assert.deepEqual(T.preview(draft), expected); assert.equal(T.used(draft, 0).length, 0);
    const state = T.record(draft); assert.deepEqual(T.used(state, 0), types);
    assert.deepEqual(T.totals(state), expected); assert.equal(state.rounds.length, 1);
    for (const type of types) assert.deepEqual(T.componentScores(state, 0, type), T.scoreComponent(type, data(type)));
    assert.equal(T.remaining(state, 1).length, 5);
  });
test('complex cannot include trix, a closed type, or only one component', () => {
  let state = T.select(T.initialState(), 'complex');
  assert.throws(() => T.toggleComponent(state, 'trix'));
  state = T.toggleComponent(state, 'king'); assert.throws(() => T.startComplex(state));
  const closed = single(T.initialState(), 'king');
  assert.throws(() => T.toggleComponent(T.select(closed, 'complex'), 'king'));
});
test('complex start is explicit; changing its types requires starting again', () => {
  let state = complexDraft(T.initialState(), ['queens', 'king']);
  state = T.toggleComponent(state, 'diamonds'); assert(!state.draft.complexStarted);
  assert.throws(() => T.record(state)); assert.throws(() => T.setData(state, 'king', data('king')));
  state = T.startComplex(state); state = T.setData(state, 'diamonds', data('diamonds'));
  assert.equal(T.validateDraft(state), null);
});
test('a bad component prevents the entire complex, with no partial scoring', () => {
  let state = complexDraft(T.initialState(), ['queens', 'king']);
  state = T.setData(state, 'queens', { counts: [0, 0, 0, 0] });
  assert.throws(() => T.record(state)); assert.deepEqual(T.totals(state), [0, 0, 0, 0]);
  assert.equal(T.used(state, 0).length, 0);
});
test('two separate complexes can consume the remaining negative games in a kingdom', () => {
  let state = T.record(complexDraft(T.initialState(), ['queens', 'king']));
  state = T.record(complexDraft(state, ['tricks', 'diamonds']));
  assert.deepEqual(T.remaining(state), ['trix']); assert.throws(() => T.select(state, 'complex'));
  state = single(state, 'trix'); assert.equal(T.currentKingdom(state), 1); assert.equal(T.remaining(state).length, 5);
});
test('complete four kingdoms use twenty independent contracts and highest total wins', () => {
  let state = T.initialState();
  for (let kingdom = 0; kingdom < 4; kingdom++) {
    assert.equal(T.currentKingdom(state), kingdom);
    for (const type of T.TYPES) state = single(state, type);
    assert.deepEqual(T.kingdomScores(state, kingdom), [75, 50, 0, -125]);
  }
  assert(T.completed(state)); assert.equal(state.rounds.length, 20);
  assert.deepEqual(T.totals(state), [300, 200, 0, -500]); assert.equal(T.leaders(state)[0].id, 'p1');
  assert.throws(() => T.select(state, 'trix')); assert.throws(() => T.record(state));
});
test('equal final totals return all tied winners', () => {
  let state = T.initialState();
  for (let k = 0; k < 4; k++) {
    const counts = [3, 3, 3, 3]; counts[k]++;
    state = single(state, 'tricks', { counts }); state = single(state, 'diamonds', { counts });
    state = single(state, 'queens'); state = single(state, 'king', { taker: T.PLAYER_IDS[k], declared: false, declarer: null });
    state = single(state, 'trix', { ranks: Array.from({ length: 4 }, (_, i) => (i + k) % 4 + 1) });
  }
  assert.deepEqual(T.totals(state), [0, 0, 0, 0]); assert.equal(T.leaders(state).length, 4);
});
test('undo reopens a whole complex and restores its data for explicit correction', () => {
  const initial = T.initialState(); let state = T.record(complexDraft(initial, ['queens', 'king']));
  state = T.undo(state); assert.deepEqual(T.used(state, 0), []); assert.deepEqual(T.totals(state), [0, 0, 0, 0]);
  assert.equal(state.draft.selection, 'complex'); assert(state.draft.complexStarted);
  assert.equal(T.validateDraft(state), null); assert.equal(state.rounds.length, 0);
});
test('undo across a kingdom boundary returns to its previous owner', () => {
  let state = T.initialState(); for (const type of T.TYPES) state = single(state, type);
  assert.equal(T.currentKingdom(state), 1); state = T.undo(state);
  assert.equal(T.currentKingdom(state), 0); assert.deepEqual(T.remaining(state), ['trix']);
});
test('storage preserves a complex draft and kingdoms, with a separate key', () => {
  let state = single(T.initialState(), 'tricks'); state = complexDraft(state, ['queens', 'king']);
  assert.deepEqual(T.restore(JSON.stringify(state)), state);
  for (const key of ['qaed.hand.v1', 'qaed.spita.v1', 'qaed.kout.v1', 'qaed.baloot.v1']) assert.notEqual(T.STORAGE_KEY, key);
});
test('storage refuses replayed games, invalid totals and wrong kingdom order', () => {
  const state = single(T.initialState(), 'tricks');
  const replay = structuredClone(state); replay.rounds.push(structuredClone(replay.rounds[0]));
  assert.throws(() => T.restore(JSON.stringify(replay)));
  const wrong = structuredClone(state); wrong.rounds[0].kingdom = 1;
  assert.throws(() => T.restore(JSON.stringify(wrong)));
  const badCount = structuredClone(state); badCount.rounds[0].data.tricks.counts[0] = 3;
  assert.throws(() => T.restore(JSON.stringify(badCount)));
  assert.throws(() => T.restore('{broken'));
});
test('new game preserves four names and resets every kingdom', () => {
  const state = single(T.rename(T.initialState(), ['علي', 'سالم', 'خالد', 'محمد']), 'king');
  const reset = T.newGame(state); assert.equal(reset.players[0].name, 'علي');
  assert.equal(reset.rounds.length, 0); assert.equal(T.currentKingdom(reset), 0); assert.equal(reset.players.length, 4);
});
