import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readdir, stat, mkdir } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5173/';
const out = 'test-results';
const root = new URL('./', import.meta.url);
const checks = [], errors = [], screenshots = [];
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
  await target.waitForFunction(() => window.studyMedia?.tracks.length === 8 && !!window.studyIdle);
  await target.waitForFunction(() => { const v = document.querySelector('#background-video'); return v.readyState >= 2 && !v.paused && getComputedStyle(v).opacity === '1'; });
};
const settled = async (target, open) => {
  await target.waitForFunction(expected => {
    const panel = document.querySelector('#feature-panel');
    return document.querySelector('#feature-toggle').getAttribute('aria-expanded') === String(expected) && panel.hidden === !expected && panel.inert === !expected && panel.getAnimations().length === 0;
  }, open);
};
const open = async target => {
  if (await target.locator('#feature-toggle').getAttribute('aria-expanded') !== 'true') await target.locator('#feature-toggle').click();
  await settled(target, true);
};
const centered = async (target, viewport) => {
  const box = await target.locator('#feature-panel').boundingBox();
  assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) <= 1, JSON.stringify(box) + ' horizontally centered');
  assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) <= 1, JSON.stringify(box) + ' vertically centered');
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  return box;
};
const shot = async (target, name) => {
  const path = out + '/' + name + '.png';
  await target.screenshot({ path, fullPage: true });
  screenshots.push(path);
};
let failed;
try {
  await page.goto(origin);
  await ready(page);
  await page.locator('#music-toggle').click();
  await page.waitForFunction(() => !document.querySelector('#bgm-audio').paused && document.querySelector('#bgm-audio').currentTime > .05);
  await page.locator('#feature-toggle').click();
  const opening = await page.locator('#feature-panel').evaluate(panel => panel.getAnimations().map(a => ({ duration: a.effect.getTiming().duration, frames: a.effect.getKeyframes().map(f => ({ opacity: f.opacity, transform: f.transform })) })));
  assert.ok(opening.some(a => a.duration > 0 && a.frames.some(f => f.opacity === '0') && a.frames.some(f => f.transform.includes('scale'))), JSON.stringify(opening));
  await settled(page, true);
  const box = await centered(page, { width: 1440, height: 1050 });
  assert.ok(box.width >= 740 && box.width <= 780, 'Desktop panel is wider, approximately 760px');
  assert.ok(await page.locator('#feature-panel').evaluate(p => getComputedStyle(p).backdropFilter !== 'none'), 'Glass appearance remains');
  await page.locator('#toggle-timer').click();
  const start = await page.evaluate(() => {
    window.qaAudioNode = document.querySelector('#bgm-audio');
    window.qaTimerNode = document.querySelector('#timer-display');
    return { audio: qaAudioNode.currentTime, remaining: timer.remaining, title: document.querySelector('#music-title').textContent };
  });
  await shot(page, 'centered-panel-desktop');
  pass('760px glass panel centered in desktop viewport; opening fades and scales');

  await page.locator('[data-panel-tab="changelog"]').click();
  assert.equal(await page.locator('[data-panel-view="changelog"]').isVisible(), true);
  assert.equal(await page.locator('[data-panel-tab="changelog"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.update-entry').count() >= 2, true);
  const text = await page.locator('[data-panel-view="changelog"]').innerText();
  for (const phrase of ['2026.10.22', '过渡动画', '更新日志', '环境音', '播放器']) assert.ok(text.includes(phrase), phrase);
  await shot(page, 'centered-panel-changelog');
  await page.locator('[data-panel-tab="timer"]').click();
  assert.equal(await page.locator('[data-panel-view="timer"]').isVisible(), true);
  assert.equal(await page.evaluate(() => document.querySelector('#timer-display') === qaTimerNode), true);
  assert.equal(await page.evaluate(() => timer.running), true);
  pass('readable update log opens as a menu tab and returns to the existing running timer');

  await page.keyboard.press('Escape');
  const closing = await page.locator('#feature-panel').evaluate(p => ({ hidden: p.hidden, inert: p.inert, animations: p.getAnimations().map(a => a.effect.getTiming().duration) }));
  assert.equal(closing.inert, true);
  assert.equal(closing.hidden, false, 'Panel remains rendered during closing transition');
  assert.ok(closing.animations.some(duration => duration > 0));
  await settled(page, false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'feature-toggle');
  await open(page);
  await page.mouse.click(1350, 850);
  await settled(page, false);
  pass('closing animation disables interaction until hidden; Escape restores launcher focus and background click closes');

  const toggle = await page.locator('#feature-toggle').boundingBox();
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(toggle.x + toggle.width / 2, toggle.y + toggle.height / 2);
    await page.waitForTimeout(45);
  }
  await settled(page, false);
  await open(page);
  assert.equal(await page.locator('#feature-panel').evaluate(p => p.inert), false);
  await page.locator('[data-panel-tab="changelog"]').click();
  assert.equal(await page.locator('[data-panel-view="changelog"]').isVisible(), true);
  const later = await page.evaluate(() => ({ sameAudio: document.querySelector('#bgm-audio') === qaAudioNode, sameTimer: document.querySelector('#timer-display') === qaTimerNode, audio: qaAudioNode.currentTime, paused: qaAudioNode.paused, remaining: timer.remaining, running: timer.running, title: document.querySelector('#music-title').textContent }));
  assert.equal(later.sameAudio && later.sameTimer && later.running && !later.paused, true);
  assert.equal(later.title, start.title);
  assert.ok(later.audio > start.audio + .5, JSON.stringify({ start, later }));
  assert.ok(later.remaining <= start.remaining, JSON.stringify({ start, later }));
  pass('eight rapid real clicks during transitions settle correctly; reopen remains usable and media/timer nodes are preserved');

  await page.locator('#feature-close').click();
  await settled(page, false);
  await page.locator('body').evaluate(() => document.activeElement?.blur());
  await page.mouse.move(1300, 800);
  const idleStart = await page.evaluate(() => ({ audio: qaAudioNode.currentTime, remaining: timer.remaining }));
  await page.waitForTimeout(6800);
  await page.waitForFunction(() => document.body.classList.contains('ui-idle') && getComputedStyle(document.querySelector('#feature-toggle')).visibility === 'hidden');
  assert.equal(await page.locator('#feature-toggle').evaluate(p => p.inert), true);
  const idleLater = await page.evaluate(() => ({ audio: qaAudioNode.currentTime, remaining: timer.remaining, running: timer.running, paused: qaAudioNode.paused }));
  assert.ok(idleLater.audio > idleStart.audio + 5);
  assert.ok(idleLater.remaining < idleStart.remaining - 4 && idleLater.running && !idleLater.paused);
  await page.mouse.move(1301, 800);
  await page.waitForFunction(() => !document.body.classList.contains('ui-idle'));
  await open(page);
  await centered(page, { width: 1440, height: 1050 });
  pass('6-second idle hiding and mouse reveal remain functional while audio and timer continue');

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const reduced = await reducedContext.newPage();
  reduced.on('pageerror', error => errors.push(error.message));
  await reduced.goto(origin);
  await ready(reduced);
  await reduced.locator('#feature-toggle').click();
  await settled(reduced, true);
  assert.equal(await reduced.locator('#feature-panel').evaluate(p => p.getAnimations().length), 0);
  await reduced.locator('#feature-close').click();
  await settled(reduced, false);
  assert.equal(await reduced.locator('#feature-panel').evaluate(p => p.getAnimations().length), 0);
  await reducedContext.close();
  pass('reduced-motion preference opens and closes directly without animations');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(origin);
  await ready(mobile);
  await open(mobile);
  await centered(mobile, { width: 390, height: 844 });
  await mobile.locator('[data-panel-tab="changelog"]').tap();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
  const scrolling = await mobile.locator('.feature-views').evaluate(el => ({ overflow: getComputedStyle(el).overflowY, content: el.scrollHeight, height: el.clientHeight }));
  assert.ok(['auto', 'scroll'].includes(scrolling.overflow));
  assert.ok(scrolling.content > scrolling.height, JSON.stringify(scrolling));
  await shot(mobile, 'centered-panel-mobile');
  await mobile.locator('.feature-views').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await mobile.locator('.feature-views').evaluate(el => el.scrollTop > 0));
  await mobile.locator('[data-panel-tab="timer"]').tap();
  assert.equal(await mobile.locator('[data-panel-view="timer"]').isVisible(), true);
  await mobile.locator('#feature-close').tap();
  await settled(mobile, false);
  await mobileContext.close();
  pass('390px mobile menu stays centered without viewport overflow; long changelog scrolls and navigation remains usable');
  assert.deepEqual(errors, [], 'No page JavaScript exceptions');
  pass('no page JavaScript exceptions');
} catch (error) {
  failed = error;
  console.error(error.stack);
} finally {
  await browser.close();
  assert.deepEqual(await archives(), beforeArchives, 'No archive added, removed or modified');
  pass('existing ZIP/TAR archive sizes and timestamps unchanged');
}
console.log(JSON.stringify({ checks: checks.length, errors, screenshots, archiveCount: Object.keys(beforeArchives).length }, null, 2));
if (failed) throw failed;
