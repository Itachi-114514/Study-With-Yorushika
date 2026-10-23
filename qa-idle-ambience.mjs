import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readdir, stat, mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5173/';
const out = 'test-results';
const root = new URL('./', import.meta.url);
const checks = [], errors = [];
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const archives = async () => Object.fromEntries(await Promise.all((await readdir(root)).filter(name => /\.(zip|tar|tar\.gz|tgz)$/i.test(name)).sort().map(async name => {
  const info = await stat(new URL(name, root), { bigint: true });
  return [name, { size: String(info.size), mtimeNs: String(info.mtimeNs) }];
})));
const beforeArchives = await archives();
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const ready = async target => {
  await target.waitForFunction(() => window.studyMedia?.tracks.length === 8 && window.studyIdle?.delay === 6000);
  await target.waitForFunction(() => document.querySelector('#background-video').readyState >= 2 && !document.querySelector('#background-video').paused);
  console.log('VIDEO_INITIAL ' + JSON.stringify(await target.locator('#background-video').evaluate(v => ({ hidden: v.hidden, opacity: getComputedStyle(v).opacity, zIndex: getComputedStyle(v).zIndex, videoLoading: document.body.classList.contains('video-loading'), width: v.videoWidth, currentTime: v.currentTime, style: v.getAttribute('style'), landscapeZIndex: getComputedStyle(document.querySelector('.landscape')).zIndex }))));
  await target.waitForFunction(() => { const v = document.querySelector('#background-video'); return !v.hidden && getComputedStyle(v).opacity === '1' && v.currentTime > .25; });
};
const moveAway = async target => {
  await target.locator('body').evaluate(() => document.activeElement?.blur());
  await target.mouse.move(1250, 850);
};
const open = async () => {
  if (!await page.locator('#feature-panel').isVisible()) await page.locator('#feature-toggle').click();
};
const tab = async name => { await open(); await page.locator(`[data-panel-tab="${name}"]`).click(); };
const hidden = async target => {
  assert.equal(await target.evaluate(() => document.body.classList.contains('ui-idle')), true);
  // CSS compositor transitions use wall time even when timers are advanced.
  await target.waitForFunction(() => { const style = getComputedStyle(document.querySelector('#scene-title')); return style.opacity === '0' && style.visibility === 'hidden'; });
  assert.equal(await target.evaluate(() => ['feature-toggle', 'feature-panel', 'music-player', 'scene-title', 'zen-exit'].every(id => document.getElementById(id).inert)), true);
  assert.equal(await target.locator('#music-player').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
};
const shown = async target => {
  await target.waitForFunction(() => !document.body.classList.contains('ui-idle'));
  assert.equal(await target.locator('#feature-toggle').evaluate(el => el.inert), false);
  assert.equal(await target.locator('#music-player').evaluate(el => el.inert), false);
};
let failed;
try {
  await page.goto(origin);
  await ready(page);
  await page.mouse.move(1000, 700);
  assert.equal(await page.locator('#scene-title').textContent(), 'Study With Yorushika');
  const title = await page.locator('#scene-title').boundingBox();
  assert.ok(Math.abs(title.x + title.width / 2 - 720) < 2, 'Title is horizontally centered');
  assert.ok(title.y + title.height / 2 > 1050 * .25 && title.y + title.height / 2 < 1050 * .4, 'Title center is in the upper middle of the screen');
  assert.equal(await page.evaluate(() => [document.documentElement, document.body, document.querySelector('.landscape'), document.querySelector('#background-video')].every(el => getComputedStyle(el).filter === 'none' && getComputedStyle(el).backdropFilter === 'none')), true);
  assert.equal(await page.locator('.scene-wash').count(), 0);
  await page.screenshot({ path: out + '/title-home.png', fullPage: true });
  pass('centered upper title and clear fullscreen video without a page filter');

  if (!process.argv.includes('--remaining') && !process.argv.includes('--audio')) {
  await tab('timer');
  await page.locator('#toggle-timer').click();
  await page.locator('#feature-close').click();
  await page.locator('#music-toggle').click();
  await page.waitForFunction(() => !document.querySelector('#bgm-audio').paused && document.querySelector('#bgm-audio').currentTime > .05);
  await moveAway(page);
  const progress = await page.evaluate(() => ({ video: document.querySelector('#background-video').currentTime, audio: document.querySelector('#bgm-audio').currentTime, remaining: timer.remaining }));
  await page.waitForTimeout(6800);
  await hidden(page);
  const later = await page.evaluate(() => ({ video: document.querySelector('#background-video').currentTime, audio: document.querySelector('#bgm-audio').currentTime, remaining: timer.remaining, videoPaused: document.querySelector('#background-video').paused, audioPaused: document.querySelector('#bgm-audio').paused, running: timer.running }));
  assert.ok(later.audio > progress.audio + 5, 'Music keeps playing when UI hides');
  assert.ok(later.video !== progress.video && !later.videoPaused, 'Video keeps playing when UI hides');
  assert.ok(later.remaining < progress.remaining - 5 && later.running, 'Timer keeps counting when UI hides');
  assert.equal(later.audioPaused, false);
  await page.screenshot({ path: out + '/title-idle.png', fullPage: true });
  await page.mouse.move(1251, 850);
  await shown(page);
  await page.waitForTimeout(650);
  pass('6-second real inactivity hides and inerts controls; music, video and timer keep running; mouse movement reveals UI');
  }

  await page.clock.install();
  if (!process.argv.includes('--audio')) {
  if (await page.locator('#bgm-audio').evaluate(a => !a.paused)) await page.locator('#music-toggle').click();
  await tab('timer');
  if (await page.evaluate(() => timer.running)) await page.locator('#toggle-timer').click();
  await page.locator('#feature-close').click();
  await page.locator('#feature-toggle').hover();
  await page.clock.fastForward(6800);
  await hidden(page);
  await page.mouse.move(1000, 700);
  await shown(page);
  await open();
  await page.locator('#feature-panel').hover({ position: { x: 25, y: 100 } });
  await page.clock.fastForward(6800);
  await hidden(page);
  await page.mouse.move(1000, 700);
  await shown(page);
  await page.locator('#feature-close').click();
  await page.locator('#music-cover').hover();
  await page.clock.fastForward(6800);
  await hidden(page);
  await page.mouse.move(1000, 700);
  await shown(page);
  await tab('tasks');
  await page.locator('#task-input').focus();
  await page.mouse.move(1250, 850);
  await page.clock.fastForward(7200);
  assert.equal(await page.evaluate(() => document.body.classList.contains('ui-idle')), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-input');
  pass('stationary hover over feature button, menu and player still hides; focused text entry prevents hiding');

  await page.locator('#feature-close').click();
  await moveAway(page);
  await page.clock.fastForward(6800);
  await hidden(page);
  await page.keyboard.press('Shift');
  await shown(page);
  await moveAway(page);
  await page.clock.fastForward(6800);
  await hidden(page);
  await page.dispatchEvent('body', 'touchstart', { touches: [], changedTouches: [] });
  await shown(page);
  pass('keyboard and touch reveal idle UI');
  }

  await tab('sounds');
  for (const key of ['rain', 'waves', 'cafe']) {
    await page.locator(`[data-sound="${key}"]`).click();
    await page.waitForFunction(name => !!nodes[name], key);
  }
  assert.equal(await page.locator('.sound-tile.active').count(), 3);
  const buffers = await page.evaluate(() => Object.fromEntries(Object.entries(nodes).map(([key, node]) => {
    const b = node.source.buffer, samples = b.getChannelData(0);
    let sum = 0, peak = 0;
    for (let i = 0; i < samples.length; i += 997) { sum += samples[i] ** 2; peak = Math.max(peak, Math.abs(samples[i])); }
    return [key, { type: node.source.constructor.name, duration: b.duration, sampleRate: b.sampleRate, channels: b.numberOfChannels, length: b.length, rms: Math.sqrt(sum / Math.ceil(samples.length / 997)), peak, loop: node.source.loop }];
  })));
  for (const [key, buffer] of Object.entries(buffers)) {
    assert.equal(buffer.type, 'AudioBufferSourceNode', key);
    assert.ok(buffer.duration >= 80 && buffer.duration <= 100, `${key} is a full natural recording (${buffer.duration}s)`);
    assert.ok(buffer.length > 1000000 && buffer.peak > .001 && buffer.rms > .0001, key + ' decoded non-silent audio');
    assert.equal(buffer.loop, true, key);
  }
  await page.locator('[data-dialog="sounds"]').click();
  await page.locator('[data-mixer="rain"] input').fill('37');
  await page.locator('[data-mixer="rain"] input').dispatchEvent('input');
  assert.equal(await page.locator('[data-mixer="rain"] small').textContent(), '37%');
  await page.waitForFunction(() => Math.abs(nodes.rain.gain.gain.value - .925) < .05);
  await page.locator('#feature-back').click();
  await page.locator('#master-volume').fill('31');
  await page.locator('#master-volume').dispatchEvent('input');
  await page.waitForFunction(() => Math.abs(masterGain.gain.value - .248) < .03);
  await page.locator('#mute-sounds').click();
  await page.waitForFunction(() => !Object.keys(nodes).length && Object.values(requestedSounds).every(value => !value));
  assert.equal(await page.locator('.sound-tile.active').count(), 0);
  pass('three real ~90s recordings decode, loop and mix together; per-track/master gains and pause-all work');

  let releaseRequest, markRequested;
  const gate = new Promise(resolve => { releaseRequest = resolve; });
  const requestStarted = new Promise(resolve => { markRequested = resolve; });
  await page.route('**/assets/ambience/forest.mp3', async route => { markRequested(); await gate; await route.continue(); });
  await page.locator('[data-sound="forest"]').click();
  await requestStarted;
  assert.equal(await page.locator('[data-sound="forest"]').getAttribute('aria-busy'), 'true');
  await page.locator('[data-sound="forest"]').click();
  releaseRequest();
  const forest = await page.evaluate(async () => {
    const buffer = await soundLoads.forest;
    return { duration: buffer.duration, length: buffer.length, peak: Math.max(...buffer.getChannelData(0).slice(0, 40000).filter((_, i) => i % 31 === 0)), active: !!nodes.forest, requested: !!requestedSounds.forest };
  });
  assert.ok(forest.duration >= 80 && forest.duration <= 100 && forest.length > 1000000);
  assert.ok(forest.peak > .001);
  assert.equal(forest.active, false);
  assert.equal(forest.requested, false);
  await page.locator('[data-sound="forest"]').click();
  await page.waitForFunction(() => !!nodes.forest);
  assert.equal(await page.evaluate(() => nodes.forest.source.constructor.name), 'AudioBufferSourceNode');
  await page.locator('#mute-sounds').click();
  await page.waitForFunction(() => !Object.keys(nodes).length);
  pass('fourth natural recording decodes; rapid on/off during loading cannot start ghost playback and cached re-enable works');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(origin);
  await ready(mobile);
  await mobile.clock.install();
  assert.equal(await mobile.locator('#scene-title').textContent(), 'Study With Yorushika');
  const mobileTitle = await mobile.locator('#scene-title').boundingBox();
  assert.ok(mobileTitle.x >= 0 && mobileTitle.x + mobileTitle.width <= 390);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
  await mobile.screenshot({ path: out + '/title-mobile.png', fullPage: true });
  await mobile.touchscreen.tap(300, 600);
  await mobile.clock.fastForward(6800);
  await hidden(mobile);
  await mobile.touchscreen.tap(300, 600);
  await shown(mobile);
  await mobile.locator('#feature-toggle').tap();
  assert.equal(await mobile.locator('#feature-panel').isVisible(), true);
  pass('390px mobile title fits and page stays within viewport; idle touch restores usable controls');
  await mobileContext.close();
  assert.deepEqual(errors, [], 'No page JavaScript exceptions');
  pass('no browser JavaScript exceptions');
} catch (error) {
  failed = error;
  console.error(error.stack);
} finally {
  await browser.close();
  assert.deepEqual(await archives(), beforeArchives, 'No archive added, removed or modified');
  pass('all existing ZIP/TAR archive mtimes and sizes remain unchanged');
}
console.log(JSON.stringify({ checks: checks.length, errors, screenshots: ['title-home.png', 'title-idle.png', 'title-mobile.png'], audioAssets: '4 local natural recordings', archiveCount: Object.keys(beforeArchives).length }, null, 2));
if (failed) throw failed;
