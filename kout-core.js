/* Kout scoring is separate from Hand: only the awarded team gains points. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'qaed.kout.v1';
  const CONTRACTS = Object.freeze({
    '5': Object.freeze({ label: '٥', win: 5, loss: 10 }),
    '6': Object.freeze({ label: '٦', win: 6, loss: 12 }),
    '7': Object.freeze({ label: '٧', win: 7, loss: 14 }),
    '8': Object.freeze({ label: '٨', win: 8, loss: 16 }),
    bon: Object.freeze({ label: 'باون (٩)', win: 36, loss: 18 }),
    forced: Object.freeze({ label: 'ملزوم (٥)', win: 5, loss: 5 }),
  });
  const TEAM_IDS = ['A', 'B'];
  function initialState() {
    return { version: 1, names: { A: 'الفريق الأول', B: 'الفريق الثاني' }, rounds: [],
      draft: { team: null, contract: null, outcome: null } };
  }
  function award(team, contract, outcome) {
    if (!TEAM_IDS.includes(team) || !Object.hasOwn(CONTRACTS, contract) || !['win', 'loss'].includes(outcome))
      throw new Error('اختَر الفريق والطلب ونتيجة الجولة أولًا.');
    const recipient = outcome === 'win' ? team : (team === 'A' ? 'B' : 'A');
    const points = outcome === 'win' ? CONTRACTS[contract].win : CONTRACTS[contract].loss;
    return { recipient, points, scores: { A: recipient === 'A' ? points : 0, B: recipient === 'B' ? points : 0 } };
  }
  function totals(state) {
    return state.rounds.reduce((sum, round) => {
      const result = award(round.team, round.contract, round.outcome);
      sum[result.recipient] += result.points;
      return sum;
    }, { A: 0, B: 0 });
  }
  function winner(state) {
    const scores = totals(state);
    for (const id of TEAM_IDS) {
      if (scores[id] >= 101) return { team: id, reason: 'target', scores };
      if (scores[id] >= 51 && scores[id === 'A' ? 'B' : 'A'] === 0)
        return { team: id, reason: 'shutout', scores };
    }
    return null;
  }
  function hasDraft(state) { return Object.values(state.draft).some(value => value !== null); }
  function choose(state, field, value) {
    if (winner(state)) return state;
    const valid = field === 'team' ? TEAM_IDS.includes(value)
      : field === 'contract' ? Object.hasOwn(CONTRACTS, value)
      : field === 'outcome' ? ['win', 'loss'].includes(value) : false;
    if (!valid) throw new Error('اختيار غير صالح');
    return { ...state, draft: { ...state.draft, [field]: value } };
  }
  function preview(state) {
    try { return award(state.draft.team, state.draft.contract, state.draft.outcome); }
    catch { return null; }
  }
  function record(state, timestamp = Date.now()) {
    if (winner(state)) throw new Error('اللعبة انتهت. ابدأ لعبة جديدة أو تراجع عن آخر جولة.');
    if (!preview(state)) throw new Error('اختَر الفريق والطلب وهل فاز أو خسر، ثم اضغط تسجيل.');
    return { ...state, rounds: [...state.rounds, { ...state.draft, timestamp }],
      draft: { team: null, contract: null, outcome: null } };
  }
  function undo(state) {
    if (!state.rounds.length) return state;
    const last = state.rounds[state.rounds.length - 1];
    return { ...state, rounds: state.rounds.slice(0, -1),
      draft: { team: last.team, contract: last.contract, outcome: last.outcome } };
  }
  function newGame(state) { return { ...initialState(), names: { ...state.names } }; }
  function rename(state, a, b) {
    const clean = (name, fallback) => String(name || '').trim().slice(0, 32) || fallback;
    return { ...state, names: { A: clean(a, 'الفريق الأول'), B: clean(b, 'الفريق الثاني') } };
  }
  function restore(text) {
    if (!text) return initialState();
    const state = JSON.parse(text);
    if (!state || state.version !== 1 || !state.names ||
      TEAM_IDS.some(id => typeof state.names[id] !== 'string' || !state.names[id].trim() || state.names[id].length > 32) ||
      !Array.isArray(state.rounds) || state.rounds.length > 100 || !state.draft)
      throw new Error('الحفظ السابق غير صالح');
    const check = { ...initialState(), rounds: [] };
    for (const round of state.rounds) {
      if (winner(check) || !round || !Number.isFinite(round.timestamp)) throw new Error('سجل جولات غير صالح');
      award(round.team, round.contract, round.outcome);
      check.rounds.push(round);
    }
    for (const [field, value] of Object.entries(state.draft)) {
      if (!['team', 'contract', 'outcome'].includes(field)) throw new Error('مسودة غير صالحة');
      if (value !== null) choose(initialState(), field, value);
    }
    if (Object.keys(state.draft).length !== 3) throw new Error('مسودة غير صالحة');
    return state;
  }
  const api = { STORAGE_KEY, CONTRACTS, initialState, award, totals, winner, hasDraft,
    choose, preview, record, undo, newGame, rename, restore };
  root.KoutScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
