/* Hand rules are independent of the page. Add other games as separate rule modules. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'qaed.hand.v1';
  const PENALTIES = Object.freeze({ '-40': 200, '-80': 400, '-160': 800, '-240': 1200 });
  const NAMES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
  const LIMIT = 100000;
  function normalize(value) {
    return String(value ?? '').trim().replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 1776)).replace(/[−–]/g, '-');
  }
  function parse(value) {
    const text = normalize(value);
    if (!/^[+-]?\d+$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) && Math.abs(number) <= LIMIT ? number : null;
  }
  function participants(mode, count = 6) {
    if (mode === 'teams') return [{ id: 'A', name: 'الفريق A' }, { id: 'B', name: 'الفريق B' }];
    if (!Number.isInteger(count) || count < 2 || count > 6) throw new Error('عدد اللاعبين من ٢ إلى ٦');
    return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `اللاعب ${NAMES[i]}` }));
  }
  function profile(mode = 'individual', count = 6) {
    return { participants: participants(mode, count), roundLimit: 7, rounds: [],
      draft: {}, note: '', autoSource: null, autoValues: {}, overrides: [] };
  }
  function initialState() {
    return { version: 1, mode: 'individual', profiles: { individual: profile(), teams: profile('teams') } };
  }
  function hasDraft(p) {
    return Object.values(p.draft).some(v => normalize(v) !== '') || p.note.trim() !== '';
  }
  function completed(p) { return p.rounds.length >= p.roundLimit; }
  function totals(p) {
    return Object.fromEntries(p.participants.map(person => [person.id,
      p.rounds.reduce((sum, round) => sum + round.scores[person.id], 0)]));
  }
  function leaders(p) {
    if (!p.rounds.length) return [];
    const scores = totals(p), lowest = Math.min(...Object.values(scores));
    return p.participants.filter(person => scores[person.id] === lowest);
  }
  function edit(p, id, value) {
    if (completed(p)) return p;
    if (!p.participants.some(person => person.id === id)) throw new Error('اللاعب غير موجود');
    const draft = { ...p.draft, [id]: normalize(value) };
    const autoValues = { ...p.autoValues };
    const overrides = new Set(p.overrides);
    let autoSource = p.autoSource;
    // User edits have priority over suggested penalties, including later changes
    // to the winning hand. New rounds clear these manual overrides.
    if (id !== autoSource) overrides.add(id);
    delete autoValues[id];
    const number = parse(value), penalty = number === null ? undefined : PENALTIES[number];
    if (penalty !== undefined) {
      autoSource = id;
      overrides.delete(id);
      for (const person of p.participants) {
        if (person.id !== id && !overrides.has(person.id)) {
          draft[person.id] = `+${penalty}`;
          autoValues[person.id] = `+${penalty}`;
        }
      }
    } else if (id === autoSource) {
      // Removing the winning hand clears only untouched suggestions, never edits.
      for (const [otherId, suggested] of Object.entries(autoValues)) {
        if (draft[otherId] === suggested && !overrides.has(otherId)) draft[otherId] = '';
      }
      for (const key of Object.keys(autoValues)) delete autoValues[key];
      autoSource = null;
    }
    return { ...p, draft, autoSource, autoValues, overrides: [...overrides] };
  }
  function sign(p, id, polarity) {
    const raw = normalize(p.draft[id]);
    const number = parse(raw);
    const next = number === null ? (polarity < 0 ? '-' : '+')
      : `${polarity < 0 ? '-' : '+'}${Math.abs(number)}`;
    return edit(p, id, next);
  }
  function validateDraft(p) {
    if (completed(p)) return 'خلصت الجولات. تقدر تمدد اللعبة أو تبدأ لعبة جديدة.';
    for (const person of p.participants) {
      if (parse(p.draft[person.id]) === null) return `أدخل رقمًا صحيحًا لـ${person.name}؛ اكتب 0 إذا ما عنده نقاط.`;
    }
    return null;
  }
  function clearDraft(p) {
    return { ...p, draft: {}, note: '', autoSource: null, autoValues: {}, overrides: [] };
  }
  function record(p, timestamp = Date.now()) {
    const error = validateDraft(p);
    if (error) throw new Error(error);
    const scores = Object.fromEntries(p.participants.map(person => [person.id, parse(p.draft[person.id])]));
    return clearDraft({ ...p, rounds: [...p.rounds,
      { scores, note: p.note.trim().slice(0, 180), timestamp }] });
  }
  function undo(p) {
    if (!p.rounds.length) return p;
    const last = p.rounds[p.rounds.length - 1];
    return { ...clearDraft(p), rounds: p.rounds.slice(0, -1),
      draft: Object.fromEntries(Object.entries(last.scores).map(([id, score]) => [id, String(score)])),
      note: last.note };
  }
  function extend(p) {
    if (p.roundLimit >= 9) throw new Error('الحد الأقصى ٩ جولات');
    return { ...p, roundLimit: p.roundLimit + 1 };
  }
  function configure(p, mode, count, limit, names) {
    if (![7, 8, 9].includes(limit) || limit < p.rounds.length) throw new Error('اختر عدد جولات بين ٧ و٩ ولا يقل عن المسجل');
    if (mode === 'individual' && count !== p.participants.length && (p.rounds.length || hasDraft(p)))
      throw new Error('ابدأ لعبة جديدة لتغيير عدد اللاعبين؛ السجل الحالي محفوظ.');
    const people = participants(mode, mode === 'teams' ? 2 : count).map((person, i) => ({
      ...person, name: String(names[i] || p.participants[i]?.name || person.name).trim().slice(0, 32) || person.name,
    }));
    return { ...p, participants: people, roundLimit: limit };
  }
  function newGame(p) { return { ...clearDraft(p), rounds: [] }; }
  function validProfile(p, mode) {
    if (!p || !Array.isArray(p.participants) || !Array.isArray(p.rounds) || ![7, 8, 9].includes(p.roundLimit)) return false;
    const expected = participants(mode, p.participants.length);
    if (p.rounds.length > p.roundLimit || p.participants.length !== expected.length) return false;
    if (p.participants.some((person, i) => person.id !== expected[i].id || typeof person.name !== 'string' || !person.name.trim() || person.name.length > 32)) return false;
    if (p.rounds.some(round => !round.scores || Object.keys(round.scores).length !== expected.length ||
      expected.some(person => typeof round.scores[person.id] !== 'number' || parse(round.scores[person.id]) === null))) return false;
    if (!p.draft || typeof p.draft !== 'object' || Array.isArray(p.draft) || typeof p.note !== 'string') return false;
    return Array.isArray(p.overrides) && p.autoValues && typeof p.autoValues === 'object';
  }
  function restore(text) {
    if (!text) return initialState();
    const state = JSON.parse(text);
    if (state.version !== 1 || !['individual', 'teams'].includes(state.mode) || !state.profiles ||
      !validProfile(state.profiles.individual, 'individual') || !validProfile(state.profiles.teams, 'teams'))
      throw new Error('تعذر قراءة اللعبة المحفوظة. ما حذفنا بياناتك السابقة.');
    return state;
  }
  const api = { STORAGE_KEY, PENALTIES, normalize, parse, profile, initialState, hasDraft,
    completed, totals, leaders, edit, sign, validateDraft, record, undo, extend, configure, newGame, restore };
  root.HandScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
