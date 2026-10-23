import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5173/';
const workspace = new URL('./', import.meta.url);
const out = 'test-results';
const checks = [], errors = [], screenshots = [], contexts = [];
const pass = message => { checks.push(message); console.log('PASS ' + message); };
async function preservedFiles(directory = workspace, prefix = '') {
  const found = {};
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory()) {
      if (!prefix && !['music', 'video'].includes(item.name)) continue;
      Object.assign(found, await preservedFiles(new URL(encodeURIComponent(item.name) + '/', directory), name + '/'));
    } else if (prefix || /\.(zip|tar|tar\.gz|tgz)$/i.test(item.name)) {
      const info = await stat(new URL(encodeURIComponent(item.name), directory), { bigint: true });
      found[name] = { size: String(info.size), mtimeNs: String(info.mtimeNs) };
    }
  }
  return found;
}
const beforeFiles = await preservedFiles();
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
async function newContext(seed = null, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, timezoneId: 'Asia/Hong_Kong', ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  context.setDefaultTimeout(10000);
  contexts.push(context);
  if (seed) await context.addInitScript(seed => {
    if (localStorage.getItem('qa.import.seeded')) return;
    localStorage.clear();
    for (const [key, value] of Object.entries(seed)) localStorage.setItem('studywithyorushika.' + key, JSON.stringify(value));
    localStorage.setItem('qa.import.seeded', 'true');
  }, seed);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await ready(page);
  return { context, page };
}
async function ready(page) {
  await page.waitForFunction(() => window.studyCountdown && window.studyMedia?.tracks.length > 0 && ownsSession);
}
async function menu(page) {
  await page.mouse.move(2, 2);
  if (await page.locator('#feature-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#feature-toggle').click();
  await page.waitForFunction(() => { const panel = document.querySelector('#feature-panel'); return !panel.hidden && !panel.inert && !panel.getAnimations().length; });
}
async function tab(page, name) {
  await menu(page);
  await page.locator(`[data-panel-tab="${name}"]`).click();
  assert.equal(await page.locator(`[data-panel-tab="${name}"]`).getAttribute('aria-pressed'), 'true');
}
async function history(page) {
  await tab(page, 'stats');
  await page.locator('[data-dialog="stats"]').click();
  await page.locator('#export-data').waitFor({ state: 'visible' });
}
async function exported(page) {
  await history(page);
  const waiting = page.waitForEvent('download');
  await page.locator('#export-data').click();
  const download = await waiting;
  assert.match(download.suggestedFilename(), /studywithyorushika.*\.json$/);
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}
async function snapshot(page) {
  return page.evaluate(() => ({ records: structuredClone(records), tasks: structuredClone(tasks), taskTrash: structuredClone(taskTrash), taskCompletions: structuredClone(taskCompletions), countdowns: JSON.parse(localStorage.getItem('studywithyorushika.countdowns') || '[]'), settings: structuredClone(settings) }));
}
async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('studywithyorushika.'))));
}
async function shot(page, name) {
  const path = `${out}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, 'No viewport overflow');
  assert.equal(await page.locator('.feature-views').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'No horizontal panel-content overflow');
}
// Filled after the implementation has settled; no source edits or archive generation.
async function importBackup(page, payload, { confirm = true, name = 'studywithyorushika-records.json' } = {}) {
  await history(page);
  const input = page.locator('#import-file');
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)) });
  if (confirm) {
    await page.locator('#confirm-import').waitFor({ state: 'visible' });
    await page.locator('#confirm-import').click();
    await page.locator('#confirm-import').waitFor({ state: 'hidden' });
  }
}

let failure;
try {
  const createdAt = new Date(2026, 9, 19, 9, 0).getTime();
  const completedAt = new Date(2026, 9, 20, 14, 30).getTime();
  const deletedAt = new Date(2026, 9, 21, 11, 0).getTime();
  const seed = {
    records: { '2026-10-20': { seconds: 3600, sessions: 2 }, '2026-10-21': { seconds: 1800, sessions: 1 } },
    tasks: [{ id: 'source-active', text: '继续读完喜欢的书', done: false, createdAt }, { id: 'source-done', text: '完成第一章复习', done: true, createdAt, completedAt }],
    taskTrash: [{ id: 'source-trash', text: '归档的练习题', done: true, createdAt, completedAt, deletedAt }],
    taskCompletions: [{ id: 'source-done', text: '完成第一章复习', createdAt, completedAt }, { id: 'source-trash', text: '归档的练习题', createdAt, completedAt }, { id: 'source-history', text: '一直以来完成的任务', createdAt, completedAt: createdAt + 60000 }],
    countdowns: [{ id: 'source-countdown', name: '下一场旅行', date: '2026-11-07', note: '带上一本书，慢慢出发。' }, { id: 'source-past', name: '开始学习的日子', date: '2026-10-01', note: '' }],
    settings: { focus: 35, break: 7, goal: 180, chime: false, autoBreak: true }
  };
  if (!process.argv.includes('--fonts-only')) {
  const { page: source } = await newContext(seed);
  const backup = await exported(source);
  for (const key of ['exportedAt', 'records', 'tasks', 'taskTrash', 'taskCompletions', 'countdowns', 'settings']) assert.ok(Object.hasOwn(backup, key));
  const expected = await snapshot(source);
  pass('Existing UI exports records, active tasks, trash, completion history, countdowns and settings as JSON');

  const { context: targetContext, page: target } = await newContext({ tasks: [], taskTrash: [], taskCompletions: [], records: {}, countdowns: [] });
  const beforePreview = await storageSnapshot(target);
  await importBackup(target, backup, { confirm: false });
  await target.locator('#confirm-import').waitFor({ state: 'visible' });
  assert.deepEqual(await storageSnapshot(target), beforePreview);
  await shot(target, 'import-preview-desktop');
  await target.locator('#cancel-import').click();
  await target.locator('#confirm-import').waitFor({ state: 'hidden' });
  assert.deepEqual(await storageSnapshot(target), beforePreview);
  pass('Choosing a file only previews it; cancelling the preview leaves existing data untouched');
  await importBackup(target, backup);
  assert.deepEqual(await snapshot(target), expected);
  await target.reload(); await ready(target);
  assert.deepEqual(await snapshot(target), expected);
  await tab(target, 'countdown');
  assert.equal(await target.locator('.countdown-card').count(), 2);
  assert.match(await target.locator('#countdown-list').innerText(), /下一场旅行/);
  await tab(target, 'tasks');
  assert.equal(await target.locator('#task-total-completed').innerText(), '3');
  await target.locator('[data-task-tab="trash"]').click();
  assert.match(await target.locator('#task-trash-list').innerText(), /归档的练习题/);
  await target.locator('[data-task-tab="history"]').click();
  assert.match(await target.locator('#task-history-list').innerText(), /2026 年 10 月 20 日/);
  pass('Roundtrip into another browser context restores all six data sections and survives reload, including countdown view and date-grouped task history');

  await importBackup(target, backup);
  assert.deepEqual(await snapshot(target), expected);
  pass('Reimporting the same backup preserves totals and counts without duplicating records, tasks, history or countdowns');

  const { context: mergeContext, page: mergePage } = await newContext(seed);
  await importBackup(mergePage, {
    ...backup,
    records: { '2026-10-20': { seconds: 1800, sessions: 4 }, '2026-10-21': { seconds: 2400, sessions: 0 } },
    tasks: [{ id: 'source-trash', text: '备份里尚未删除的旧任务', done: false, createdAt }, { id: 'merge-new-active', text: '另一份备份新增的任务', done: false, createdAt }],
    taskTrash: [{ id: 'source-active', text: '备份里已经删除的任务', done: false, createdAt, deletedAt }, { id: 'merge-new-trash', text: '另一份备份的垃圾桶任务', done: false, createdAt, deletedAt }],
    countdowns: [{ id: 'source-countdown', name: '备份里的旧名称', date: '2026-12-01', note: '' }, { id: 'merge-new-countdown', name: '新加入的期待', date: '2026-12-31', note: '' }]
  });
  const merged = await snapshot(mergePage);
  assert.deepEqual(merged.records['2026-10-20'], { seconds: 3600, sessions: 4 });
  assert.deepEqual(merged.records['2026-10-21'], { seconds: 2400, sessions: 1 });
  assert.ok(merged.taskTrash.some(item => item.id === 'source-trash'));
  assert.ok(!merged.tasks.some(item => item.id === 'source-trash'));
  assert.ok(merged.tasks.some(item => item.id === 'source-active'));
  assert.ok(!merged.taskTrash.some(item => item.id === 'source-active'));
  assert.ok(merged.tasks.some(item => item.id === 'merge-new-active'));
  assert.ok(merged.taskTrash.some(item => item.id === 'merge-new-trash'));
  assert.equal(merged.countdowns.find(item => item.id === 'source-countdown').name, '下一场旅行');
  assert.ok(merged.countdowns.some(item => item.id === 'merge-new-countdown'));
  await mergeContext.close();
  pass('Merge takes per-day maxima, preserves current task/trash placement and countdown edits, and adds distinct IDs');

  const legacy = { records: { '2026-10-18': { seconds: 1200, sessions: 1 } }, tasks: [{ id: 'legacy-completed', text: '旧版没有时间戳的任务', done: true }], settings: { focus: 25, break: 5, goal: 120, chime: true, autoBreak: false } };
  await importBackup(target, legacy);
  const legacyResult = await snapshot(target);
  assert.ok(legacyResult.records['2026-10-18']);
  assert.equal(legacyResult.taskCompletions.filter(item => item.id === 'legacy-completed').length, 1);
  assert.equal(legacyResult.countdowns.length, expected.countdowns.length);
  assert.equal(legacyResult.taskTrash.length, expected.taskTrash.length);
  await tab(target, 'tasks');
  await target.locator('[data-task-tab="history"]').click();
  assert.match(await target.locator('#task-history-list').innerText(), /日期未记录/);
  pass('Older exports without trash, completion history or countdowns import compatibly and retain existing optional data; old completions retain an unknown date');

  for (const invalid of ['{broken JSON', '[]', '{}', JSON.stringify({ ...backup, records: { '2026-02-30': { seconds: 120, sessions: 1 } } }), JSON.stringify({ ...backup, records: { '2026-10-20': { seconds: -120, sessions: 1 } } })]) {
    const before = await storageSnapshot(target);
    await importBackup(target, invalid, { confirm: false });
    await target.waitForTimeout(150);
    assert.deepEqual(await storageSnapshot(target), before);
    assert.equal(await target.locator('#confirm-import').isVisible(), false);
  }
  pass('Malformed JSON, invalid root/schema, impossible record dates and negative totals are rejected before any stored state changes');

  await tab(target, 'timer');
  await target.locator('[data-mode="stopwatch"]').click();
  await target.locator('#toggle-timer').click();
  await target.waitForTimeout(1100);
  const runningBefore = await target.evaluate(() => ({ mode: timer.mode, elapsed: timer.elapsed, total: timer.total, today: records[dayKey()]?.seconds || 0, old: records['2026-10-20'].seconds }));
  await importBackup(target, backup);
  const runningAfter = await target.evaluate(() => ({ running: timer.running, mode: timer.mode, elapsed: timer.elapsed, total: timer.total, today: records[dayKey()]?.seconds || 0, old: records['2026-10-20'].seconds }));
  assert.equal(runningAfter.running, true);
  assert.equal(runningAfter.mode, runningBefore.mode);
  assert.equal(runningAfter.total, runningBefore.total);
  assert.ok(runningAfter.elapsed >= runningBefore.elapsed);
  assert.ok(runningAfter.today >= runningBefore.today);
  assert.equal(runningAfter.old, runningBefore.old);
  await tab(target, 'timer'); await target.locator('#toggle-timer').click();
  pass('Import during a running timer preserves its mode, progress and session; existing daily totals are not summed twice');

  const second = await targetContext.newPage();
  second.on('pageerror', error => errors.push(error.message));
  await second.goto(origin);
  await second.waitForFunction(() => document.body.dataset.readonly === 'true');
  await second.evaluate(() => openDialog('stats'));
  assert.equal(await second.locator('#import-data').isDisabled(), true);
  const beforeReadOnly = await storageSnapshot(second);
  await second.locator('#import-file').setInputFiles({ name: 'attempt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await second.waitForTimeout(200);
  assert.deepEqual(await storageSnapshot(second), beforeReadOnly);
  assert.equal(await second.locator('#confirm-import').isVisible(), false);
  await second.close();
  pass('A second tab remains read-only: import controls are disabled and a programmatic file-change attempt cannot write');
  }

  const fonts = {};
  for (const [mobile, label] of [[false, 'desktop'], [true, 'mobile']]) {
    const { context, page } = await newContext(seed, mobile);
    await history(page);
    await noOverflow(page);
    fonts[label] = await page.evaluate(() => Object.fromEntries(['[data-panel-tab="timer"]', '#export-data', '#import-data', '.calendar-day', '#music-title'].filter(selector => document.querySelector(selector)).map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));
    console.log('FONT ' + label + ' ' + JSON.stringify(fonts[label]));
    assert.ok(fonts[label]['[data-panel-tab="timer"]'] >= (mobile ? 11 : 12));
    assert.ok(fonts[label]['#export-data'] >= 11);
    if (!process.argv.includes('--fonts-only')) assert.ok(fonts[label]['#import-data'] >= 11);
    assert.ok(fonts[label]['.calendar-day'] >= 12);
    assert.ok(fonts[label]['#music-title'] >= 13);
    await page.locator('#export-data').scrollIntoViewIfNeeded();
    await shot(page, `import-records-${label}`);
    if (mobile && await page.locator('#import-data').count()) {
      const beforePreview = await storageSnapshot(page);
      await importBackup(page, seed, { confirm: false, name: 'studywithyorushika-来自另一个设备的专注记录备份.json' });
      await page.locator('#confirm-import').waitFor({ state: 'visible' });
      assert.deepEqual(await storageSnapshot(page), beforePreview);
      await noOverflow(page);
      await page.locator('#confirm-import').scrollIntoViewIfNeeded();
      await shot(page, 'import-preview-mobile');
      await page.locator('#cancel-import').click();
      assert.deepEqual(await storageSnapshot(page), beforePreview);
    }
    await tab(page, 'tasks'); await noOverflow(page);
    const taskFont = await page.locator('.task-label').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(taskFont >= 13);
    await shot(page, `larger-type-tasks-${label}`);
    await tab(page, 'settings'); await noOverflow(page);
    await shot(page, `larger-type-settings-${label}`);
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 740 });
      await noOverflow(page);
      await tab(page, 'tasks'); await noOverflow(page);
      await page.locator('#feature-close').click();
      await page.waitForFunction(() => document.querySelector('#feature-panel').hidden);
      await page.locator('#music-title').evaluate(el => { el.textContent = '这是一个用于验证窄屏排版的很长很长的歌曲名称'; });
      const geometry = await page.locator('#music-player').evaluate(el => {
        const player = el.getBoundingClientRect(), title = el.querySelector('#music-title'), progress = el.querySelector('#music-progress').getBoundingClientRect();
        return { left: player.left, right: player.right, width: player.width, titleEllipsis: getComputedStyle(title).textOverflow, progress: progress.width, overflow: el.scrollWidth > el.clientWidth + 1 };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= 320 && !geometry.overflow && geometry.progress > 10, JSON.stringify(geometry));
      assert.equal(geometry.titleEllipsis, 'ellipsis');
      await shot(page, 'larger-type-320px-player');
    }
    await context.close();
  }
  pass('Larger UI text remains readable on 1440px desktop and 390px touch layouts with no viewport or horizontal panel overflow');
  console.log(JSON.stringify({ fonts }, null, 2));
  assert.deepEqual(errors, [], 'No page JavaScript exceptions');
  pass('No page JavaScript exceptions');
} catch (error) {
  failure = error;
  console.error(error.stack);
} finally {
  await browser.close();
  assert.deepEqual(await preservedFiles(), beforeFiles, 'Original music/video files and ZIP/TAR archive sizes/timestamps unchanged');
  pass('Original music/video files and all ZIP/TAR archives remain unchanged');
}
console.log(JSON.stringify({ checks: checks.length, errors, screenshots }, null, 2));
if (failure) throw failure;
