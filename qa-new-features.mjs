import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readdir, stat, mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5173/';
const root = new URL('./', import.meta.url);
const out = 'test-results';
const checks = [], errors = [], screenshots = [];
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const archives = async () => Object.fromEntries(await Promise.all((await readdir(root)).filter(name => /\.(zip|tar|tar\.gz|tgz)$/i.test(name)).sort().map(async name => {
  const info = await stat(new URL(name, root), { bigint: true });
  return [name, { size: String(info.size), mtimeNs: String(info.mtimeNs) }];
})));
async function originalFiles(directory) {
  const result = {};
  async function visit(location, prefix = '') {
    for (const entry of await readdir(location, { withFileTypes: true })) {
      const path = new URL(encodeURIComponent(entry.name) + (entry.isDirectory() ? '/' : ''), location);
      if (entry.isDirectory()) await visit(path, prefix + entry.name + '/');
      else {
        const info = await stat(path, { bigint: true });
        result[prefix + entry.name] = { size: String(info.size), mtimeNs: String(info.mtimeNs) };
      }
    }
  }
  await visit(new URL(directory + '/', root));
  return result;
}
const before = { archives: await archives(), music: await originalFiles('music'), video: await originalFiles('video') };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Hong_Kong' });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const ready = async target => {
  await target.waitForFunction(() => window.studyMedia?.tracks.length >= 1 && window.studyCountdown && window.studyIdle && ownsSession);
  await target.waitForFunction(() => { const video = document.querySelector('#background-video'); return video.readyState >= 2 && !video.paused; });
};
const settled = async target => target.waitForFunction(() => {
  const panel = document.querySelector('#feature-panel');
  return !panel.hidden && !panel.inert && panel.getAnimations().length === 0;
});
const menu = async target => {
  await target.mouse.move(2, 2);
  if (await target.locator('#feature-toggle').getAttribute('aria-expanded') !== 'true') await target.locator('#feature-toggle').click();
  await settled(target);
};
const tab = async (target, name) => {
  await menu(target);
  await target.locator(`[data-panel-tab="${name}"]`).click();
  assert.equal(await target.locator(`[data-panel-tab="${name}"]`).getAttribute('aria-pressed'), 'true');
};
const shot = async (target, name) => {
  await target.waitForTimeout(250);
  const path = out + '/' + name + '.png';
  await target.screenshot({ path, fullPage: true });
  screenshots.push(path);
};
const noOverflow = async target => {
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, 'No document overflow');
  const box = await target.locator('#feature-panel').boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0, JSON.stringify(box));
  assert.equal(await target.locator('.feature-views').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'Panel content has no horizontal overflow');
};
const saved = async (target, key) => target.evaluate(key => JSON.parse(localStorage.getItem('studywithyorushika.' + key)), key);
const wav = name => {
  const sampleRate = 16000, samples = sampleRate * 12, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 220 / sampleRate) * 350), 44 + i * 2);
  return { name: name + '.wav', mimeType: 'audio/wav', buffer };
};
let failed;
try {
  if (!process.argv.includes('--screens-only')) {
  await context.addInitScript(() => {
    if (localStorage.getItem('qa.newFeaturesSeeded')) return;
    localStorage.clear();
    localStorage.setItem('qa.newFeaturesSeeded', 'true');
    localStorage.setItem('studywithyorushika.background', JSON.stringify('image:forest'));
    localStorage.setItem('studywithyorushika.scene', JSON.stringify('forest'));
    localStorage.setItem('studywithyorushika.tasks', JSON.stringify([{ id: 'legacy-done', text: '旧版已完成任务，没有记录时间', done: true }, { id: 'legacy-open', text: '旧版未完成任务', done: false }]));
    const day = new Date(); day.setDate(day.getDate() - 2); day.setHours(15, 30, 0, 0);
    localStorage.setItem('studywithyorushika.taskCompletions', JSON.stringify([{ id: 'archived-before', text: '前两天完成的阅读', completedAt: day.getTime() }]));
  });
  await page.goto(origin); await ready(page);
  const presetIds = await page.evaluate(() => studyMedia.tracks.filter(t => !t.local).map(t => t.id));
  assert.ok(presetIds.length > 0);
  assert.match(await saved(page, 'background'), /^video:/);
  await tab(page, 'scenes');
  assert.equal(await page.locator('[data-scene-select],.scene-option,.scene-options').count(), 0);
  const sceneText = await page.locator('#modal-content').innerText();
  assert.ok(!/静态风景|山湖之间|林间来信|雾色留白|静夜微光|Unsplash/.test(sceneText), sceneText);
  assert.equal(await page.locator('[data-video-select]').count(), await page.evaluate(() => studyMedia.videos.length));
  assert.ok(await page.locator('[data-video-select].selected').count() === 1);
  await shot(page, 'new-features-desktop-video');
  pass('Legacy image background migrates to the provided video; scene selector contains only manifest videos');

  await tab(page, 'tasks');
  assert.equal(await page.locator('#task-total-completed').innerText(), '2');
  await page.locator('[data-task-tab="history"]').click();
  assert.ok((await page.locator('#task-history-list').innerText()).includes('日期未记录'));
  assert.equal(await page.locator('#task-history-list .task-date-group').count(), 2);
  assert.equal((await saved(page, 'taskCompletions')).filter(item => item.id === 'legacy-done').length, 1);
  await page.reload(); await ready(page); await tab(page, 'tasks');
  assert.equal(await page.locator('#task-total-completed').innerText(), '2');
  assert.equal((await saved(page, 'taskCompletions')).filter(item => item.id === 'legacy-done').length, 1);
  pass('Old completed task migrates once with unknown date and persists after reload without fabricated timestamps');

  await page.locator('#task-input').fill('QA 今天完成并归档的任务');
  await page.locator('#task-input').press('Enter');
  let tasks = await saved(page, 'tasks');
  const completedId = tasks.find(item => item.text === 'QA 今天完成并归档的任务').id;
  await page.locator(`[data-check="${completedId}"]`).click();
  const firstCompletion = (await saved(page, 'taskCompletions')).find(item => item.id === completedId).completedAt;
  await page.locator(`[data-check="${completedId}"]`).click();
  await page.locator(`[data-check="${completedId}"]`).click();
  let completions = await saved(page, 'taskCompletions');
  assert.equal(completions.filter(item => item.id === completedId).length, 1);
  assert.equal(completions.find(item => item.id === completedId).completedAt, firstCompletion);
  assert.equal(await page.locator('#task-total-completed').innerText(), '3');
  assert.equal(await page.locator('#task-today-completed').innerText(), '1');
  await page.locator(`[data-delete="${completedId}"]`).click();
  assert.equal((await saved(page, 'tasks')).some(item => item.id === completedId), false);
  assert.equal((await saved(page, 'taskTrash')).find(item => item.id === completedId).done, true);
  assert.equal(await page.locator('#task-total-completed').innerText(), '3');
  await page.locator('[data-task-tab="trash"]').click();
  await page.locator(`[data-restore-task="${completedId}"]`).click();
  assert.equal((await saved(page, 'tasks')).find(item => item.id === completedId).done, true);
  await page.locator('[data-task-tab="active"]').click();
  await page.locator('[data-delete="legacy-open"]').click();
  await page.locator('[data-task-tab="trash"]').click();
  await page.locator('[data-restore-task="legacy-open"]').click();
  assert.equal((await saved(page, 'tasks')).find(item => item.id === 'legacy-open').done, false);
  await page.locator('[data-task-tab="active"]').click();
  await page.locator('#clear-completed').click();
  assert.equal((await saved(page, 'tasks')).filter(item => item.done).length, 0);
  assert.equal((await saved(page, 'taskTrash')).filter(item => item.done).length, 2);
  assert.equal(await page.locator('#task-total-completed').innerText(), '3');
  await page.locator('[data-task-tab="history"]').click();
  assert.equal(await page.locator('#task-history-list .task-date-group').count(), 3);
  await shot(page, 'new-features-desktop-history');
  await page.reload(); await ready(page); await tab(page, 'tasks');
  assert.equal(await page.locator('#task-total-completed').innerText(), '3');
  assert.equal((await saved(page, 'taskTrash')).length, 2);
  pass('Completions count each task once, retain first date through rechecking/deleting/clearing, group by date, and trash restores original state');

  await tab(page, 'countdown');
  const days = await page.evaluate(() => [-2, 0, 5].map(offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }));
  const addDate = async (name, date, note = '') => {
    await page.locator('#countdown-add').click();
    await page.locator('#countdown-name').fill(name);
    await page.locator('#countdown-date').fill(date);
    await page.locator('#countdown-note').fill(note);
    await page.locator('#countdown-save').click();
  };
  await page.locator('#countdown-add').click();
  await page.locator('#countdown-save').click();
  assert.equal(await page.locator('#countdown-error').isVisible(), true);
  await page.locator('#countdown-cancel').click();
  await addDate('已经走过的日子', days[0]);
  await addDate('就是今天的期待', days[1]);
  await addDate('下一场旅行 <script>', days[2], '带上一本书，慢慢出发。');
  const dates = await saved(page, 'countdowns');
  const past = dates.find(item => item.name === '已经走过的日子'), today = dates.find(item => item.name === '就是今天的期待'), future = dates.find(item => item.name === '下一场旅行 <script>');
  assert.equal(await page.locator(`[data-countdown-id="${past.id}"] .countdown-distance`).getAttribute('aria-label'), '已过去 2 天');
  assert.equal(await page.locator(`[data-countdown-id="${today.id}"] .countdown-distance`).getAttribute('aria-label'), '就是今天');
  assert.equal(await page.locator(`[data-countdown-id="${future.id}"] .countdown-distance`).getAttribute('aria-label'), '还有 5 天');
  assert.equal(await page.locator('#countdown-list script').count(), 0);
  await page.locator(`[data-countdown-edit="${future.id}"]`).click();
  await page.locator('#countdown-name').fill('下一场旅行，改好日期');
  await page.locator('#countdown-date').fill(days[1]);
  await page.locator('#countdown-save').click();
  assert.equal(await page.locator(`[data-countdown-id="${future.id}"] .countdown-distance`).getAttribute('aria-label'), '就是今天');
  await page.locator(`[data-countdown-delete="${future.id}"]`).click();
  assert.equal(await page.locator(`[data-countdown-id="${future.id}"]`).count(), 0);
  await page.locator('#countdown-undo-button').click();
  assert.equal(await page.locator(`[data-countdown-id="${future.id}"] h3`).innerText(), '下一场旅行，改好日期');
  await page.locator(`[data-countdown-delete="${past.id}"]`).click();
  await page.reload(); await ready(page); await tab(page, 'countdown');
  assert.equal(await page.locator('.countdown-card').count(), 2);
  assert.equal(await page.locator(`[data-countdown-id="${past.id}"]`).count(), 0);
  assert.equal(await page.locator(`[data-countdown-id="${future.id}"] h3`).innerText(), '下一场旅行，改好日期');
  await shot(page, 'new-features-desktop-countdown');
  pass('Countdown handles past/today/future calendar dates, validation, escaped text, edit/delete/undo, and reload persistence');

  await page.locator('#feature-close').click();
  await page.waitForFunction(() => document.querySelector('#feature-panel').hidden);
  await page.locator('#music-toggle').click();
  await page.waitForFunction(() => !document.querySelector('#bgm-audio').paused && document.querySelector('#bgm-audio').currentTime > .05);
  await page.locator('#music-list-open').click();
  assert.equal(await page.locator('[data-remove-track]').count(), 0);
  await page.locator('#music-file').setInputFiles([wav('QA-device-A'), wav('QA-device-B')]);
  assert.equal(await page.locator('[data-remove-track]').count(), 2);
  assert.equal(await page.locator('#music-playlist button button').count(), 0);
  let locals = await page.evaluate(() => studyMedia.tracks.filter(t => t.local).map(t => ({ id: t.id, title: t.title, src: t.src })));
  const localA = locals.find(t => t.title === 'QA-device-A'), localB = locals.find(t => t.title === 'QA-device-B');
  const playingPreset = await page.evaluate(() => ({ title: document.querySelector('#music-title').textContent, src: document.querySelector('#bgm-audio').src, time: document.querySelector('#bgm-audio').currentTime }));
  await page.locator(`[data-remove-track="${localB.id}"]`).click();
  assert.equal(await page.evaluate(() => studyMedia.tracks.some(t => t.title === 'QA-device-A')), true);
  assert.equal(await page.locator('#music-title').innerText(), playingPreset.title);
  assert.equal(await page.locator('#bgm-audio').evaluate(a => a.src), playingPreset.src);
  assert.equal(await page.locator('#bgm-audio').evaluate(a => a.paused), false);
  await page.locator('#music-file').setInputFiles([wav('QA-device-B')]);
  await page.locator(`[data-track="${localA.id}"]`).click();
  await page.waitForFunction(() => { const a = document.querySelector('#bgm-audio'); return document.querySelector('#music-title').textContent === 'QA-device-A' && !a.paused && a.readyState >= 1 && a.currentTime > .05; });
  await page.locator(`[data-remove-track="${localA.id}"]`).click();
  await page.waitForFunction(() => { const a = document.querySelector('#bgm-audio'); return document.querySelector('#music-title').textContent === 'QA-device-B' && !a.paused && a.readyState >= 1 && a.currentTime > .05; });
  locals = await page.evaluate(() => studyMedia.tracks.filter(t => t.local).map(t => ({ id: t.id, title: t.title })));
  assert.equal(locals.length, 1);
  await page.locator(`[data-remove-track="${locals[0].id}"]`).click();
  await page.waitForFunction(() => !document.querySelector('#bgm-audio').paused && studyMedia.tracks.every(t => !t.local));
  assert.deepEqual(await page.evaluate(() => studyMedia.tracks.map(t => t.id)), presetIds);
  assert.equal(await page.locator('[data-remove-track]').count(), 0);
  await page.locator('#music-list-open').click();
  await tab(page, 'timer');
  await page.locator('#toggle-timer').click();
  const continuity = await page.evaluate(() => { window.qaAudio = document.querySelector('#bgm-audio'); window.qaVideo = document.querySelector('#background-video'); return { audioTime: qaAudio.currentTime, videoTime: qaVideo.currentTime, remaining: timer.remaining }; });
  await tab(page, 'countdown'); await tab(page, 'tasks');
  await page.waitForTimeout(1200);
  const later = await page.evaluate(() => ({ sameAudio: document.querySelector('#bgm-audio') === qaAudio, sameVideo: document.querySelector('#background-video') === qaVideo, audioTime: qaAudio.currentTime, videoTime: qaVideo.currentTime, remaining: timer.remaining, running: timer.running, paused: qaAudio.paused, videoPaused: qaVideo.paused }));
  assert.ok(later.sameAudio && later.sameVideo && later.running && !later.paused && !later.videoPaused);
  assert.ok(later.audioTime > continuity.audioTime && later.videoTime > continuity.videoTime && later.remaining < continuity.remaining);
  pass('Only device uploads get sibling delete buttons; deleting noncurrent/current/last local songs preserves remaining media, preset songs, timer and video');
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Hong_Kong' });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.addInitScript(() => {
    const d = new Date(); d.setDate(d.getDate() + 20);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('studywithyorushika.countdowns', JSON.stringify([{ id: 'mobile-date', name: '一起去听下一场演唱会，顺便去海边散步', date, note: '把喜欢的歌带到旅途里，给期待留一点空间。' }]));
    localStorage.setItem('studywithyorushika.tasks', JSON.stringify([{ id: 'mobile-done', text: '读完一直想读的那本书，再认真写下一段笔记', done: true, completedAt: Date.now() }]));
    localStorage.setItem('studywithyorushika.taskTrash', JSON.stringify([{ id: 'mobile-trash', text: '一个名字比较长的垃圾桶事项，用来检查恢复按钮', done: false, deletedAt: Date.now() }]));
  });
  await mobile.goto(origin); await ready(mobile);
  for (const [name, suffix] of [['scenes', 'video'], ['countdown', 'countdown'], ['tasks', 'tasks']]) {
    await tab(mobile, name);
    if (name === 'tasks') await mobile.locator('[data-task-tab="history"]').tap();
    await noOverflow(mobile);
    await shot(mobile, 'new-features-mobile-' + suffix);
  }
  await mobile.locator('[data-task-tab="trash"]').tap();
  assert.equal(await mobile.locator('[data-task-tab="trash"]').getAttribute('aria-pressed'), 'true');
  await noOverflow(mobile);
  await shot(mobile, 'new-features-mobile-trash');
  await mobile.locator('[data-restore-task="mobile-trash"]').tap();
  assert.equal((await saved(mobile, 'tasks')).find(t => t.id === 'mobile-trash').done, false);
  await mobileContext.close();
  pass('390px mobile video selector, countdown, completion history and trash have no viewport or panel overflow; restore remains usable');
  assert.deepEqual(errors, []);
  pass('No page JavaScript exceptions');
} catch (error) {
  failed = error;
  console.error(error.stack);
  try { await shot(page, 'new-features-failure'); } catch {}
} finally {
  await browser.close();
  assert.deepEqual(await archives(), before.archives, 'Existing archive metadata remains unchanged');
  assert.deepEqual(await originalFiles('music'), before.music, 'Original music remains unchanged');
  assert.deepEqual(await originalFiles('video'), before.video, 'Original video remains unchanged');
  pass('Existing ZIP/TAR metadata and original music/video files remain unchanged');
}
console.log(JSON.stringify({ checks: checks.length, errors, screenshots, archiveCount: Object.keys(before.archives).length }, null, 2));
if (failed) throw failed;
