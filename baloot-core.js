/* Baloot: manually enter both teams' round points; stop at 152 or higher. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'qaed.baloot.v1', TARGET = 152;
  function parse(value) {
    const text = String(value ?? '').trim().replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 1776));
    if (!/^\+?\d+$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) && number >= 0 && number <= 100000 ? number : null;
  }
  function initialState() { return { version: 1, rounds: [], draft: { A: '', B: '' } }; }
  function totals(state) {
    return state.rounds.reduce((scores, round) => ({ A: scores.A + round.A, B: scores.B + round.B }), { A: 0, B: 0 });
  }
  function winner(state) {
    const scores = totals(state);
    if (Math.max(scores.A, scores.B) < TARGET) return null;
    const teams = scores.A === scores.B ? ['A', 'B'] : [scores.A > scores.B ? 'A' : 'B'];
    return { teams, tie: teams.length === 2, scores };
  }
  function hasDraft(state) { return Object.values(state.draft).some(value => String(value).trim() !== ''); }
  function edit(state, team, value) {
    if (winner(state)) return state;
    if (!['A', 'B'].includes(team)) throw new Error('الفريق غير موجود');
    return { ...state, draft: { ...state.draft, [team]: String(value) } };
  }
  function validate(state) {
    if (winner(state)) return 'انتهت اللعبة عند 152 أو أكثر. تقدر تتراجع أو تبدأ لعبة جديدة.';
    for (const team of ['A', 'B']) if (parse(state.draft[team]) === null)
      return `أدخل نقاط الفريق ${team} كعدد صحيح موجب أو صفر.`;
    return null;
  }
  function record(state, timestamp = Date.now()) {
    const error = validate(state); if (error) throw new Error(error);
    return { ...state, rounds: [...state.rounds, { A: parse(state.draft.A), B: parse(state.draft.B), timestamp }],
      draft: { A: '', B: '' } };
  }
  function undo(state) {
    if (!state.rounds.length) return state;
    const round = state.rounds[state.rounds.length - 1];
    return { ...state, rounds: state.rounds.slice(0, -1), draft: { A: String(round.A), B: String(round.B) } };
  }
  function restore(text) {
    if (!text) return initialState();
    const state = JSON.parse(text);
    if (!state || state.version !== 1 || !Array.isArray(state.rounds) || !state.draft ||
      Object.keys(state.draft).length !== 2 || typeof state.draft.A !== 'string' || typeof state.draft.B !== 'string')
      throw new Error('الحفظ السابق غير صالح');
    const check = initialState();
    for (const round of state.rounds) {
      if (winner(check) || !round || !Number.isFinite(round.timestamp) ||
        ['A', 'B'].some(team => typeof round[team] !== 'number' || parse(round[team]) === null))
        throw new Error('سجل الجولات غير صالح');
      check.rounds.push(round);
    }
    return state;
  }
  const api = { STORAGE_KEY, TARGET, parse, initialState, totals, winner, hasDraft, edit, validate, record,
    undo, newGame: initialState, restore };
  root.BalootScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
