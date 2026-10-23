import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readdir,readFile,stat} from 'node:fs/promises';

const audioRe=/\.(mp3|m4a|aac|ogg|wav|flac)$/i,videoRe=/\.(mp4|webm|mov|m4v)$/i;
const countFiles=async(dir,re)=>(await readdir(new URL(dir,import.meta.url))).filter(n=>re.test(n)).length;
const trackCount=await countFiles('./music',audioRe),videoCount=await countFiles('./video',videoRe);
const origin='http://127.0.0.1:5173/';
const out = 'test-results';
await mkdir(out,{recursive:true});
const checks=[],errors=[],screenshots=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const browser=await chromium.launch({channel: 'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
const visible=async selector=>assert.equal(await page.locator(selector).isVisible(),true,selector+' should be visible');
const closed=async()=>assert.equal(await page.locator('#feature-panel').isVisible(),false,'Feature menu should be closed');
const open=async()=>{if(!await page.locator('#feature-panel').isVisible())await page.locator('#feature-toggle').click();};
const tab=async name=>{await open();await page.locator(`.feature-nav [data-panel-tab="${name}"]`).click();await visible(['timer','tasks','sounds','stats'].includes(name)?`[data-panel-view="${name}"]`:'#modal');assert.equal(await page.locator('.feature-nav button.active').getAttribute('data-panel-tab'),name);};
const ready=async p=>{await p.waitForFunction(`()=>window.studyMedia?.tracks.length===${trackCount}`);await p.waitForFunction(()=>document.querySelector('#background-video').readyState>=2);};
const shot=async(p,name)=>{const path=out+'/'+name+'.png';await p.mouse.move(0,0);await p.waitForTimeout(260);await p.screenshot({path,fullPage:true});screenshots.push(path);};

try{
  const library=JSON.parse(await readFile(new URL('./studywithyorushika/dist/media-library.json',import.meta.url),'utf8'));
  assert.equal(library.project,'studywithyorushika');assert.equal(library.tracks.length,trackCount);assert.equal(library.videos.length,videoCount);
  for(const item of [...library.tracks,...library.videos])assert.ok((await stat(new URL('./studywithyorushika/dist/'+item.src,import.meta.url))).size<=25*1048576);
  const partial=await fetch(new URL(library.tracks[0].src,origin),{headers:{Range:'bytes=100-199'}});
  assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,100);pass('media manifest, Pages file limits and seekable range response');

  await page.clock.install({time:new Date('2026-10-21T11:00:00+08:00')});
  await page.goto(origin);await ready(page);await page.waitForTimeout(350);
  await closed();assert.equal(await page.locator('#feature-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.scene-wash').count(),0);
  assert.equal(await page.locator('#background-video').evaluate(v=>v.muted&&v.loop&&!v.paused&&getComputedStyle(v).filter==='none'),true);
  assert.equal(await page.evaluate(()=>[document.documentElement,document.body,document.querySelector('.landscape')].every(el=>getComputedStyle(el).filter==='none'&&getComputedStyle(el).backdropFilter==='none')),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(await page.evaluate(()=>[...document.body.querySelectorAll(':scope > button,:scope > aside,:scope > section')].filter(el=>getComputedStyle(el).display!=='none'&&!el.hidden).map(el=>el.id)),['feature-toggle','music-player']);
  assert.equal(await page.locator('#music-player').evaluate(el=>el.parentElement===document.body),true);
  const button=await page.locator('#feature-toggle').boundingBox(),player=await page.locator('#music-player').boundingBox();
  assert.ok(button.x>=12&&button.x<=32&&button.y>=12&&button.y<=32);assert.ok(player.x>=12&&player.x<=32&&1050-player.y-player.height>=12&&1050-player.y-player.height<=32);
  assert.ok(player.height<=90&&player.width<=400,'Compact desktop player stays at most 400px wide and 90px high');assert.equal(await page.locator('#music-player.compact-player .music-player-bar').count(),1);
  assert.equal(await page.locator('#music-playlist').isVisible(),false);assert.equal(await page.locator('#music-volume-popover').isVisible(),false);
  assert.equal(await page.locator('#music-player').getByRole('button',{name:/歌词|字幕/}).count(),0);
  await shot(page,'compact-home');pass('clear fullscreen video home; upper-left function button and compact lower-left player; no page scrolling or wash');
  await page.locator('#music-player').screenshot({path:out+'/compact-player-detail.png'});screenshots.push(out+'/compact-player-detail.png');

  const firstTitle=await page.locator('#music-title').textContent();
  for(const [mode,label] of [['single','单曲循环'],['shuffle','随机播放'],['list','列表循环']]){
    await page.locator('#music-mode').click();assert.equal(await page.locator('#music-mode').getAttribute('data-mode'),mode);assert.equal(await page.evaluate(()=>window.studyMedia.playbackMode),mode);
    assert.match(await page.locator('#music-mode').getAttribute('aria-label'),new RegExp('播放模式：'+label));assert.match(await page.locator('#music-mode').getAttribute('title'),new RegExp(label));
    assert.equal(await page.locator('#music-title').textContent(),firstTitle);assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.paused),true,'Mode switching must not start playback');assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.loop),mode==='single');
  }
  await page.locator('#music-cover').click();await page.waitForFunction(()=>!document.querySelector('#bgm-audio').paused&&document.querySelector('#bgm-audio').currentTime>.05);await page.locator('#music-cover').click();assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.paused),true);
  pass('single mode button cycles list/single/shuffle without changing song or auto-playing; cover toggles playback');

  await open();await visible('[data-panel-view="timer"]');await page.locator('#feature-close').click();await closed();
  await open();await page.mouse.click(1350,100);await closed();await open();await page.keyboard.press('Escape');await closed();
  for(const name of ['timer','tasks','sounds','stats','scenes','settings','help'])await tab(name);
  await page.keyboard.press('Escape');await visible('[data-panel-view="stats"]');await page.keyboard.press('Escape');await closed();
  await tab('timer');await shot(page,'feature-menu');pass('open, close, outside click, Escape/back and all seven menu entries');

  await page.locator('#toggle-timer').click();await page.locator('#feature-close').click();await page.clock.fastForward(61000);
  assert.match(await page.locator('#timer-display').textContent(),/^23:5/);assert.equal(await page.locator('#today-minutes').textContent(),'1');
  await page.reload();await ready(page);await closed();assert.match(await page.locator('#timer-display').textContent(),/^23:5/);
  assert.equal(await page.locator('#feature-running-dot').evaluate(el=>!el.hidden),true);
  await page.clock.fastForward(24*60*1000);assert.equal(await page.locator('#today-minutes').textContent(),'25');assert.equal(await page.locator('#session-count').textContent(),'2');
  assert.equal(await page.locator('#feature-running-dot').evaluate(el=>el.hidden),true);pass('timer continues with closed menu, restores running session on reload, accounts exactly one complete 25-minute session');

  await tab('tasks');const originalTasks=await page.locator('.task-row').count();await page.locator('#task-input').fill('阅读 Chapter 3');await page.locator('#task-input').press('Enter');
  assert.equal(await page.locator('.task-row').count(),originalTasks+1);await page.getByRole('button',{name:'阅读 Chapter 3',exact:true}).click();assert.equal(await page.locator('#current-task').textContent(),'阅读 Chapter 3');
  await page.getByRole('button',{name:'完成：阅读 Chapter 3',exact:true}).click();assert.equal(await page.locator('.task-row.completed').count(),1);await page.locator('#clear-completed').click();assert.equal(await page.locator('.task-row').count(),originalTasks);await visible('#feature-panel');pass('task add, select, complete and clear without closing menu');

  await tab('sounds');await page.locator('[data-sound="rain"]').click();await page.waitForFunction(()=>document.querySelector('[data-sound="rain"]').getAttribute('aria-pressed')==='true');
  await page.locator('[data-sound="waves"]').click();await page.waitForFunction(()=>document.querySelectorAll('.sound-tile.active').length===2);
  await page.locator('[data-dialog="sounds"]').click();await visible('#modal');await page.locator('[data-mixer="rain"] input').fill('37');await page.locator('[data-mixer="rain"] input').dispatchEvent('input');assert.equal(await page.locator('[data-mixer="rain"] small').textContent(),'37%');
  await page.locator('#open-music-library').click();await closed();await visible('#music-playlist');assert.equal(await page.locator('[data-track]').count(),trackCount);assert.equal(await page.locator('#music-playlist-count').textContent(),trackCount+' 首旋律');
  const playlistBox=await page.locator('#music-playlist').boundingBox(),barBox=await page.locator('.music-player-bar').boundingBox();assert.ok(playlistBox.y+playlistBox.height<=barBox.y,'Playlist expands above player');
  await page.locator('#music-list-open').click();assert.equal(await page.locator('#music-playlist').isVisible(),false);await page.locator('#music-list-open').click();await visible('#music-playlist');
  await page.locator('[data-track]').last().click();await visible('#music-playlist');await page.waitForFunction(()=>!document.querySelector('#bgm-audio').paused);assert.equal(await page.locator('#music-title').textContent(),library.tracks[7].title);
  await page.locator('#bgm-audio').dispatchEvent('ended');await page.waitForFunction(title=>document.querySelector('#music-title').textContent===title,library.tracks[0].title);await visible('#music-playlist');
  await page.locator('#music-mode').click();await page.locator('#music-mode').click();assert.equal(await page.locator('#music-mode').getAttribute('data-mode'),'shuffle');
  const beforeShuffle=await page.locator('#music-title').textContent();await page.locator('#bgm-audio').dispatchEvent('ended');await page.waitForFunction(title=>document.querySelector('#music-title').textContent!==title,beforeShuffle);
  await page.locator('#music-mode').click();assert.equal(await page.locator('#music-mode').getAttribute('data-mode'),'list');
  if(await page.locator('#music-title').textContent()!==library.tracks[4].title)await page.locator('[data-track]').nth(4).click();
  else if(await page.locator('#bgm-audio').evaluate(a=>a.paused))await page.locator('#music-toggle').click();
  await visible('#music-playlist');await page.waitForFunction(()=>!document.querySelector('#bgm-audio').paused&&document.querySelector('#bgm-audio').currentTime>.05);
  assert.equal(await page.locator('#music-title').textContent(),library.tracks[4].title);await page.locator('#music-mode').click();assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.loop),true);
  await page.locator('#music-next').click();assert.equal(await page.locator('#music-title').textContent(),library.tracks[5].title);await page.locator('#music-prev').click();assert.equal(await page.locator('#music-title').textContent(),library.tracks[4].title);
  await page.locator('#music-import-trigger').focus();assert.equal(await page.evaluate(()=>document.activeElement?.id),'music-import-trigger');
  await shot(page,'compact-playlist');await page.locator('#music-list-open').click();assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.paused),false);
  await page.waitForFunction(()=>Number.isFinite(document.querySelector('#bgm-audio').duration));await page.locator('#music-progress').focus();await page.locator('#music-progress').fill('400');await page.locator('#music-progress').dispatchEvent('input');await page.locator('#music-progress').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#bgm-audio').currentTime>30);await page.waitForTimeout(1000);assert.ok(+await page.locator('#music-progress').inputValue()>400,'Progress continues after seek while slider retains focus');
  await page.locator('#music-volume-toggle').click();await visible('#music-volume-popover');await page.locator('#music-volume').fill('27');await page.locator('#music-volume').dispatchEvent('input');assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.volume),.27);await page.locator('#music-volume-toggle').click();assert.equal(await page.locator('#music-volume-popover').isVisible(),false);
  await tab('sounds');assert.equal(await page.locator('.sound-tile.active').count(),2);await page.locator('#mute-sounds').click();await page.waitForFunction(()=>document.querySelectorAll('.sound-tile.active').length===0);await page.locator('#feature-close').click();
  pass('ambient mixing; independent upward playlist toggle and selection; list wraps; shuffle skips current; single allows manual next/previous; volume popover and live seeking');

  await page.locator('#music-list-open').click();await visible('#music-playlist');const audioBeforeCollapse=await page.locator('#bgm-audio').evaluate(a=>a.currentTime);
  await page.locator('#music-collapse').click();assert.equal(await page.locator('#music-player').evaluate(el=>el.classList.contains('is-collapsed')),true);assert.equal(await page.locator('#music-progress').isVisible(),false);assert.equal(await page.locator('#music-playlist').isVisible(),false);
  assert.equal(await page.locator('#music-collapse').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.paused),false);await page.waitForFunction(t=>document.querySelector('#bgm-audio').currentTime>t+.1,audioBeforeCollapse);
  await page.waitForTimeout(260);const collapsedBox=await page.locator('#music-player').boundingBox();assert.ok(collapsedBox.width<=83&&collapsedBox.height<=65,JSON.stringify(collapsedBox));await shot(page,'compact-collapsed');
  await page.locator('#music-collapse').click();await visible('#music-progress');assert.equal(await page.locator('#music-collapse').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.paused),false);await page.locator('#music-collapse').click();
  await page.reload();await ready(page);assert.equal(await page.locator('#music-player').evaluate(el=>el.classList.contains('is-collapsed')),true);assert.equal(await page.locator('#music-title').textContent(),library.tracks[4].title);assert.equal(await page.locator('#music-volume').inputValue(),'27');assert.equal(await page.locator('#music-mode').getAttribute('data-mode'),'single');assert.equal(await page.locator('#bgm-audio').evaluate(a=>a.paused&&a.loop),true);
  await page.locator('#music-collapse').click();await visible('#music-progress');pass('side handle collapse/expand keeps audio playing and closes playlist; collapsed state, track, volume and playback mode persist without BGM autoplay');

  await open();await page.locator('#music-volume-toggle').click();await visible('#music-volume-popover');await page.keyboard.press('Escape');assert.equal(await page.locator('#music-volume-popover').isVisible(),false);await visible('#feature-panel');
  await tab('settings');await page.locator('input[name="focus"]').fill('35');await page.locator('input[name="goal"]').fill('180');await page.getByRole('button',{name:'保存我的节奏'}).click();await visible('[data-panel-view="timer"]');assert.equal(await page.locator('#timer-display').textContent(),'35:00');assert.equal(await page.locator('#goal-value').textContent(),'180 分钟');
  await tab('stats');await page.locator('[data-dialog="stats"]').click();assert.equal(await page.locator('.calendar-day.today').count(),1);assert.match(await page.locator('.stats-summary').textContent(),/25/);const month=await page.locator('.calendar-nav strong').textContent();await page.locator('#prev-month').click();await visible('#feature-panel');assert.notEqual(await page.locator('.calendar-nav strong').textContent(),month);await page.locator('#next-month').click();await visible('#feature-panel');assert.equal(await page.locator('.calendar-nav strong').textContent(),month);await page.locator('#feature-back').click();await visible('[data-panel-view="stats"]');
  pass('settings save returns to timer; study calendar and month navigation remain inside menu');

  await tab('scenes');await page.locator('#pause-background').click();assert.equal(await page.locator('#background-video').evaluate(v=>v.paused),true);await page.locator('#pause-background').click();await page.waitForFunction(()=>!document.querySelector('#background-video').paused);
  await page.locator('[data-scene-select="forest"]').click();assert.equal(await page.locator('#background-video').evaluate(v=>v.hidden&&!v.getAttribute('src')),true);await page.locator('#feature-close').click();await page.reload();await page.waitForFunction(()=>window.studyMedia?.tracks.length===8);assert.equal(await page.locator('body').getAttribute('data-scene'),'forest');assert.equal(await page.locator('#background-video').evaluate(v=>v.hidden),true);
  await tab('scenes');await page.locator('[data-video-select]').click();await ready(page);await page.locator('#feature-close').click();pass('background video pause/resume; still-image choice persists; switch back to video');

  const second=await context.newPage();await second.goto(origin);await second.waitForFunction(()=>document.body.dataset.readonly==='true');const before=await second.evaluate(()=>localStorage.getItem('studywithyorushika.timer'));await second.locator('body').click({position:{x:1300,y:100}});await second.keyboard.press('Space');await second.waitForTimeout(400);assert.equal(await second.evaluate(()=>localStorage.getItem('studywithyorushika.timer')),before);assert.equal(await second.locator('#toggle-timer').isDisabled(),true);await second.close();pass('second tab stays read-only and Space cannot modify saved timer');

  const mobileContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin);await ready(mobile);await mobile.waitForTimeout(350);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true);await shot(mobile,'feature-mobile');await mobile.locator('#feature-toggle').click();assert.equal(await mobile.locator('#music-player').isVisible(),false);await shot(mobile,'feature-mobile-menu');
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
    await mobile.setViewportSize(viewport);await mobile.locator('[data-panel-tab="settings"]').click();assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(viewport)+' should not overflow');
    assert.equal(await mobile.locator('.feature-views').evaluate(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY)),true);
    const box=await mobile.locator('#feature-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1&&box.y>=0&&box.y+box.height<=viewport.height+1,'Menu remains inside viewport');
    await mobile.locator('.feature-views').evaluate(el=>el.scrollTop=el.scrollHeight);await mobile.getByRole('button',{name:'保存我的节奏'}).click();assert.equal(await mobile.locator('[data-panel-view="timer"]').isVisible(),true);
    if(viewport.width===320)await shot(mobile,'feature-small-menu');
  }
  await mobile.locator('#feature-close').click();assert.equal(await mobile.locator('#music-player').isVisible(),true);await mobile.setViewportSize({width:320,height:568});await mobile.locator('#music-list-open').click();assert.equal(await mobile.locator('#music-playlist').isVisible(),true);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await mobile.locator('#music-playlist-tracks').evaluate(el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY==='auto'),true);
  const mobilePlaylist=await mobile.locator('#music-playlist').boundingBox();assert.ok(mobilePlaylist.x>=0&&mobilePlaylist.x+mobilePlaylist.width<=320&&mobilePlaylist.y>=0);
  await mobile.locator('#music-playlist-tracks').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await mobile.locator('#music-playlist-tracks').evaluate(el=>el.scrollTop)>0);await shot(mobile,'compact-mobile');
  await mobile.locator('[data-track]').last().click();assert.equal(await mobile.locator('#music-playlist').isVisible(),true);assert.equal(await mobile.locator('#music-title').textContent(),library.tracks[7].title);await mobileContext.close();pass('390px, 320px and landscape layouts; menu hides/restores player; 320px playlist scrolls without horizontal overflow');

  const migrationContext=await browser.newContext();await migrationContext.addInitScript(()=>{localStorage.setItem('studywithyorushika.repeatOne','true');localStorage.setItem('studywithyorushika.shuffle','true');});
  const migration=await migrationContext.newPage();migration.on('pageerror',e=>errors.push(e.message));await migration.goto(origin);await ready(migration);assert.equal(await migration.locator('#music-mode').getAttribute('data-mode'),'single');assert.equal(await migration.locator('#bgm-audio').evaluate(a=>a.loop&&a.paused),true);await migrationContext.close();pass('legacy repeat and shuffle flags migrate with single-repeat precedence');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks,errors,screenshots},null,2));
}finally{await browser.close();}
