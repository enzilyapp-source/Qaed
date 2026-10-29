/* Spita shares numeric input helpers with Hand, but has manual scores and no round cap. */
(function (root) {
  'use strict';
  const H = root.HandScore || (typeof require === 'function' ? require('./hand-core.js') : null);
  const STORAGE_KEY = 'qaed.spita.v1', LOSS_LIMIT = 10000;
  function profile(mode = 'individual', count = 6) {
    return { participants: H.profile(mode, count).participants, target: -150,
      rounds: [], draft: {}, note: '' };
  }
  function initialState() {
    return { version: 1, mode: 'individual', profiles: { individual: profile(), teams: profile('teams') } };
  }
  const totals = H.totals, leaders = H.leaders, parse = H.parse, normalize = H.normalize;
  function termination(p) {
    if (!p.rounds.length) return null;
    const scores = totals(p);
    const hitLoss = p.participants.filter(person => scores[person.id] >= LOSS_LIMIT);
    // The +10000 limit always takes precedence, including during an extension.
    if (hitLoss.length) return { reason: 'loss-limit', scores, hitLoss };
    if (Math.min(...Object.values(scores)) <= p.target) return { reason: 'winning-target', scores, hitLoss: [] };
    return null;
  }
  const completed = p => Boolean(termination(p));
  function canExtend(p) {
    const end = termination(p);
    return Boolean(end && end.reason === 'winning-target' && p.target === -150 &&
      Math.min(...Object.values(end.scores)) > -200);
  }
  function hasDraft(p) { return Object.values(p.draft).some(value => normalize(value) !== '') || p.note.trim() !== ''; }
  function edit(p, id, value) {
    if (completed(p)) return p;
    if (!p.participants.some(person => person.id === id)) throw new Error('اللاعب غير موجود');
    return { ...p, draft: { ...p.draft, [id]: normalize(value) } };
  }
  function sign(p, id, polarity) {
    const number = parse(p.draft[id]);
    return edit(p, id, number === null ? (polarity < 0 ? '-' : '+')
      : `${polarity < 0 ? '-' : '+'}${Math.abs(number)}`);
  }
  function validateDraft(p) {
    if (completed(p)) return 'اللعبة متوقفة. تقدر تختار التمديد إلى −200 إذا الخيار متاح، أو تبدأ لعبة جديدة.';
    for (const person of p.participants)
      if (parse(p.draft[person.id]) === null) return `أدخل رقمًا صحيحًا لـ${person.name}؛ اكتب 0 إذا ما عنده نقاط.`;
    return null;
  }
  function record(p, timestamp = Date.now()) {
    const error = validateDraft(p); if (error) throw new Error(error);
    return { ...p, rounds: [...p.rounds, { timestamp, note: p.note.trim().slice(0, 180),
      scores: Object.fromEntries(p.participants.map(person => [person.id, parse(p.draft[person.id])])) }],
      draft: {}, note: '' };
  }
  function extend(p) {
    if (!canExtend(p)) throw new Error('التمديد متاح عند −150 فقط، ما دام ما أحد وصل +10000 أو −200.');
    return { ...p, target: -200 };
  }
  function undo(p) {
    if (!p.rounds.length) return p;
    const last = p.rounds[p.rounds.length - 1];
    return { ...p, rounds: p.rounds.slice(0, -1), note: last.note,
      draft: Object.fromEntries(Object.entries(last.scores).map(([id, score]) => [id, String(score)])) };
  }
  function newGame(p) { return { ...p, target: -150, rounds: [], draft: {}, note: '' }; }
  // The shared score page supplies a round-limit argument for Hand. Spita ignores
  // it deliberately: its stopping condition is the score, never seven/nine rounds.
  function configure(p, mode, count, _unusedRoundLimit, names) {
    if (mode === 'individual' && count !== p.participants.length && (p.rounds.length || hasDraft(p)))
      throw new Error('ابدأ لعبة جديدة لتغيير عدد اللاعبين؛ السجل الحالي محفوظ.');
    const people = profile(mode, mode === 'teams' ? 2 : count).participants.map((person, i) => ({
      ...person, name: String(names[i] || p.participants[i]?.name || person.name).trim().slice(0, 32) || person.name,
    }));
    return { ...p, participants: people };
  }
  function validProfile(p, mode) {
    if (!p || ![-150, -200].includes(p.target) || !Array.isArray(p.participants) || !Array.isArray(p.rounds) ||
      !p.draft || Array.isArray(p.draft) || typeof p.draft !== 'object' || typeof p.note !== 'string') return false;
    const expected = profile(mode, p.participants.length).participants;
    if (p.participants.length !== expected.length || p.participants.some((person, i) =>
      person.id !== expected[i].id || typeof person.name !== 'string' || !person.name.trim() || person.name.length > 32)) return false;
    const check = { ...p, rounds: [] };
    for (const round of p.rounds) {
      if (completed(check) || !round || !Number.isFinite(round.timestamp) || typeof round.note !== 'string' ||
        !round.scores || Object.keys(round.scores).length !== expected.length || expected.some(person =>
          typeof round.scores[person.id] !== 'number' || parse(round.scores[person.id]) === null)) return false;
      check.rounds.push(round);
    }
    return Object.entries(p.draft).every(([id, value]) => expected.some(person => person.id === id) && typeof value === 'string');
  }
  function restore(text) {
    if (!text) return initialState();
    const state = JSON.parse(text);
    if (!state || state.version !== 1 || !['individual', 'teams'].includes(state.mode) || !state.profiles ||
      !validProfile(state.profiles.individual, 'individual') || !validProfile(state.profiles.teams, 'teams'))
      throw new Error('الحفظ السابق للسبيتة غير صالح');
    return state;
  }
  const api = { KIND: 'spita', STORAGE_KEY, LOSS_LIMIT, profile, initialState, totals, leaders, parse, normalize,
    termination, completed, canExtend, hasDraft, edit, sign, validateDraft, record, extend, undo, newGame, configure, restore };
  root.SpitaScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
