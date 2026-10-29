/* Four kingdoms, one per player. Contracts close only through a validated record. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'qaed.trix.v1';
  const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'];
  const TYPES = ['tricks', 'diamonds', 'queens', 'king', 'trix'];
  const NEGATIVE = ['tricks', 'diamonds', 'queens', 'king'];
  const LABELS = Object.freeze({ tricks: 'أكلات', diamonds: 'ديامن', queens: 'ميمات', king: 'باش', trix: 'تركس', complex: 'كومبلكس' });
  const COUNTERS = Object.freeze({ tricks: { count: 13, unit: -15 }, diamonds: { count: 13, unit: -10 }, queens: { count: 4, unit: -25 } });
  const RANK_POINTS = [200, 150, 100, 50];
  const copy = value => JSON.parse(JSON.stringify(value));
  function readCount(value) {
    const text = String(value ?? '').trim().replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 1776));
    return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
  }
  function blankData() {
    return { tricks: { counts: [0, 0, 0, 0] }, diamonds: { counts: [0, 0, 0, 0] },
      queens: { counts: [0, 0, 0, 0] }, king: { taker: null, declared: false, declarer: null },
      trix: { ranks: [null, null, null, null] } };
  }
  function emptyDraft() { return { selection: null, components: [], complexStarted: false, data: blankData() }; }
  function initialState() {
    return { version: 1, players: PLAYER_IDS.map((id, i) => ({ id, name: ['اللاعب الأول', 'اللاعب الثاني', 'اللاعب الثالث', 'اللاعب الرابع'][i] })),
      rounds: [], draft: emptyDraft() };
  }
  function used(state, kingdom) {
    return [...new Set(state.rounds.filter(round => round.kingdom === kingdom).flatMap(round => round.types))];
  }
  function currentKingdom(state) {
    for (let k = 0; k < 4; k++) if (used(state, k).length < 5) return k;
    return 4;
  }
  const completed = state => currentKingdom(state) === 4;
  function remaining(state, kingdom = currentKingdom(state)) {
    if (kingdom < 0 || kingdom > 3) return [];
    const closed = used(state, kingdom); return TYPES.filter(type => !closed.includes(type));
  }
  function draftTypes(state) {
    return state.draft.selection === 'complex' ? [...state.draft.components]
      : TYPES.includes(state.draft.selection) ? [state.draft.selection] : [];
  }
  function hasDraft(state) { return state.draft.selection !== null; }
  function select(state, selection) {
    if (completed(state)) throw new Error('اكتملت الممالك الأربع.');
    if (selection === state.draft.selection) return state;
    const available = remaining(state);
    if (selection === 'complex') {
      if (available.filter(type => NEGATIVE.includes(type)).length < 2) throw new Error('الكومبلكس يحتاج نوعين متاحين على الأقل، غير التركس.');
    } else if (!available.includes(selection)) throw new Error('هالنوع مسجّل أو غير متاح في المملكة الحالية.');
    return { ...state, draft: { ...state.draft, selection, complexStarted: false,
      components: state.draft.components.filter(type => available.includes(type) && NEGATIVE.includes(type)) } };
  }
  function clearSelection(state) { return { ...state, draft: emptyDraft() }; }
  function toggleComponent(state, type) {
    if (completed(state) || state.draft.selection !== 'complex' || !NEGATIVE.includes(type) || !remaining(state).includes(type))
      throw new Error('اختَر نوعًا متاحًا للكومبلكس؛ التركس ما تدخل معاه.');
    const components = state.draft.components.includes(type) ? state.draft.components.filter(item => item !== type)
      : [...state.draft.components, type];
    return { ...state, draft: { ...state.draft, components, complexStarted: false } };
  }
  function startComplex(state) {
    if (completed(state) || state.draft.selection !== 'complex' || state.draft.components.length < 2 ||
      state.draft.components.some(type => !NEGATIVE.includes(type) || !remaining(state).includes(type)))
      throw new Error('اختَر لعبتين أو أكثر من المتاح، بدون التركس.');
    return { ...state, draft: { ...state.draft, complexStarted: true } };
  }
  function setData(state, type, patch) {
    if (completed(state) || !draftTypes(state).includes(type) ||
      (state.draft.selection === 'complex' && !state.draft.complexStarted)) throw new Error('ابدأ نوع اللعب أولًا.');
    const data = { ...state.draft.data, [type]: { ...state.draft.data[type], ...copy(patch) } };
    return { ...state, draft: { ...state.draft, data } };
  }
  function setRank(state, index, rank) {
    if (!Number.isInteger(index) || index < 0 || index > 3 || ![1, 2, 3, 4].includes(rank)) throw new Error('ترتيب غير صالح');
    const ranks = [...state.draft.data.trix.ranks], previous = ranks[index], other = ranks.indexOf(rank);
    if (previous === rank) ranks[index] = null;
    else { if (other !== -1) ranks[other] = previous; ranks[index] = rank; }
    return setData(state, 'trix', { ranks });
  }
  function scoreComponent(type, data) {
    if (!TYPES.includes(type) || !data || typeof data !== 'object') throw new Error('بيانات نوع اللعب غير صالحة.');
    if (Object.hasOwn(COUNTERS, type)) {
      const rule = COUNTERS[type];
      if (!Array.isArray(data.counts) || data.counts.length !== 4) throw new Error('يلزم إدخال أعداد اللاعبين الأربعة.');
      const counts = data.counts.map(readCount);
      if (counts.some(n => n === null || n < 0 || n > rule.count)) throw new Error(`${LABELS[type]}: أدخل أعدادًا صحيحة من 0 إلى ${rule.count}، بدون ماينس.`);
      if (counts.reduce((sum, n) => sum + n, 0) !== rule.count)
        throw new Error(`${LABELS[type]}: لازم مجموع العدد يكون ${rule.count}.`);
      return counts.map(n => n === 0 ? 0 : n * rule.unit);
    }
    if (type === 'king') {
      if (!PLAYER_IDS.includes(data.taker)) throw new Error('الباش: اختَر منو أكلها.');
      if (typeof data.declared !== 'boolean') throw new Error('الباش: حدّد إذا كانت معلنة.');
      if (data.declared && !PLAYER_IDS.includes(data.declarer)) throw new Error('الباش المعلن: اختَر منو أعلنها.');
      const scores = [0, 0, 0, 0];
      scores[PLAYER_IDS.indexOf(data.taker)] -= data.declared ? 150 : 75;
      if (data.declared) scores[PLAYER_IDS.indexOf(data.declarer)] += 75;
      return scores;
    }
    if (!Array.isArray(data.ranks) || data.ranks.length !== 4 ||
      data.ranks.some(rank => ![1, 2, 3, 4].includes(rank)) || new Set(data.ranks).size !== 4)
      throw new Error('التركس: وزّع المراكز من الأول للرابع، كل مركز للاعب واحد.');
    return data.ranks.map(rank => RANK_POINTS[rank - 1]);
  }
  function typesError(state) {
    if (completed(state)) return 'اكتملت الممالك الأربع.';
    const types = draftTypes(state), available = remaining(state);
    if (!types.length) return 'اختَر نوع اللعب.';
    if (types.some(type => !available.includes(type)) || new Set(types).size !== types.length) return 'بعض الأنواع مسجلة بالفعل.';
    if (state.draft.selection === 'complex' && (types.length < 2 || types.some(type => !NEGATIVE.includes(type))))
      return 'الكومبلكس يحتاج نوعين أو أكثر، بدون التركس.';
    if (state.draft.selection === 'complex' && !state.draft.complexStarted) return 'اضغط ابدأ الكومبلكس أولًا.';
    return null;
  }
  function validateDraft(state) {
    const error = typesError(state); if (error) return error;
    try { for (const type of draftTypes(state)) scoreComponent(type, state.draft.data[type]); return null; }
    catch (error) { return error.message; }
  }
  function preview(state) {
    if (validateDraft(state)) return null;
    return draftTypes(state).reduce((scores, type) => scoreComponent(type, state.draft.data[type])
      .map((value, i) => scores[i] + value), [0, 0, 0, 0]);
  }
  function record(state, timestamp = Date.now()) {
    const error = validateDraft(state); if (error) throw new Error(error);
    const types = draftTypes(state), data = {};
    for (const type of types) {
      data[type] = copy(state.draft.data[type]);
      if (COUNTERS[type]) data[type].counts = data[type].counts.map(readCount);
      if (type === 'king' && !data[type].declared) data[type].declarer = null;
    }
    return { ...state, rounds: [...state.rounds, { kingdom: currentKingdom(state), selection: state.draft.selection,
      types, data, timestamp }], draft: emptyDraft() };
  }
  function componentRound(state, kingdom, type) { return state.rounds.find(round => round.kingdom === kingdom && round.types.includes(type)) || null; }
  function componentScores(state, kingdom, type) {
    const round = componentRound(state, kingdom, type); return round ? scoreComponent(type, round.data[type]) : null;
  }
  function addRound(scores, round) {
    return round.types.reduce((sum, type) => scoreComponent(type, round.data[type]).map((n, i) => sum[i] + n), scores);
  }
  function totals(state) { return state.rounds.reduce(addRound, [0, 0, 0, 0]); }
  function kingdomScores(state, kingdom) { return state.rounds.filter(round => round.kingdom === kingdom).reduce(addRound, [0, 0, 0, 0]); }
  function leaders(state) {
    if (!completed(state)) return [];
    const scores = totals(state), highest = Math.max(...scores);
    return state.players.filter((_player, i) => scores[i] === highest);
  }
  function undo(state) {
    if (!state.rounds.length) return state;
    const last = state.rounds[state.rounds.length - 1], data = blankData();
    for (const type of last.types) data[type] = copy(last.data[type]);
    return { ...state, rounds: state.rounds.slice(0, -1), draft: { selection: last.selection,
      components: last.selection === 'complex' ? [...last.types] : [], complexStarted: last.selection === 'complex', data } };
  }
  function rename(state, names) {
    if (!Array.isArray(names) || names.length !== 4) throw new Error('التركس تحتاج أربعة لاعبين.');
    return { ...state, players: state.players.map((player, i) => ({ ...player,
      name: String(names[i] || '').trim().slice(0, 32) || player.name })) };
  }
  function newGame(state) { return { ...initialState(), players: copy(state.players) }; }
  function restore(text) {
    if (!text) return initialState();
    const state = JSON.parse(text);
    if (!state || state.version !== 1 || !Array.isArray(state.players) || state.players.length !== 4 ||
      state.players.some((player, i) => player.id !== PLAYER_IDS[i] || typeof player.name !== 'string' || !player.name.trim() || player.name.length > 32) ||
      !Array.isArray(state.rounds) || state.rounds.length > 20 || !state.draft)
      throw new Error('حفظ التركس غير صالح');
    let check = { ...initialState(), players: state.players };
    for (const round of state.rounds) {
      if (!round || round.kingdom !== currentKingdom(check) || !Number.isFinite(round.timestamp) ||
        !Array.isArray(round.types) || !round.data) throw new Error('سجل الممالك غير صالح');
      let trial = select(check, round.selection);
      if (round.selection === 'complex') {
        for (const type of round.types) trial = toggleComponent(trial, type);
        trial = startComplex(trial);
      } else if (round.types.length !== 1 || round.types[0] !== round.selection) throw new Error('أنواع الجولة غير صالحة');
      if (new Set(round.types).size !== round.types.length) throw new Error('نوع مكرر في الكومبلكس');
      for (const type of round.types) trial = setData(trial, type, round.data[type]);
      check = record(trial, round.timestamp);
    }
    const d = state.draft;
    if (!Array.isArray(d.components) || new Set(d.components).size !== d.components.length ||
      d.components.some(type => !NEGATIVE.includes(type)) || typeof d.complexStarted !== 'boolean' || !d.data ||
      TYPES.some(type => !d.data[type] || typeof d.data[type] !== 'object') ||
      Object.keys(COUNTERS).some(type => !Array.isArray(d.data[type].counts) || d.data[type].counts.length !== 4) ||
      !Array.isArray(d.data.trix.ranks) || d.data.trix.ranks.length !== 4 || typeof d.data.king.declared !== 'boolean')
      throw new Error('مسودة التركس غير صالحة');
    if (d.selection !== null) {
      const available = remaining(check);
      if (d.selection === 'complex') {
        if (available.filter(type => NEGATIVE.includes(type)).length < 2 || d.components.some(type => !available.includes(type)) ||
          (d.complexStarted && d.components.length < 2)) throw new Error('الكومبلكس المحفوظ غير صالح');
      } else if (!available.includes(d.selection)) throw new Error('نوع المسودة مسجّل بالفعل');
    }
    return { ...check, draft: copy(d) };
  }
  const api = { STORAGE_KEY, PLAYER_IDS, TYPES, NEGATIVE, LABELS, COUNTERS, RANK_POINTS, readCount,
    initialState, blankData, used, currentKingdom, completed, remaining, draftTypes, hasDraft, select,
    clearSelection, toggleComponent, startComplex, setData, setRank, scoreComponent, validateDraft, preview,
    record, componentRound, componentScores, totals, kingdomScores, leaders, undo, rename, newGame, restore };
  root.TrixScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
