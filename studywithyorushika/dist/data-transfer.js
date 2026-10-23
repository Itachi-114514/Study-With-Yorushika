(() => {
  'use strict';
  let pending = null;
  let reading = false;
  const owns = (object, key) => Object.hasOwn(object, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const readOnly = () => document.body.dataset.readonly === 'true';
  const invalid = message => { throw new Error(message); };
  const validDay = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  function timestamp(value) {
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value) || value <= 0 || value > 8640000000000000) invalid('任务时间格式不正确。');
    return value;
  }
  function text(value, limit, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > limit) invalid(`${label}格式不正确。`);
    return value;
  }
  function taskList(value, label) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) invalid(`${label}必须是列表。`);
    const ids = new Set();
    return value.map(item => {
      if (!isObject(item)) invalid(`${label}含有无效事项。`);
      const id = text(item.id, 256, '任务编号');
      if (ids.has(id)) invalid(`${label}含有重复任务编号。`);
      ids.add(id);
      if (item.done !== undefined && typeof item.done !== 'boolean') invalid('任务完成状态格式不正确。');
      return { id, text: text(item.text, 100, '任务名称'), done: !!item.done, createdAt: timestamp(item.createdAt), completedAt: timestamp(item.completedAt), deletedAt: timestamp(item.deletedAt) };
    });
  }
  function validateBackup(data) {
    if (!isObject(data) || !owns(data, 'records') || !isObject(data.records)) invalid('请选择本网站导出的 JSON 记录文件。');
    if (data.application !== undefined && data.application !== 'studywithyorushika') invalid('这份备份不属于本网站。');
    if (data.schemaVersion !== undefined && data.schemaVersion !== 1) invalid('暂不支持这份备份的版本。');
    const importedRecords = Object.create(null);
    for (const [day, item] of Object.entries(data.records)) {
      if (!validDay(day) || !isObject(item) || !Number.isFinite(item.seconds) || item.seconds < 0 || item.seconds > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(item.sessions) || item.sessions < 0) invalid('专注记录含有无效日期、时长或次数。');
      importedRecords[day] = { seconds: item.seconds, sessions: item.sessions };
    }
    const importedTasks = taskList(data.tasks, '待办');
    const importedTrash = taskList(data.taskTrash, '垃圾桶');
    const activeIds = new Set(importedTasks.map(item => item.id));
    if (importedTrash.some(item => activeIds.has(item.id))) invalid('同一个任务不能同时出现在待办和垃圾桶中。');
    const importedCompletions = taskList(data.taskCompletions, '完成历史').map(({ id, text, createdAt, completedAt }) => ({ id, text, createdAt, completedAt }));
    for (const item of [...importedTasks, ...importedTrash]) {
      if (item.done && !importedCompletions.some(entry => entry.id === item.id)) importedCompletions.push({ id: item.id, text: item.text, createdAt: item.createdAt, completedAt: item.completedAt });
    }
    if (data.countdowns !== undefined && !Array.isArray(data.countdowns)) invalid('倒数日必须是列表。');
    const dateIds = new Set();
    const importedCountdowns = (data.countdowns || []).map(item => {
      if (!isObject(item)) invalid('倒数日内容不正确。');
      const id = text(item.id, 256, '倒数日编号');
      if (dateIds.has(id)) invalid('倒数日编号重复。');
      dateIds.add(id);
      if (!validDay(item.date) || item.note !== undefined && (typeof item.note !== 'string' || item.note.length > 180)) invalid('倒数日的日期或备注格式不正确。');
      return { id, name: text(item.name, 60, '倒数日名称'), date: item.date, note: item.note || '' };
    });
    const importedSettings = {};
    if (data.settings !== undefined) {
      if (!isObject(data.settings)) invalid('专注设置格式不正确。');
      for (const [key, min, max] of [['focus', 1, 180], ['break', 1, 60], ['goal', 1, 1440]]) {
        if (!owns(data.settings, key)) continue;
        const value = data.settings[key];
        if (!Number.isFinite(value) || value < min || value > max) invalid('专注设置中的时长超出范围。');
        importedSettings[key] = value;
      }
      for (const key of ['chime', 'autoBreak']) if (owns(data.settings, key)) {
        if (typeof data.settings[key] !== 'boolean') invalid('专注开关设置格式不正确。');
        importedSettings[key] = data.settings[key];
      }
    }
    return { records: importedRecords, tasks: importedTasks, taskTrash: importedTrash, taskCompletions: importedCompletions, countdowns: importedCountdowns, settings: importedSettings };
  }
  function mergedBackup(incoming) {
    const mergedRecords = Object.fromEntries(Object.entries(records).map(([day, record]) => [day, { seconds: record.seconds, sessions: record.sessions }]));
    for (const [day, record] of Object.entries(incoming.records)) {
      const current = mergedRecords[day];
      mergedRecords[day] = { seconds: Math.max(current?.seconds || 0, record.seconds), sessions: Math.max(current?.sessions || 0, record.sessions) };
    }
    const mergedTasks = tasks.map(item => ({ ...item })), mergedTrash = taskTrash.map(item => ({ ...item }));
    const knownTasks = new Set([...mergedTasks, ...mergedTrash].map(item => item.id));
    for (const item of incoming.tasks) if (!knownTasks.has(item.id)) { knownTasks.add(item.id); mergedTasks.push({ ...item, deletedAt: null }); }
    for (const item of incoming.taskTrash) if (!knownTasks.has(item.id)) { knownTasks.add(item.id); mergedTrash.push({ ...item }); }
    if (mergedTasks.length > 100) invalid('合并后的待办超过 100 条，请先把部分待办移入垃圾桶再导入。');
    const mergedCompletions = new Map(taskCompletions.map(item => [item.id, { ...item }]));
    for (const item of incoming.taskCompletions) {
      const current = mergedCompletions.get(item.id);
      if (!current) mergedCompletions.set(item.id, { ...item });
      else if (item.completedAt && (!current.completedAt || item.completedAt < current.completedAt)) current.completedAt = item.completedAt;
    }
    const currentCountdowns = readStorage('studywithyorushika.countdowns', []);
    const mergedCountdowns = new Map((Array.isArray(currentCountdowns) ? currentCountdowns : []).map(item => [item.id, item]));
    for (const item of incoming.countdowns) if (!mergedCountdowns.has(item.id)) mergedCountdowns.set(item.id, item);
    if (mergedCountdowns.size > 200) invalid('合并后的倒数日超过 200 个，请先整理部分日期再导入。');
    return { records: mergedRecords, tasks: mergedTasks, taskTrash: mergedTrash, taskCompletions: [...mergedCompletions.values()], countdowns: [...mergedCountdowns.values()], settings: { ...settings, ...incoming.settings } };
  }
  function status(message, state = '') {
    const target = $('#data-import-status');
    if (!target) return;
    target.textContent = message;
    target.dataset.state = state;
  }
  function clearPreview() {
    pending = null;
    const preview = $('#import-preview');
    if (preview) preview.hidden = true;
  }
  async function readFile(file) {
    if (readOnly() || reading || !file) return;
    clearPreview();
    status('正在读取备份…');
    reading = true;
    try {
      if (file.size > 10 * 1024 * 1024) invalid('备份文件请控制在 10 MB 以内。');
      let data;
      try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); }
      catch { invalid('无法读取 JSON，请选择本网站导出的记录文件。'); }
      const checked = validateBackup(data);
      if (readOnly()) return;
      mergedBackup(checked);
      if (!$('#import-preview')) { toast('请回到专注记录页，重新选择备份文件。'); return; }
      pending = checked;
      $('#import-filename').textContent = file.name;
      $('#import-summary').innerHTML = `<ul><li>专注记录 <strong>${Object.keys(checked.records).length}</strong> 天</li><li>待办 <strong>${checked.tasks.length}</strong> 件</li><li>垃圾桶 <strong>${checked.taskTrash.length}</strong> 件</li><li>完成历史 <strong>${checked.taskCompletions.length}</strong> 件</li><li>倒数日 <strong>${checked.countdowns.length}</strong> 个</li></ul>`;
      $('#import-preview').hidden = false;
      status('已读取备份，确认后才会合并到当前记录。');
      $('#confirm-import').focus({ preventScroll: true });
      $('#import-preview').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } catch (error) { status(error.message || '这份备份暂时无法导入。', 'error'); }
    finally { reading = false; }
  }
  function applyImport() {
    if (readOnly() || !pending) return;
    try {
      // Account for the live timer before comparing the same day's totals.
      tick();
      const merged = mergedBackup(pending);
      const selection = merged.tasks.some(item => item.id === selectedTask && !item.done) ? selectedTask : null;
      const values = { records: merged.records, tasks: merged.tasks, taskTrash: merged.taskTrash, taskCompletions: merged.taskCompletions, countdowns: merged.countdowns, settings: merged.settings, selectedTask: selection };
      const previous = new Map();
      try {
        for (const key of Object.keys(values)) previous.set('studywithyorushika.' + key, localStorage.getItem('studywithyorushika.' + key));
        for (const [key, value] of Object.entries(values)) localStorage.setItem('studywithyorushika.' + key, JSON.stringify(value));
      } catch {
        for (const [key, value] of previous) {
          try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {}
        }
        invalid('浏览器暂时无法保存备份，请检查可用空间后重试。原记录已保留。');
      }
      records = merged.records; tasks = merged.tasks; taskTrash = merged.taskTrash; taskCompletions = merged.taskCompletions; settings = merged.settings; selectedTask = selection;
      clearPreview();
      renderTasks(); renderStats(); renderTimer();
      if ($('#calendar-content')) renderCalendar();
      window.dispatchEvent(new Event('study-data-imported'));
      status('导入完成，已与现有记录合并。重复数据不会再次累计。', 'success');
      toast('记录已导入。');
    } catch (error) { status(error.message || '导入未完成，原记录已保留。', 'error'); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || readOnly()) return;
    if (button.id === 'import-data') { if (!reading) $('#import-file')?.click(); }
    else if (button.id === 'confirm-import') applyImport();
    else if (button.id === 'cancel-import') { clearPreview(); status('已取消导入，原记录保持不变。'); $('#import-data')?.focus({ preventScroll: true }); }
  });
  document.addEventListener('change', event => {
    if (event.target.id !== 'import-file') return;
    const file = event.target.files?.[0];
    event.target.value = '';
    readFile(file);
  });
})();
