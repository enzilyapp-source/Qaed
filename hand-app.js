/* Shared numeric score page. Hand and Spita keep separate models, rules and storage. */
(function () {
  'use strict';
  const H = window.SpitaScore || window.HandScore;
  const isSpita = H.KIND === 'spita';
  const $ = id => document.getElementById(id);
  let state = H.initialState(), storageBlocked = false;
  const fields = new Map();
  const current = () => state.profiles[state.mode];
  const put = profile => { state.profiles[state.mode] = profile; };
  const format = score => score > 0 ? `+${score}` : String(score);
  const digits = number => String(number);
  const feedback = text => { $('feedback').textContent = text; };
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function warnStorage(text) {
    $('storage-warning').hidden = false;
    $('storage-warning').textContent = text;
  }
  function persist() {
    if (storageBlocked) return;
    try { localStorage.setItem(H.STORAGE_KEY, JSON.stringify(state)); }
    catch {
      warnStorage('الحفظ على الجهاز غير متاح حاليًا؛ تقدر تكمل بهالجلسة، لكن لا تسكر الصفحة قبل ما تحفظ نتائجك.');
    }
  }
  try { state = H.restore(localStorage.getItem(H.STORAGE_KEY)); }
  catch (error) {
    storageBlocked = true;
    warnStorage('تعذر قراءة الحفظ على الجهاز. ما حذفنا السجل السابق؛ تقدر تستخدم القيد بهالجلسة بدون حفظ تلقائي.');
  }
  function updateFields() {
    const profile = current(), done = H.completed(profile);
    for (const [id, field] of fields) {
      field.input.value = profile.draft[id] || '';
      const value = H.parse(profile.draft[id]);
      field.input.classList.toggle('negative', value !== null && value < 0);
      field.input.classList.toggle('positive', value !== null && value > 0);
      const invalid = Boolean(H.normalize(profile.draft[id])) && value === null;
      field.input.setAttribute('aria-invalid', String(invalid));
      field.input.disabled = done;
      field.minus.disabled = done;
      field.plus.disabled = done;
    }
    $('round-note').value = profile.note;
    $('round-note').disabled = done;
    $('register-round').disabled = Boolean(H.validateDraft(profile));
    $('entry-help').textContent = done ? (isSpita ? 'اللعبة متوقفة حسب المجموع. التمديد إلى +200 متاح فقط إذا ظهر الزر.' : 'الجولات مكتملة. تقدر تضيف جولة لغاية ٩.')
      : 'الأرقام مسودة؛ اكتب 0 لأي لاعب بدون نقاط، وبعدها اضغط تسجيل.';
  }
  function buildFields() {
    fields.clear();
    $('score-inputs').replaceChildren();
    current().participants.forEach((person, index) => {
      const row = node('div', 'score-row');
      const info = node('div', 'player-info');
      info.append(node('span', 'player-index', state.mode === 'teams' ? person.id : digits(index + 1)));
      const label = node('label', 'player-label', person.name);
      label.htmlFor = `score-${person.id}`;
      info.append(label);
      const controls = node('div', 'score-control');
      const minus = node('button', 'sign-button', '−');
      minus.type = 'button'; minus.setAttribute('aria-label', `جعل نتيجة ${person.name} سالبة`);
      const input = node('input', 'score-value');
      input.id = `score-${person.id}`; input.name = `score-${person.id}`;
      input.type = 'text'; input.inputMode = 'decimal'; input.dir = 'ltr';
      input.maxLength = 8; input.placeholder = '0'; input.autocomplete = 'off';
      input.setAttribute('aria-describedby', 'entry-help');
      input.setAttribute('enterkeyhint', 'next');
      const plus = node('button', 'sign-button', '+');
      plus.type = 'button'; plus.setAttribute('aria-label', `جعل نتيجة ${person.name} موجبة`);
      function apply(value, polarity) {
        put(polarity === undefined ? H.edit(current(), person.id, value) : H.sign(current(), person.id, polarity));
        persist(); updateFields(); feedback('');
      }
      input.addEventListener('input', () => apply(input.value));
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const next = current().participants[index + 1];
          (next ? fields.get(next.id).input : $('round-note')).focus();
        }
      });
      minus.addEventListener('click', () => { apply(null, -1); input.focus(); });
      plus.addEventListener('click', () => { apply(null, 1); input.focus(); });
      controls.append(minus, input, plus); row.append(info, controls);
      $('score-inputs').append(row); fields.set(person.id, { input, minus, plus });
    });
  }
  function renderHistory() {
    const profile = current(), scores = H.totals(profile);
    // Visible totals are derived from the same recorded ledger as the history table.
    const board = $('current-scores');
    board.replaceChildren();
    board.dataset.players = String(profile.participants.length);
    for (const person of profile.participants) {
      const tile = node('div', 'scoreboard-person');
      tile.append(node('span', '', person.name), node('bdi', '', format(scores[person.id])));
      board.append(tile);
    }
    $('saved-count').textContent = isSpita ? `المسجل: ${profile.rounds.length}` : `المسجل: ${profile.rounds.length} / ${profile.roundLimit}`;
    $('history-wrap').hidden = !profile.rounds.length;
    $('empty-history').hidden = Boolean(profile.rounds.length);
    $('history-head').replaceChildren(); $('history-body').replaceChildren(); $('history-total').replaceChildren();
    const header = node('tr');
    const roundHead = node('th', '', 'الجولة'); roundHead.scope = 'col'; header.append(roundHead);
    for (const person of profile.participants) {
      const th = node('th', '', person.name); th.scope = 'col'; header.append(th);
    }
    $('history-head').append(header);
    profile.rounds.forEach((round, index) => {
      const tr = node('tr');
      const rowHead = node('th', '', digits(index + 1)); rowHead.scope = 'row'; tr.append(rowHead);
      for (const person of profile.participants) {
        const td = node('td'); td.append(node('bdi', '', format(round.scores[person.id]))); tr.append(td);
      }
      $('history-body').append(tr);
      if (round.note) {
        const noteRow = node('tr', 'round-note-row'), noteCell = node('td', '', round.note);
        noteCell.colSpan = profile.participants.length + 1; noteRow.append(noteCell); $('history-body').append(noteRow);
      }
    });
    const footer = node('tr'), totalLabel = node('th', '', 'المجموع'); totalLabel.scope = 'row'; footer.append(totalLabel);
    const lowest = Math.min(...Object.values(scores));
    for (const person of profile.participants) {
      const td = node('td', profile.rounds.length ? (scores[person.id] === lowest ? 'leader' : 'trailing') : '');
      td.append(node('bdi', '', format(scores[person.id]))); footer.append(td);
    }
    $('history-total').append(footer);
  }
  function render() {
    const profile = current(), done = H.completed(profile);
    if (isSpita) renderSpitaRules();
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
    $('round-label').textContent = isSpita ? String(done ? profile.rounds.length : profile.rounds.length + 1)
      : `${done ? profile.roundLimit : profile.rounds.length + 1} / ${profile.roundLimit}`;
    $('round-description').textContent = done ? (isSpita ? 'توقفت اللعبة. صاحب أقل مجموع هو الفائز.' : 'خلصت الجولات. صاحب أقل مجموع هو الفائز.')
      : 'اكتب الرقم، اختار موجب أو سالب، وبعدها اضغط تسجيل.';
    $('undo-round').disabled = profile.rounds.length === 0;
    $('winner-panel').hidden = !done;
    if (done) {
      const leaders = H.leaders(profile), scores = H.totals(profile);
      $('winner-name').textContent = leaders.length > 1 ? `تعادل: ${leaders.map(p => p.name).join(' و')}` : `الفائز: ${leaders[0].name}`;
      $('winner-detail').textContent = `أقل مجموع: ${format(scores[leaders[0].id])} نقطة بعد ${profile.rounds.length} جولات مسجلة.`;
      if (isSpita) {
        const end = H.termination(profile);
        $('winner-detail').textContent += ` توقفت اللعبة بوصول أحد المشاركين إلى +${profile.target} أو أكثر.`;
        if (H.canExtend(profile)) $('winner-detail').textContent += ' تبي تكملون؟ اختاروا التمديد إلى +200.';
      }
      $('extend-game').hidden = isSpita ? !H.canExtend(profile) : profile.roundLimit >= 9;
      $('extend-game').textContent = isSpita ? 'تمديد إلى +200' : `إضافة الجولة ${profile.roundLimit + 1}`;
    }
    buildFields(); updateFields(); renderHistory();
  }
  function renderSpitaRules() {
    const p = current(), locked = p.rounds.length > 0;
    $('spita-rule').value = p.rule;
    $('spita-rule').disabled = locked;
    $('spita-custom-label').hidden = p.rule !== 'custom';
    $('spita-custom-target').value = p.rule === 'custom' ? String(p.target) : '';
    $('spita-custom-target').disabled = locked;
    $('spita-rule-save').disabled = locked;
    $('spita-rule-summary').textContent = `${p.rule === 'custom' ? 'Custom' : 'Standard'} · +${p.target}`;
    $('spita-rule-hint').textContent = locked ? `حد النهاية +${p.target}. لتغيير النظام ابدأ لعبة جديدة.`
      : p.rule === 'custom' ? 'اختَر حد نهاية موجبًا، مثل +5000. الأقل مجموعًا يفوز.' : 'Standard: نهاية عند +150 مع خيار تمديد إلى +200.';
  }
  if (isSpita) {
    $('spita-rule').addEventListener('change', () => {
      $('spita-custom-label').hidden = $('spita-rule').value !== 'custom';
    });
    $('spita-rule-form').addEventListener('submit', event => {
      event.preventDefault();
      try { put(H.setRules(current(), $('spita-rule').value, $('spita-custom-target').value)); persist(); render(); feedback('تم اعتماد نظام السبيتة.'); }
      catch (error) { feedback(error.message); }
    });
  }
  // No Enter-to-save and no auto-commit: only this explicit button records a round.
  $('score-form').addEventListener('submit', event => event.preventDefault());
  $('round-note').addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  $('round-note').addEventListener('input', () => { put({ ...current(), note: $('round-note').value }); persist(); });
  $('register-round').addEventListener('click', () => {
    try {
      put(H.record(current())); persist(); render();
      feedback(H.completed(current()) ? 'تم تسجيل الجولة وتوقفت اللعبة.' : 'تم تسجيل الجولة.');
      if (!H.completed(current())) fields.values().next().value.input.focus();
    } catch (error) { feedback(error.message); }
  });
  $('undo-round').addEventListener('click', () => {
    if (H.hasDraft(current()) && !window.confirm('عندك أرقام غير مسجلة. نستبدلها بنقاط آخر جولة؟')) return;
    put(H.undo(current())); persist(); render(); feedback('تراجعنا عن آخر جولة. نقاطها رجعت للخانات عشان تقدر تعدّلها وتسجلها.');
  });
  $('new-game').addEventListener('click', () => {
    if ((current().rounds.length || H.hasDraft(current())) && !window.confirm('نبدأ لعبة جديدة ونصفّر سجل هالوضع؟')) return;
    put(H.newGame(current())); persist(); render(); feedback('لعبة جديدة، بالتوفيق!');
  });
  $('extend-game').addEventListener('click', () => {
    try { put(H.extend(current())); persist(); render(); feedback(isSpita ? 'تم تمديد حد نهاية اللعبة إلى +200.' : 'تم تمديد اللعبة بجولة.'); }
    catch (error) { feedback(error.message); }
  });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    state.mode = button.dataset.mode; persist(); render(); feedback('');
  }));

  const dialog = $('settings-dialog');
  function namesForm(count, preserve = true) {
    const old = preserve ? [...$('participant-names').querySelectorAll('input')].map(input => input.value) : [];
    $('participant-names').replaceChildren();
    const people = H.profile(state.mode, count).participants;
    people.forEach((person, index) => {
      const label = node('label', '', state.mode === 'teams' ? `اسم الفريق ${person.id}` : `اسم اللاعب ${index + 1}`);
      const input = node('input'); input.type = 'text'; input.maxLength = 32;
      input.value = old[index] || current().participants[index]?.name || person.name;
      input.required = true; input.autocomplete = 'off'; label.append(input); $('participant-names').append(label);
    });
  }
  $('settings-open').addEventListener('click', () => {
    $('round-limit').value = isSpita ? '0' : String(current().roundLimit);
    $('player-count-label').hidden = state.mode === 'teams';
    $('player-count').value = String(state.mode === 'teams' ? 2 : current().participants.length);
    $('player-count').disabled = Boolean(current().rounds.length || H.hasDraft(current()));
    $('settings-error').textContent = '';
    namesForm(Number($('player-count').value), false);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  });
  function closeSettings() { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  $('settings-close').addEventListener('click', closeSettings);
  $('player-count').addEventListener('change', () => namesForm(Number($('player-count').value)));
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const names = [...$('participant-names').querySelectorAll('input')].map(input => input.value);
      put(H.configure(current(), state.mode, Number($('player-count').value), Number($('round-limit').value), names));
      persist(); render(); closeSettings(); feedback('تم حفظ الإعدادات.');
    } catch (error) { $('settings-error').textContent = error.message; }
  });
  render();
})();
