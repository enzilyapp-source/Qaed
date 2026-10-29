/* Trix page: all selections and counters stay in draft until the explicit record button. */
(function () {
  'use strict';
  const T = window.TrixScore, $ = id => document.getElementById(id);
  const ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة'];
  const format = n => n > 0 ? `+${n}` : String(n);
  let state = T.initialState(), storageBlocked = false, viewed = 0;
  let counterRefs = {}, kingRefs = null, rankRefs = [];
  function node(tag, className, text) {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text !== undefined) el.textContent = text; return el;
  }
  function button(text, action, className = '') {
    const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el;
  }
  function feedback(text) { $('trix-feedback').textContent = text; }
  function warn(text) { $('trix-storage-warning').hidden = false; $('trix-storage-warning').textContent = text; }
  function persist() {
    if (storageBlocked) return;
    try { localStorage.setItem(T.STORAGE_KEY, JSON.stringify(state)); }
    catch { warn('الحفظ على الجهاز غير متاح؛ نتائج التركس متاحة في هالجلسة فقط.'); }
  }
  try { state = T.restore(localStorage.getItem(T.STORAGE_KEY)); }
  catch { storageBlocked = true; warn('تعذر قراءة حفظ التركس. ما حذفنا السجل السابق؛ تقدر تستخدم الصفحة بهالجلسة بدون حفظ تلقائي.'); }
  viewed = Math.min(T.currentKingdom(state), 3);
  function commitDraft(next) { state = next; persist(); renderStatus(); feedback(''); }
  function renderBoard() {
    const active = T.currentKingdom(state), allDone = T.completed(state), used = T.used(state, viewed);
    $('trix-title').textContent = `المملكة ${ORDINALS[viewed]}`;
    $('trix-owner').textContent = `مملكة ${state.players[viewed].name}`;
    $('trix-results-owner').textContent = state.players[viewed].name;
    $('trix-used-count').textContent = `${used.length} / 5 مسجلة`;
    $('trix-review').hidden = allDone || viewed === active;
    $('trix-kingdoms').replaceChildren();
    state.players.forEach((player, index) => {
      const closed = T.used(state, index).length === 5;
      const tab = button('', () => { viewed = index; render(); }, closed ? 'complete' : '');
      tab.setAttribute('aria-pressed', String(viewed === index));
      tab.append(node('span', '', `المملكة ${ORDINALS[index]}`), node('strong', '', player.name),
        node('small', '', closed ? 'مكتملة' : index === active ? 'الحالية' : 'بانتظار الدور'));
      $('trix-kingdoms').append(tab);
    });
    $('trix-games').replaceChildren();
    for (const type of [...T.TYPES, 'complex']) {
      const closed = used.includes(type), eligible = type === 'complex'
        ? T.NEGATIVE.filter(item => !used.includes(item)).length >= 2 : !closed;
      const choice = button('', () => {
        try { state = T.select(state, type); persist(); render(); feedback(''); }
        catch (error) { feedback(error.message); }
      }, `trix-game${closed ? ' closed' : ''}${type === 'complex' ? ' complex' : ''}`);
      choice.id = `trix-game-${type}`;
      choice.setAttribute('aria-pressed', String(viewed === active && state.draft.selection === type));
      choice.disabled = allDone || viewed !== active || !eligible;
      choice.append(node('span', '', T.LABELS[type]), node('small', '', closed ? 'مسجل ✓'
        : type === 'complex' ? eligible ? 'نوعين أو أكثر · بدون التركس' : 'يحتاج نوعين متاحين' : 'متاح'));
      $('trix-games').append(choice);
    }
    $('trix-undo').disabled = state.rounds.length === 0;
    $('trix-winner-panel').hidden = !allDone;
    if (allDone) {
      const leaders = T.leaders(state), scores = T.totals(state);
      $('trix-winner-name').textContent = leaders.length > 1 ? `تعادل: ${leaders.map(p => p.name).join(' و')}` : `الفائز: ${leaders[0].name}`;
      $('trix-winner-detail').textContent = `أعلى مجموع: ${format(Math.max(...scores))} نقطة بعد اكتمال ألعاب الممالك الأربع.`;
    }
    renderTable(); renderLedger();
  }
  function renderTable() {
    $('trix-table-head').replaceChildren(); $('trix-table-body').replaceChildren(); $('trix-table-foot').replaceChildren();
    const header = node('tr'), blank = node('th', '', 'نوع اللعب'); blank.scope = 'col'; header.append(blank);
    for (const player of state.players) { const th = node('th', '', player.name); th.scope = 'col'; header.append(th); }
    $('trix-table-head').append(header);
    for (const type of ['trix', 'king', 'queens', 'diamonds', 'tricks']) {
      const scores = T.componentScores(state, viewed, type), round = T.componentRound(state, viewed, type);
      const row = node('tr'), label = node('th', '', T.LABELS[type]); label.scope = 'row';
      if (round?.selection === 'complex') label.append(node('small', '', 'ضمن كومبلكس'));
      row.append(label);
      for (let i = 0; i < 4; i++) { const td = node('td'); td.append(node('bdi', '', scores ? format(scores[i]) : '—')); row.append(td); }
      $('trix-table-body').append(row);
    }
    for (const [title, scores, className] of [
      ['هالمملكة', T.kingdomScores(state, viewed), 'kingdom-total'], ['المجموع الكلي', T.totals(state), 'global-total'],
    ]) {
      const row = node('tr', className), label = node('th', '', title); label.scope = 'row'; row.append(label);
      scores.forEach(score => { const td = node('td'); td.append(node('bdi', '', format(score))); row.append(td); });
      $('trix-table-foot').append(row);
    }
  }
  function renderLedger() {
    $('trix-ledger').replaceChildren();
    for (const round of state.rounds) {
      const li = node('li', '', `${state.players[round.kingdom].name} · ${round.selection === 'complex' ? 'كومبلكس: ' : ''}${round.types.map(t => T.LABELS[t]).join(' + ')}`);
      const total = round.types.reduce((sum, type) => T.scoreComponent(type, round.data[type]).map((n, i) => sum[i] + n), [0, 0, 0, 0]);
      const line = node('span'); state.players.forEach((player, i) => {
        line.append(document.createTextNode(`${i ? ' · ' : ''}${player.name}: `), node('bdi', '', format(total[i])));
      }); li.append(line); $('trix-ledger').append(li);
    }
    if (!state.rounds.length) $('trix-ledger').append(node('li', '', 'ما فيه تسجيلات بعد.'));
  }
  function counterForm(type, section) {
    const rule = T.COUNTERS[type]; counterRefs[type] = { rows: [], total: node('strong', 'trix-count-total') };
    section.append(node('p', 'hint', `أدخل العدد لكل لاعب، بدون ماينس. المطلوب ${rule.count}؛ كل وحدة ${rule.unit} نقطة.`));
    state.players.forEach((player, index) => {
      const row = node('div', 'trix-count-row'), info = node('div', 'trix-count-person');
      const label = node('label', '', player.name); label.htmlFor = `trix-count-${type}-${index}`;
      const score = node('small', '', '0 نقطة'); info.append(label, score);
      const controls = node('div', 'trix-counter');
      function step(delta) {
        const counts = [...state.draft.data[type].counts], n = T.readCount(counts[index]);
        counts[index] = Math.max(0, Math.min(rule.count, (n ?? 0) + delta));
        commitDraft(T.setData(state, type, { counts }));
      }
      const minus = button('−', () => step(-1)), plus = button('+', () => step(1));
      minus.setAttribute('aria-label', `تقليل ${T.LABELS[type]} لـ${player.name}`);
      plus.setAttribute('aria-label', `زيادة ${T.LABELS[type]} لـ${player.name}`);
      const input = node('input'); input.id = `trix-count-${type}-${index}`; input.type = 'text';
      input.inputMode = 'numeric'; input.maxLength = 2; input.autocomplete = 'off'; input.dir = 'ltr';
      input.addEventListener('input', () => {
        const counts = [...state.draft.data[type].counts]; counts[index] = input.value;
        commitDraft(T.setData(state, type, { counts }));
      });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      controls.append(minus, input, plus); row.append(info, controls); section.append(row);
      counterRefs[type].rows.push({ input, minus, plus, score });
    });
    section.append(counterRefs[type].total);
  }
  function kingForm(section) {
    section.append(node('p', 'hint', 'غير معلنة: −75 للي أكلها. معلنة: −150 للي أكلها و+75 للي أعلنها.'));
    section.append(node('p', '', 'منو أكلها؟'));
    const takers = node('div', 'trix-person-options'); kingRefs = { takerButtons: [], declarerButtons: [] };
    state.players.forEach(player => {
      const b = button(player.name, () => commitDraft(T.setData(state, 'king', { taker: player.id })));
      b.id = `trix-king-taker-${player.id}`; b.setAttribute('aria-pressed', 'false'); takers.append(b); kingRefs.takerButtons.push(b);
    }); section.append(takers);
    const label = node('label', 'trix-announcement'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.id = 'trix-king-declared';
    checkbox.addEventListener('change', () => commitDraft(T.setData(state, 'king', {
      declared: checkbox.checked, declarer: checkbox.checked ? state.draft.data.king.declarer : null,
    })));
    label.append(checkbox, document.createTextNode('معلنة؟')); section.append(label); kingRefs.checkbox = checkbox;
    const announcer = node('div'); announcer.append(node('p', '', 'منو أعلنها؟'));
    const choices = node('div', 'trix-person-options');
    state.players.forEach(player => {
      const b = button(player.name, () => commitDraft(T.setData(state, 'king', { declarer: player.id })));
      b.id = `trix-king-declarer-${player.id}`; b.setAttribute('aria-pressed', 'false'); choices.append(b); kingRefs.declarerButtons.push(b);
    }); announcer.append(choices); section.append(announcer); kingRefs.announcer = announcer;
  }
  function ranksForm(section) {
    section.append(node('p', 'hint', 'الأول 200، الثاني 150، الثالث 100، الرابع 50. كل مركز للاعب واحد؛ اختيار مركز مستخدم يبدّل المركزين.'));
    state.players.forEach((player, index) => {
      const row = node('div', 'trix-rank-row'); row.append(node('label', '', player.name));
      const options = node('div', 'trix-ranks'); options.setAttribute('role', 'group'); options.setAttribute('aria-label', `ترتيب ${player.name}`);
      const buttons = [];
      for (let rank = 1; rank <= 4; rank++) {
        const b = button(String(rank), () => commitDraft(T.setRank(state, index, rank)));
        b.id = `trix-rank-${index}-${rank}`; b.setAttribute('aria-pressed', 'false');
        b.append(node('small', '', `${T.RANK_POINTS[rank - 1]} نقطة`)); options.append(b); buttons.push(b);
      } row.append(options); section.append(row); rankRefs.push(buttons);
    });
  }
  function renderForms() {
    counterRefs = {}; kingRefs = null; rankRefs = [];
    $('trix-forms').replaceChildren(); $('trix-complex-options').replaceChildren();
    const active = T.currentKingdom(state), selection = state.draft.selection;
    const visible = active < 4 && viewed === active && selection !== null;
    $('trix-editor').hidden = !visible;
    if (!visible) return;
    $('trix-editor-title').textContent = T.LABELS[selection];
    $('trix-complex-picker').hidden = selection !== 'complex';
    if (selection === 'complex') {
      T.NEGATIVE.forEach(type => {
        const label = node('label'), input = node('input'); input.type = 'checkbox'; input.id = `trix-complex-${type}`;
        input.checked = state.draft.components.includes(type); input.disabled = !T.remaining(state).includes(type);
        input.addEventListener('change', () => { state = T.toggleComponent(state, type); persist(); renderForms(); renderStatus(); feedback(''); });
        label.append(input, document.createTextNode(T.LABELS[type] + (input.disabled ? ' · مسجل' : ''))); $('trix-complex-options').append(label);
      });
      $('trix-complex-start').disabled = state.draft.components.length < 2;
      $('trix-complex-start').hidden = state.draft.complexStarted;
      if (!state.draft.complexStarted) return;
    }
    for (const type of T.draftTypes(state)) {
      const section = node('section', 'trix-component'); section.dataset.type = type; section.append(node('h3', '', T.LABELS[type]));
      if (T.COUNTERS[type]) counterForm(type, section); else if (type === 'king') kingForm(section); else ranksForm(section);
      $('trix-forms').append(section);
    }
  }
  function renderStatus() {
    for (const [type, refs] of Object.entries(counterRefs)) {
      const counts = state.draft.data[type].counts.map(T.readCount), rule = T.COUNTERS[type];
      const valid = counts.every(n => n !== null && n >= 0 && n <= rule.count), sum = counts.reduce((n, x) => n + (x ?? 0), 0);
      refs.rows.forEach((row, i) => {
        row.input.value = String(state.draft.data[type].counts[i]);
        row.input.setAttribute('aria-invalid', String(counts[i] === null || counts[i] > rule.count));
        row.minus.disabled = counts[i] === null || counts[i] <= 0;
        row.plus.disabled = !valid || sum >= rule.count || counts[i] >= rule.count;
        row.score.textContent = counts[i] === null ? '—' : `${counts[i] === 0 ? 0 : counts[i] * rule.unit} نقطة`;
      });
      refs.total.textContent = `العدد: ${sum} / ${rule.count} · النقاط: ${sum === 0 ? 0 : sum * rule.unit}`;
      refs.total.classList.toggle('valid', valid && sum === rule.count);
    }
    if (kingRefs) {
      const king = state.draft.data.king;
      kingRefs.checkbox.checked = king.declared; kingRefs.announcer.hidden = !king.declared;
      state.players.forEach((player, i) => {
        kingRefs.takerButtons[i].setAttribute('aria-pressed', String(king.taker === player.id));
        kingRefs.declarerButtons[i].setAttribute('aria-pressed', String(king.declarer === player.id));
      });
    }
    rankRefs.forEach((buttons, index) => buttons.forEach((b, r) => b.setAttribute('aria-pressed', String(state.draft.data.trix.ranks[index] === r + 1))));
    const error = T.validateDraft(state), scores = T.preview(state);
    $('trix-register').disabled = Boolean(error) || viewed !== T.currentKingdom(state);
    $('trix-validation').textContent = state.draft.selection ? error || 'البيانات مكتملة؛ راجع النقاط واضغط تسجيل.' : '';
    $('trix-preview').replaceChildren(); $('trix-preview').hidden = !scores;
    if (scores) state.players.forEach((player, i) => {
      const col = node('div'); col.append(node('span', '', player.name), node('bdi', '', format(scores[i]))); $('trix-preview').append(col);
    });
  }
  function render() { renderBoard(); renderForms(); renderStatus(); }
  $('trix-complex-start').addEventListener('click', () => {
    try { state = T.startComplex(state); persist(); renderForms(); renderStatus(); feedback(''); }
    catch (error) { feedback(error.message); }
  });
  $('trix-editor-close').addEventListener('click', () => {
    if (T.hasDraft(state) && !window.confirm('نترك هالاختيارات بدون تسجيل؟ سجل المملكة ما يتغيّر.')) return;
    state = T.clearSelection(state); persist(); render(); feedback('');
  });
  $('trix-register').addEventListener('click', () => {
    if (viewed !== T.currentKingdom(state)) return;
    try {
      const before = T.currentKingdom(state); state = T.record(state); const after = T.currentKingdom(state);
      viewed = Math.min(after, 3); persist(); render();
      feedback(after === 4 ? 'اكتملت الممالك الأربع.' : after !== before ? `اكتملت المملكة. الحين دور ${state.players[after].name}.` : 'تم التسجيل وإغلاق الأنواع المختارة من المملكة.');
    } catch (error) { feedback(error.message); }
  });
  $('trix-current').addEventListener('click', () => { viewed = Math.min(T.currentKingdom(state), 3); render(); });
  $('trix-undo').addEventListener('click', () => {
    if (T.hasDraft(state) && !window.confirm('نستبدل المسودة باختيارات آخر تسجيل للتعديل؟')) return;
    state = T.undo(state); viewed = Math.min(T.currentKingdom(state), 3); persist(); render();
    feedback('تراجعنا عن آخر تسجيل ورجعت أنواعه متاحة؛ عدّل البيانات واضغط تسجيل لاعتمادها.');
  });
  $('trix-new').addEventListener('click', () => {
    if ((state.rounds.length || T.hasDraft(state)) && !window.confirm('نبدأ لعبة تركس جديدة ونصفّر الممالك الأربع؟')) return;
    state = T.newGame(state); viewed = 0; persist(); render(); feedback('لعبة تركس جديدة، بالتوفيق!');
  });
  const dialog = $('trix-settings-dialog');
  $('trix-settings-open').addEventListener('click', () => {
    $('trix-names').replaceChildren();
    state.players.forEach((player, i) => {
      const label = node('label', '', `اللاعب ${i + 1}`), input = node('input'); input.id = `trix-name-${player.id}`;
      input.type = 'text'; input.maxLength = 32; input.value = player.name; input.autocomplete = 'off'; label.append(input); $('trix-names').append(label);
    });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  });
  function closeDialog() { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  $('trix-settings-close').addEventListener('click', closeDialog);
  $('trix-settings-form').addEventListener('submit', event => {
    event.preventDefault(); state = T.rename(state, [...$('trix-names').querySelectorAll('input')].map(input => input.value));
    persist(); render(); closeDialog(); feedback('تم حفظ أسماء اللاعبين.');
  });
  render();
})();
