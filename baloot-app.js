/* Manual Baloot entries; scoring and the 152 stop are in baloot-core.js. */
(function () {
  'use strict';
  const B = window.BalootScore, $ = id => document.getElementById(id);
  let state = B.initialState(), storageBlocked = false;
  function warn(text) { $('baloot-storage-warning').hidden = false; $('baloot-storage-warning').textContent = text; }
  function persist() {
    if (storageBlocked) return;
    try { localStorage.setItem(B.STORAGE_KEY, JSON.stringify(state)); }
    catch { warn('الحفظ على الجهاز غير متاح؛ النتائج متاحة بهالجلسة فقط.'); }
  }
  try { state = B.restore(localStorage.getItem(B.STORAGE_KEY)); }
  catch { storageBlocked = true; warn('تعذر قراءة الحفظ السابق. ما حذفناه؛ تقدر تستخدم قيد البلوت بهالجلسة بدون حفظ تلقائي.'); }
  function updateInputs() {
    const winner = B.winner(state);
    for (const team of ['A', 'B']) {
      const input = $('baloot-input-' + team); input.value = state.draft[team]; input.disabled = Boolean(winner);
      input.setAttribute('aria-invalid', String(Boolean(input.value.trim()) && B.parse(input.value) === null));
    }
    $('baloot-register').disabled = Boolean(B.validate(state));
  }
  function render() {
    const scores = B.totals(state), winner = B.winner(state);
    updateInputs();
    $('baloot-saved-count').textContent = `المسجل: ${state.rounds.length}`;
    $('baloot-next-round').textContent = winner ? 'اللعبة مكتملة' : `الجولة ${state.rounds.length + 1}`;
    $('baloot-empty').hidden = state.rounds.length > 0;
    $('baloot-history-wrap').hidden = state.rounds.length === 0;
    $('baloot-history-body').replaceChildren();
    state.rounds.forEach((round, index) => {
      const row = document.createElement('tr'), label = document.createElement('th');
      label.scope = 'row'; label.textContent = String(index + 1); row.append(label);
      for (const team of ['A', 'B']) {
        const td = document.createElement('td'); td.textContent = String(round[team]); row.append(td);
      }
      $('baloot-history-body').append(row);
    });
    for (const team of ['A', 'B']) {
      $('baloot-total-' + team).textContent = String(scores[team]);
      $('baloot-live-' + team).textContent = String(scores[team]);
      $('baloot-total-' + team).classList.toggle('leader', Boolean(winner && winner.teams.includes(team)));
    }
    $('baloot-undo').disabled = state.rounds.length === 0;
    $('baloot-winner-panel').hidden = !winner;
    if (winner) {
      $('baloot-winner-name').textContent = winner.tie ? 'تعادل بين الفريقين A وB' : `الفائز: الفريق ${winner.teams[0]}`;
      $('baloot-winner-detail').textContent = `الفريق A: ${scores.A} — الفريق B: ${scores.B}. توقفت اللعبة عند بلوغ 152 أو أكثر.`;
    }
  }
  for (const team of ['A', 'B']) {
    $('baloot-input-' + team).addEventListener('input', event => {
      state = B.edit(state, team, event.target.value); persist(); updateInputs();
      $('baloot-feedback').textContent = '';
    });
    $('baloot-input-' + team).addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (team === 'A') $('baloot-input-B').focus(); else event.target.blur();
      }
    });
  }
  $('baloot-form').addEventListener('submit', event => event.preventDefault());
  $('baloot-register').addEventListener('click', () => {
    try { state = B.record(state); persist(); render(); $('baloot-feedback').textContent = 'تم تسجيل الجولة.'; }
    catch (error) { $('baloot-feedback').textContent = error.message; }
  });
  $('baloot-undo').addEventListener('click', () => {
    if (B.hasDraft(state) && !window.confirm('نستبدل الأرقام غير المسجلة بنقاط آخر جولة للتعديل؟')) return;
    state = B.undo(state); persist(); render();
    $('baloot-feedback').textContent = 'تراجعنا عن آخر جولة. عدّل نقاطها واضغط تسجيل لاعتمادها.';
  });
  $('baloot-new').addEventListener('click', () => {
    if ((state.rounds.length || B.hasDraft(state)) && !window.confirm('نصفّر سجل البلوت ونبدأ لعبة جديدة؟')) return;
    state = B.newGame(); persist(); render(); $('baloot-feedback').textContent = 'لعبة بلوت جديدة، بالتوفيق!';
  });
  render();
})();
