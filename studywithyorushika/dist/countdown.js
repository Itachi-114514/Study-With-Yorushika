(() => {
  'use strict';
  const root = document.getElementById('countdown-root');
  if (!root) return;

  const storageKey = 'studywithyorushika.countdowns';
  const dayMilliseconds = 86400000;
  const localDay = () => {
    const date = new Date();
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  // Build UTC dates from calendar components, including years below 100.
  // This compares local calendar days without daylight-saving-time offsets.
  function dayNumber(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return Math.floor(date.getTime() / dayMilliseconds);
  }
  function readEntries() {
    const saved = readStorage(storageKey, []);
    if (!Array.isArray(saved)) return [];
    const seen = new Set();
    return saved.filter(entry => {
      if (!entry || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || typeof entry.name !== 'string' || !entry.name.trim() || dayNumber(entry.date) === null) return false;
      seen.add(entry.id);
      return true;
    }).slice(0, 200).map(entry => ({
      id: entry.id,
      name: entry.name.trim().slice(0, 60),
      date: entry.date,
      note: typeof entry.note === 'string' ? entry.note.slice(0, 180) : ''
    }));
  }
  let entries = readEntries();
  let editingId = null;
  let undoEntry = null;
  let undoTimeout;
  let renderedDay = '';

  root.innerHTML = `<div class="countdown-heading"><div><h2>倒数日</h2><p>把期待的日子，轻轻记在这里。</p></div><button type="button" class="countdown-add" id="countdown-add">${icon('plus')}<span>添加日期</span></button></div>
    <form id="countdown-form" class="countdown-form" hidden novalidate>
      <div class="countdown-form-heading"><strong id="countdown-form-title">添加一个值得期待的日子</strong></div>
      <div class="countdown-fields"><label>名称<input id="countdown-name" name="name" type="text" maxlength="60" required autocomplete="off" placeholder="例如：下一场旅行"></label><label>目标日期<input id="countdown-date" name="date" type="date" min="0001-01-01" max="9999-12-31" required></label></div>
      <label class="countdown-note-field">备注 <span>可选</span><textarea id="countdown-note" name="note" maxlength="180" rows="2" placeholder="留下一句给那天的话…"></textarea></label>
      <p id="countdown-error" class="countdown-error" role="alert" hidden></p>
      <div class="countdown-form-actions"><button type="button" id="countdown-cancel">取消</button><button type="submit" id="countdown-save">保存日期</button></div>
    </form>
    <div class="countdown-undo" id="countdown-undo" role="status" hidden><span id="countdown-undo-message"></span><button type="button" id="countdown-undo-button">撤销</button></div>
    <div id="countdown-list" class="countdown-list"></div>
    <p class="countdown-local-note">日期保存在当前浏览器，按本地日历计算。</p>`;

  const form = root.querySelector('#countdown-form');
  const nameInput = root.querySelector('#countdown-name');
  const dateInput = root.querySelector('#countdown-date');
  const noteInput = root.querySelector('#countdown-note');
  const error = root.querySelector('#countdown-error');
  const list = root.querySelector('#countdown-list');
  const undo = root.querySelector('#countdown-undo');
  const isReadOnly = () => document.body.dataset.readonly === 'true';
  function canEdit() {
    if (!isReadOnly()) return true;
    toast('当前窗口为只读，请在正在使用的窗口中修改。');
    return false;
  }
  function syncReadOnly() {
    root.querySelectorAll('button,input,textarea').forEach(control => { control.disabled = isReadOnly(); });
  }
  function save() {
    persist(storageKey, entries);
    render();
  }
  function render() {
    renderedDay = localDay();
    const today = dayNumber(renderedDay);
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'zh-CN'));
    list.innerHTML = sorted.length ? sorted.map(entry => {
      const distance = dayNumber(entry.date) - today;
      const [year, month, day] = entry.date.split('-');
      return `<article class="countdown-card${distance < 0 ? ' is-past' : distance === 0 ? ' is-today' : ''}" data-countdown-id="${esc(entry.id)}">
        <div class="countdown-card-top"><time datetime="${entry.date}">${year} 年 ${Number(month)} 月 ${Number(day)} 日</time><div class="countdown-card-actions"><button type="button" data-countdown-edit="${esc(entry.id)}" aria-label="编辑倒数日：${esc(entry.name)}" title="编辑">${icon('ellipsis')}</button><button type="button" data-countdown-delete="${esc(entry.id)}" aria-label="删除倒数日：${esc(entry.name)}" title="删除">${icon('x')}</button></div></div>
        <h3>${esc(entry.name)}</h3>
        <div class="countdown-distance" aria-label="${distance === 0 ? '就是今天' : distance > 0 ? `还有 ${distance} 天` : `已过去 ${Math.abs(distance)} 天`}">${distance === 0 ? '<strong class="countdown-today">就是今天</strong>' : `<span>${distance > 0 ? '还有' : '已过去'}</span><strong>${Math.abs(distance)}</strong><span>天</span>`}</div>
        ${entry.note ? `<p class="countdown-card-note">${esc(entry.note)}</p>` : ''}
      </article>`;
    }).join('') : `<div class="countdown-empty"><span class="countdown-empty-symbol" aria-hidden="true">${icon('sun')}</span><strong>下一份期待，在哪一天？</strong><p>添加一个日期，让每一天都有所期待。</p></div>`;
    syncReadOnly();
  }
  function closeEditor() {
    editingId = null;
    form.hidden = true;
    form.reset();
    error.hidden = true;
    error.textContent = '';
    root.querySelector('#countdown-add').focus({ preventScroll: true });
  }
  function openEditor(entry = null) {
    if (!canEdit()) return;
    if (!entry && entries.length >= 200) { toast('最多保存 200 个倒数日，可以先删除不再需要的日期。'); return; }
    editingId = entry?.id || null;
    form.hidden = false;
    nameInput.value = entry?.name || '';
    dateInput.value = entry?.date || '';
    noteInput.value = entry?.note || '';
    error.hidden = true;
    error.textContent = '';
    root.querySelector('#countdown-form-title').textContent = entry ? '编辑这份期待' : '添加一个值得期待的日子';
    root.querySelector('#countdown-save').textContent = entry ? '保存修改' : '保存日期';
    syncReadOnly();
    nameInput.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function fail(message, field) {
    error.textContent = message;
    error.hidden = false;
    field.focus({ preventScroll: true });
  }
  function clearUndo() {
    clearTimeout(undoTimeout);
    undoEntry = null;
    undo.hidden = true;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.id === 'countdown-add') openEditor();
    else if (button.id === 'countdown-cancel') closeEditor();
    else if (button.dataset.countdownEdit) {
      const entry = entries.find(item => item.id === button.dataset.countdownEdit);
      if (entry) openEditor(entry);
    } else if (button.dataset.countdownDelete) {
      if (!canEdit()) return;
      const entry = entries.find(item => item.id === button.dataset.countdownDelete);
      if (!entry) return;
      clearUndo();
      undoEntry = entry;
      entries = entries.filter(item => item.id !== entry.id);
      if (editingId === entry.id) closeEditor();
      root.querySelector('#countdown-undo-message').textContent = `已删除「${entry.name}」`;
      undo.hidden = false;
      undoTimeout = setTimeout(clearUndo, 10000);
      save();
    } else if (button.id === 'countdown-undo-button') {
      if (!canEdit() || !undoEntry) return;
      if (entries.length >= 200) { toast('倒数日已满，请先删除一个日期再撤销。'); return; }
      if (!entries.some(entry => entry.id === undoEntry.id)) entries.push(undoEntry);
      clearUndo();
      save();
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!canEdit()) return;
    const name = nameInput.value.trim();
    const date = dateInput.value;
    const note = noteInput.value.trim();
    if (!name || name.length > 60) { fail('请填写 1 至 60 字的名称。', nameInput); return; }
    if (dayNumber(date) === null) { fail('请选择一个有效的目标日期。', dateInput); return; }
    if (note.length > 180) { fail('备注最多填写 180 字。', noteInput); return; }
    const id = editingId || (crypto.randomUUID ? crypto.randomUUID() : `countdown-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const index = entries.findIndex(entry => entry.id === id);
    if (editingId && index < 0) { fail('这个日期已被删除，请取消后重新添加。', nameInput); return; }
    if (index < 0 && entries.length >= 200) { fail('最多保存 200 个倒数日。', nameInput); return; }
    const entry = { id, name, date, note };
    if (index < 0) entries.push(entry); else entries[index] = entry;
    closeEditor();
    save();
  });
  function refreshDay() { if (localDay() !== renderedDay) render(); }
  setInterval(refreshDay, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      entries = readEntries();
      clearUndo();
      render();
    }
  });
  window.addEventListener('study-data-imported', () => {
    entries = readEntries();
    clearUndo();
    editingId = null;
    form.hidden = true;
    form.reset();
    error.hidden = true;
    render();
  });
  new MutationObserver(syncReadOnly).observe(document.body, { attributes: true, attributeFilter: ['data-readonly'] });
  window.studyCountdown = { render, refresh: render };
  render();
})();
