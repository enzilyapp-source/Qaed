/* Kout page bindings. Scoring and stopping rules live in kout-core.js. */
(function () {
  'use strict';
  const K = window.KoutScore, $ = id => document.getElementById(id);
  let state = K.initialState(), storageBlocked = false;
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const feedback = text => { $('kout-feedback').textContent = text; };
  function warn(text) { $('kout-storage-warning').hidden = false; $('kout-storage-warning').textContent = text; }
  function persist() {
    if (storageBlocked) return;
    try { localStorage.setItem(K.STORAGE_KEY, JSON.stringify(state)); }
    catch { warn('الحفظ على الجهاز غير متاح؛ تقدر تكمل بهالجلسة، لكن النتائج ما تنحفظ إذا سكرت الصفحة.'); }
  }
  try { state = K.restore(localStorage.getItem(K.STORAGE_KEY)); }
  catch {
    storageBlocked = true;
    warn('تعذر قراءة الحفظ على الجهاز. ما حذفنا السجل السابق؛ تقدر تستخدم قيد كوت بهالجلسة بدون حفظ تلقائي.');
  }
  function render() {
    const scores = K.totals(state), winner = K.winner(state), preview = K.preview(state);
    for (const id of ['A', 'B']) {
      $('kout-score-name-' + id).textContent = state.names[id];
      $('kout-head-' + id).textContent = state.names[id];
      $('kout-team-' + id).textContent = state.names[id];
      $('kout-score-' + id).textContent = String(scores[id]);
      $('kout-total-' + id).textContent = String(scores[id]);
      $('kout-score-' + id).classList.toggle('winning-score', Boolean(winner && winner.team === id));
      $('kout-total-' + id).classList.toggle('leader', Boolean(winner && winner.team === id));
    }
    $('kout-saved-count').textContent = `${state.rounds.length} جولات مسجلة`;
    $('kout-next-round').textContent = winner ? 'اللعبة مكتملة' : `الجولة ${state.rounds.length + 1}`;
    $('kout-empty').hidden = state.rounds.length > 0;
    $('kout-history-wrap').hidden = state.rounds.length === 0;
    $('kout-history-body').replaceChildren();
    for (const [index, round] of state.rounds.entries()) {
      const result = K.award(round.team, round.contract, round.outcome);
      const row = node('tr'), label = node('th', '', String(index + 1)); label.scope = 'row'; row.append(label);
      for (const id of ['A', 'B']) {
        const td = node('td', result.recipient === id ? 'awarded' : '', String(result.scores[id]));
        row.append(td);
      }
      $('kout-history-body').append(row);
      const details = node('tr', 'round-note-row');
      const text = `${state.names[round.team]} · ${K.CONTRACTS[round.contract].label} · ${round.outcome === 'win' ? 'فاز' : 'خسر'}`;
      const cell = node('td', '', text); cell.colSpan = 3; details.append(cell); $('kout-history-body').append(details);
    }
    document.querySelectorAll('[data-kout-field]').forEach(button => {
      button.setAttribute('aria-pressed', String(state.draft[button.dataset.koutField] === button.dataset.koutValue));
      button.disabled = Boolean(winner);
    });
    $('kout-register').disabled = Boolean(winner) || !preview;
    $('kout-undo').disabled = state.rounds.length === 0;
    $('kout-preview').classList.toggle('ready', Boolean(preview) && !winner);
    $('kout-preview').textContent = winner ? 'اللعبة انتهت؛ ما تنسجل جولات إضافية. تقدر تتراجع عن آخر جولة أو تبدأ لعبة جديدة.'
      : preview ? `${state.names[preview.recipient]} ياخذ ${preview.points} نقطة. اضغط «تسجيل» لاعتماد الجولة.`
      : 'كمّل الاختيارات عشان تظهر لك النقاط قبل تسجيلها.';
    $('kout-winner-panel').hidden = !winner;
    if (winner) {
      $('kout-winner-name').textContent = `الفائز: ${state.names[winner.team]}`;
      const other = winner.team === 'A' ? 'B' : 'A';
      $('kout-winner-detail').textContent = winner.reason === 'shutout'
        ? `${scores[winner.team]} مقابل صفر — فاز بوصوله إلى 51 أو أكثر والخصم صفر.`
        : `${scores[winner.team]} مقابل ${scores[other]} — وصل إلى 101 أو أكثر.`;
    }
  }
  document.querySelectorAll('[data-kout-field]').forEach(button => button.addEventListener('click', () => {
    state = K.choose(state, button.dataset.koutField, button.dataset.koutValue);
    persist(); render(); feedback('');
  }));
  $('kout-register').addEventListener('click', () => {
    try { state = K.record(state); persist(); render(); feedback('تم تسجيل الجولة.'); }
    catch (error) { feedback(error.message); }
  });
  $('kout-undo').addEventListener('click', () => {
    if (K.hasDraft(state) && !window.confirm('نستبدل الاختيارات الحالية باختيارات آخر جولة للتعديل؟')) return;
    state = K.undo(state); persist(); render();
    feedback('تراجعنا عن آخر جولة؛ عدّل اختياراتها واضغط تسجيل لاعتمادها مجددًا.');
  });
  $('kout-new').addEventListener('click', () => {
    if ((state.rounds.length || K.hasDraft(state)) && !window.confirm('نبدأ لعبة كوت جديدة ونصفّر سجلها؟')) return;
    state = K.newGame(state); persist(); render(); feedback('لعبة كوت جديدة، بالتوفيق!');
  });
  const dialog = $('kout-settings-dialog');
  $('kout-settings-open').addEventListener('click', () => {
    $('kout-name-A').value = state.names.A; $('kout-name-B').value = state.names.B;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  });
  function closeDialog() { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  $('kout-settings-close').addEventListener('click', closeDialog);
  $('kout-settings-form').addEventListener('submit', event => {
    event.preventDefault(); state = K.rename(state, $('kout-name-A').value, $('kout-name-B').value);
    persist(); render(); closeDialog(); feedback('تم حفظ أسماء الفرق.');
  });
  render();
})();
