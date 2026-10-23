(() => {
  'use strict';
  const audio=new Audio();
  audio.id='bgm-audio';audio.preload='metadata';audio.hidden=true;document.body.append(audio);
  const video=$('#background-video');
  let tracks=[],videos=[],index=-1,history=[],restorePosition=null,libraryReady=false,lastSave=0,videoTimer,videoWasPlaying=false,scrubbing=false;
  const modes=['list','single','shuffle'];
  const modeLabels={list:'列表循环',single:'单曲循环',shuffle:'随机播放'};
  const storedMode=readStorage('studywithyorushika.playbackMode',null);
  let playbackMode=modes.includes(storedMode)?storedMode:readStorage('studywithyorushika.repeatOne',false)?'single':readStorage('studywithyorushika.shuffle',false)?'shuffle':'list';
  let volume=Number(readStorage('studywithyorushika.musicVolume',55));if(!Number.isFinite(volume))volume=55;audio.volume=Math.min(100,Math.max(0,volume))/100;
  const saved=readStorage('studywithyorushika.music',{});
  let activeVideo=null;
  const fileUrls=new Set();
  const formatTime=value=>{if(!Number.isFinite(value)||value<0)return '0:00';return `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;};
  const setFill=el=>{const percent=(+el.value-(+el.min||0))/(+el.max-(+el.min||0))*100;el.style.background=`linear-gradient(to right,#7d9b78 ${percent}%,#7d9b7825 ${percent}%)`;};
  const current=()=>tracks[index];
  const readOnly=()=>document.body.dataset.readonly==='true';
  function savePlayback(){persist('studywithyorushika.music',current()?{id:current().id,position:Number.isFinite(audio.currentTime)?audio.currentTime:0}:null);}
  function renderProgress(){const duration=Number.isFinite(audio.duration)?audio.duration:current()?.duration||0;$('#music-current').textContent=formatTime(audio.currentTime);$('#music-duration').textContent=formatTime(duration);const progress=$('#music-progress');if(!scrubbing){progress.value=duration?Math.round(audio.currentTime/duration*1000):0;setFill(progress);}progress.disabled=readOnly()||!Number.isFinite(audio.duration)||audio.duration<=0;}
  function renderMusic(){
    const song=current(),playing=!audio.paused&&!audio.ended;
    $('#music-title').textContent=song?song.title:libraryReady?'还没有歌曲':'正在读取歌单';
    $('#music-title').title=song?.title||'';
    $('#music-artist').textContent=song?(song.artist||'自选音乐'):libraryReady?'将音乐加入 music 文件夹':'ヨルシカ';
    for(const selector of ['#music-toggle','#music-cover-play'])$(selector).innerHTML=icon(playing?'pause':'play');
    for(const selector of ['#music-toggle','#music-cover']){$(selector).setAttribute('aria-label',playing?'暂停音乐':'播放音乐');$(selector).title=playing?'暂停音乐':'播放音乐';}
    $('#music-player').classList.toggle('is-playing',playing);
    const nextMode=modes[(modes.indexOf(playbackMode)+1)%modes.length];
    $('#music-mode').innerHTML=icon(playbackMode==='shuffle'?'shuffle':playbackMode==='single'?'repeat-one':'repeat');
    $('#music-mode').dataset.mode=playbackMode;
    $('#music-mode').setAttribute('aria-label',`播放模式：${modeLabels[playbackMode]}，点击切换为${modeLabels[nextMode]}`);
    $('#music-mode').title=`${modeLabels[playbackMode]} · 点击切换${modeLabels[nextMode]}`;
    audio.loop=playbackMode==='single';
    for(const id of ['music-toggle','music-cover','music-prev','music-next','music-mode'])$('#'+id).disabled=readOnly()||!song;
    $('#music-volume').value=Math.round(audio.volume*100);$('#music-volume-label').textContent=Math.round(audio.volume*100)+'%';setFill($('#music-volume'));renderProgress();
    if(!$('#music-playlist').hidden)renderLibrary($('#music-playlist-tracks'));
  }
  function requestPlay(){if(!current()||readOnly())return;audio.play().catch(error=>{renderMusic();if(error.name==='AbortError')return;toast(error.name==='NotAllowedError'?'点击播放按钮，就能开始聆听。':'这首歌暂时无法播放，可以试试下一首。');});}
  function loadTrack(next,{play=false,position=0,remember=true}={}){if(!Number.isInteger(next)||next<0||next>=tracks.length)return;if(remember&&index>=0&&next!==index){history.push(index);if(history.length>100)history.shift();}index=next;audio.pause();restorePosition=Math.max(0,Number(position)||0);audio.src=tracks[index].src;audio.load();renderMusic();persist('studywithyorushika.music',{id:tracks[index].id,position:restorePosition});if(play)requestPlay();}
  function nextTrack(direction=1,play=true){if(!tracks.length||readOnly())return;let next;if(direction<0&&audio.currentTime>3){audio.currentTime=0;savePlayback();if(play)requestPlay();return;}if(direction<0&&history.length)next=history.pop();else if(playbackMode==='shuffle'&&tracks.length>1){const offset=1+Math.floor(Math.random()*(tracks.length-1));next=(Math.max(index,0)+offset)%tracks.length;}else next=(index+direction+tracks.length)%tracks.length;loadTrack(next,{play,remember:direction>0});}
  function togglePlay(){if(!current()||readOnly())return;if(audio.paused)requestPlay();else audio.pause();}
  $('#music-toggle').onclick=togglePlay;$('#music-cover').onclick=togglePlay;
  $('#music-prev').onclick=()=>nextTrack(-1);$('#music-next').onclick=()=>nextTrack(1);
  $('#music-mode').onclick=()=>{
    if(readOnly())return;
    playbackMode=modes[(modes.indexOf(playbackMode)+1)%modes.length];
    persist('studywithyorushika.playbackMode',playbackMode);
    persist('studywithyorushika.repeatOne',playbackMode==='single');persist('studywithyorushika.shuffle',playbackMode==='shuffle');
    renderMusic();toast(modeLabels[playbackMode]);
  };
  function setVolumeOpen(open,{focus=false}={}){if(open&&readOnly())return;$('#music-volume-popover').hidden=!open;$('#music-volume-toggle').setAttribute('aria-expanded',String(open));if(open&&focus)$('#music-volume').focus({preventScroll:true});}
  function setPlaylistOpen(open,{focus=false}={}){
    if(open&&readOnly())return;
    if(open){collapsePlayer(false);setVolumeOpen(false);setPanelOpen(false);}
    $('#music-playlist').hidden=!open;$('#music-list-open').setAttribute('aria-expanded',String(open));
    $('#music-list-open').setAttribute('aria-label',open?'收起歌单':'展开歌单');$('#music-list-open').title=open?'收起歌单':'展开歌单';
    if(open){renderLibrary($('#music-playlist-tracks'));if(focus)$('#music-playlist-tracks').querySelector('[aria-current="true"],button:not(:disabled)')?.focus({preventScroll:true});}
  }
  $('#music-list-open').onclick=()=>setPlaylistOpen($('#music-playlist').hidden);
  $('#music-volume-toggle').onclick=()=>setVolumeOpen($('#music-volume-popover').hidden);
  function collapsePlayer(collapsed){
    if(collapsed){setPlaylistOpen(false);setVolumeOpen(false);}
    $('#music-player').classList.toggle('is-collapsed',collapsed);const button=$('#music-collapse');
    button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'展开播放器':'收起播放器');
    button.title=collapsed?'展开播放器':'收起播放器';button.innerHTML=icon('chevron');persist('studywithyorushika.playerCollapsed',collapsed);
  }
  $('#music-collapse').onclick=()=>collapsePlayer(!$('#music-player').classList.contains('is-collapsed'));
  collapsePlayer(!!readStorage('studywithyorushika.playerCollapsed',false));
  document.addEventListener('pointerdown',event=>{const path=event.composedPath();if(!path.includes($('#music-player'))){setPlaylistOpen(false);setVolumeOpen(false);}else if(!path.includes($('.music-volume-wrap')))setVolumeOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!$('#music-volume-popover').hidden){event.preventDefault();event.stopPropagation();setVolumeOpen(false);$('#music-volume-toggle').focus({preventScroll:true});}else if(!$('#music-playlist').hidden){event.preventDefault();event.stopPropagation();setPlaylistOpen(false);$('#music-list-open').focus({preventScroll:true});}});
  $('#music-volume').oninput=e=>{audio.volume=+e.target.value/100;$('#music-volume-label').textContent=e.target.value+'%';setFill(e.target);persist('studywithyorushika.musicVolume',+e.target.value);};
  $('#music-progress').oninput=e=>{scrubbing=true;setFill(e.target);if(Number.isFinite(audio.duration))$('#music-current').textContent=formatTime(audio.duration* +e.target.value/1000);};
  $('#music-progress').onchange=e=>{scrubbing=false;if(Number.isFinite(audio.duration)){audio.currentTime=audio.duration* +e.target.value/1000;savePlayback();renderProgress();}};
  $('#music-progress').addEventListener('blur',()=>{scrubbing=false;renderProgress();});
  // Hosts that ignore Range make audio non-seekable (seekable.end(0) === 0).
  // Fetch the track once and play it from a blob so the scrubber works on any host.
  const blobSources=new Map();
  let blobToken=0;
  async function ensureSeekable(){
    const track=current();
    if(!track||track.local||blobSources.has(track.id))return;
    const reach=audio.seekable&&audio.seekable.length?audio.seekable.end(0):0;
    if(reach>0)return;
    const token=++blobToken,id=track.id;
    try{
      const response=await fetch(track.src);
      if(!response.ok)return;
      const blob=await response.blob();
      if(token!==blobToken||index<0||current()?.id!==id)return;
      const url=URL.createObjectURL(blob);
      blobSources.set(id,url);
      while(blobSources.size>3){const oldest=blobSources.keys().next().value;if(oldest===id)break;URL.revokeObjectURL(blobSources.get(oldest));blobSources.delete(oldest);}
      const position=Number.isFinite(audio.currentTime)?audio.currentTime:0;
      const wasPlaying=!audio.paused&&!audio.ended;
      audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(position,Math.max(0,audio.duration-0.5));if(wasPlaying)requestPlay();},{once:true});
      audio.src=url;audio.load();
    }catch{}
  }
  audio.addEventListener('loadedmetadata',()=>{if(restorePosition!==null&&Number.isFinite(audio.duration)){audio.currentTime=Math.min(restorePosition,Math.max(0,audio.duration-1));restorePosition=null;}renderProgress();ensureSeekable();});
  audio.addEventListener('durationchange',renderProgress);
  audio.addEventListener('timeupdate',()=>{renderProgress();if(Date.now()-lastSave>5000){savePlayback();lastSave=Date.now();}});
  audio.addEventListener('play',renderMusic);audio.addEventListener('pause',()=>{savePlayback();renderMusic();});
  audio.addEventListener('ended',()=>{if(playbackMode==='single'){audio.currentTime=0;requestPlay();}else nextTrack(1);});
  audio.addEventListener('error',()=>{renderMusic();if(current())toast(`「${current().title}」加载失败，请切歌或刷新重试。`);});
  function removeImportedTrack(id){
    if(readOnly())return;
    const removedIndex=tracks.findIndex(track=>track.id===id&&track.local===true&&fileUrls.has(track.src));
    if(removedIndex<0)return;
    const removed=tracks[removedIndex],wasCurrent=removedIndex===index,wasPlaying=!audio.paused&&!audio.ended;
    if(wasCurrent)audio.pause();
    tracks.splice(removedIndex,1);
    history=history.filter(item=>item!==removedIndex).map(item=>item>removedIndex?item-1:item);
    if(wasCurrent){
      restorePosition=null;scrubbing=false;
      if(tracks.length){index=-1;loadTrack(Math.min(removedIndex,tracks.length-1),{play:wasPlaying,remember:false});}
      else{index=-1;audio.removeAttribute('src');audio.load();savePlayback();renderMusic();}
    }else{if(removedIndex<index)index--;savePlayback();renderMusic();}
    URL.revokeObjectURL(removed.src);fileUrls.delete(removed.src);
    const container=$('#music-playlist-tracks');
    if(container&&!$('#music-playlist').hidden){
      const candidate=tracks[Math.min(removedIndex,tracks.length-1)];
      Array.from(container.querySelectorAll('[data-track]')).find(button=>button.dataset.track===candidate?.id)?.focus({preventScroll:true});
      if(!candidate)container.querySelector('#music-import-trigger')?.focus({preventScroll:true});
    }
    toast(`已从歌单移除「${removed.title}」。`);
  }
  function renderLibrary(container){
    const focused=container.contains(document.activeElement)?{track:document.activeElement?.dataset.track,remove:document.activeElement?.dataset.removeTrack}:null;
    const top=container.scrollTop;
    $('#music-playlist-count').textContent=`${tracks.length} 首旋律`;
    container.innerHTML=`<div class="music-library">${tracks.map((track,i)=>`<div class="music-library-entry"><button type="button" class="music-library-row ${i===index?'active':''}" data-track="${esc(track.id)}" aria-current="${i===index}" aria-label="播放 ${esc(track.title)}"><span class="track-number">${String(i+1).padStart(2,'0')}</span><span class="track-info"><strong>${esc(track.title)}</strong><small>${esc(track.artist||'自选音乐')}</small></span>${icon(i===index&&!audio.paused?'pause':'play')}</button>${track.local===true?`<button type="button" class="music-remove-track" data-remove-track="${esc(track.id)}" aria-label="从歌单删除 ${esc(track.title)}" title="从歌单删除，不影响设备文件">${icon('x')}</button>`:''}</div>`).join('')||'<p class="media-note">还没有歌曲，可以加入设备上的音乐。</p>'}</div><div class="playlist-import"><button id="music-import-trigger" type="button">${icon('plus')} 加入设备音乐</button><input id="music-file" type="file" accept="audio/*" multiple hidden><small class="music-import-note">设备音乐仅保留在本次页面中；删除只移出歌单。</small></div>`;
    container.scrollTop=top;
    container.querySelectorAll('[data-track]').forEach(button=>{button.disabled=readOnly();button.onclick=()=>{if(readOnly())return;const next=tracks.findIndex(t=>t.id===button.dataset.track);if(next===index)togglePlay();else loadTrack(next,{play:true});};if(button.dataset.track===focused?.track)button.focus({preventScroll:true});});
    container.querySelectorAll('[data-remove-track]').forEach(button=>{button.disabled=readOnly();button.onclick=event=>{event.stopPropagation();removeImportedTrack(button.dataset.removeTrack);};if(button.dataset.removeTrack===focused?.remove)button.focus({preventScroll:true});});
    const input=container.querySelector('#music-file');input.disabled=readOnly();const importButton=container.querySelector('#music-import-trigger');importButton.disabled=readOnly();importButton.onclick=()=>input.click();
    input.onchange=event=>{if(readOnly())return;const files=Array.from(event.target.files||[]);if(!files.length)return;for(const file of files){const url=URL.createObjectURL(file);fileUrls.add(url);tracks.push({id:'local-'+crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/,''),artist:'设备上的音乐',src:url,duration:null,local:true});}if(index<0&&tracks.length)loadTrack(0);else renderMusic();toast(`已加入 ${files.length} 首设备音乐，刷新后需重新选择。`);};
  }
  let videoFailed=false;
  function setVideoStatus(message,loading=false){const status=$('#video-status');status.textContent=message;status.hidden=!message;status.classList.toggle('is-loading',loading);}
  function setVideoBackdrop(item){
    const backdrop=$('.landscape');
    if(backdrop)backdrop.style.backgroundImage=item?.poster?`url("${item.poster}")`:'none';
  }
  function updateVideoButtons(){
    document.querySelectorAll('[data-video-select]').forEach(button=>{const selected=button.dataset.videoSelect===activeVideo?.id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=readOnly();});
    const button=$('#pause-background');
    if(button){button.innerHTML=icon(videoFailed?'reset':video.paused?'play':'pause')+(videoFailed?' 重试背景':video.paused?' 播放背景':' 暂停背景');button.disabled=readOnly()||!activeVideo;}
  }
  function stopVideo({persistChoice=null}={}){
    activeVideo=null;videoFailed=false;clearTimeout(videoTimer);video.pause();video.hidden=true;video.removeAttribute('src');video.removeAttribute('poster');video.load();setVideoBackdrop(null);
    document.body.classList.remove('video-loading','has-video');video.classList.remove('is-loading');setVideoStatus('');
    if(persistChoice&&persistChoice.startsWith('video:'))persist('studywithyorushika.background',persistChoice);updateVideoButtons();
  }
  function failVideo(){
    if(!activeVideo)return;videoFailed=true;video.hidden=true;video.pause();video.classList.remove('is-loading');document.body.classList.remove('video-loading','has-video');clearTimeout(videoTimer);
    setVideoStatus('背景视频暂时无法播放，可在「背景与视频」中重试。');updateVideoButtons();
  }
  function selectVideo(id,{save=true}={}){
    if(readOnly())return;
    const item=videos.find(item=>item.id===id);if(!item)return;
    if(activeVideo?.id===id&&!video.error&&!videoFailed){if(video.paused)video.play().catch(error=>{if(error.name==='NotAllowedError')setVideoStatus('轻点「播放背景」继续观看。');else if(error.name!=='AbortError')failVideo();});return;}
    activeVideo=item;videoFailed=false;setVideoBackdrop(item);video.muted=true;video.loop=true;video.defaultMuted=true;video.poster=item.poster||'';video.hidden=false;video.classList.add('is-loading');document.body.classList.add('video-loading');setVideoStatus('正在打开你的背景…',true);
    if(save)persist('studywithyorushika.background','video:'+id);
    video.src=item.src;video.load();
    video.play().catch(error=>{if(error.name==='NotAllowedError'){video.hidden=false;video.classList.remove('is-loading');document.body.classList.remove('video-loading');setVideoStatus('背景已就绪，可在「背景与视频」中点播放。');}else if(error.name!=='AbortError')failVideo();});
    clearTimeout(videoTimer);videoTimer=setTimeout(()=>{if(video.readyState<2)setVideoStatus('视频仍在加载，请稍候或在「背景与视频」中重试。',true);},12000);updateVideoButtons();
  }
  video.addEventListener('loadeddata',()=>{if(!activeVideo)return;videoFailed=false;video.hidden=false;video.classList.remove('is-loading');document.body.classList.remove('video-loading');document.body.classList.add('has-video');clearTimeout(videoTimer);setVideoStatus('');updateVideoButtons();});
  video.addEventListener('error',failVideo);video.addEventListener('play',updateVideoButtons);video.addEventListener('pause',updateVideoButtons);
  function videoChoices(){
    if(!videos.length)return '<div class="video-empty"><h3>还没有背景视频</h3><p class="media-note">将视频加入项目的 video 文件夹并更新媒体目录后，就会显示在这里。</p></div>';
    return `<h3>你的背景视频</h3><div class="video-options">${videos.map(item=>`<button type="button" class="video-option ${activeVideo?.id===item.id?'selected':''}" data-video-select="${esc(item.id)}" aria-label="选择背景视频：${esc(item.title)}" aria-pressed="${activeVideo?.id===item.id}">${item.poster?`<img class="video-poster" src="${esc(item.poster)}" alt="" loading="lazy">`:icon('play')}</button>`).join('')}</div><button type="button" class="text-btn background-pause" id="pause-background">${icon(videoFailed?'reset':video.paused?'play':'pause')}${videoFailed?' 重试背景':video.paused?' 播放背景':' 暂停背景'}</button><p class="media-note">背景静音循环播放，音乐由播放器独立控制。以后加入的视频也会列在这里。</p>`;
  }
  function bindVideoChoices(container){
    container.querySelectorAll('[data-video-select]').forEach(button=>button.onclick=()=>selectVideo(button.dataset.videoSelect));
    const pause=container.querySelector('#pause-background');
    if(pause)pause.onclick=()=>{if(readOnly())return;if(!activeVideo&&videos.length)selectVideo(videos[0].id);else if(videoFailed&&activeVideo)selectVideo(activeVideo.id);else if(video.paused)video.play().catch(error=>{if(error.name==='NotAllowedError')setVideoStatus('请再次点击播放背景。');else if(error.name!=='AbortError')failVideo();});else video.pause();updateVideoButtons();};
    updateVideoButtons();
  }
  window.studyMedia={renderLibrary,openPlaylist:()=>setPlaylistOpen(true,{focus:true}),videoChoices,bindVideoChoices,stopVideo,selectVideo,get playbackMode(){return playbackMode;},get tracks(){return tracks;},get videos(){return videos;},get activeVideo(){return activeVideo;}};
  async function init(){
    setVideoBackdrop(null);
    try{
      const response=await fetch('media-library.json',{cache:'no-cache'});if(!response.ok)throw Error('Media manifest unavailable');
      const data=await response.json();
      const valid=(item,kind)=>item&&typeof item.id==='string'&&typeof item.title==='string'&&typeof item.src==='string'&&new RegExp('^media/'+kind+'/[a-z0-9][a-z0-9.-]*$').test(item.src);
      const safePoster=poster=>typeof poster==='string'&&/^media\/video\/[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp|avif)$/.test(poster)?poster:'';
      tracks=Array.isArray(data.tracks)?data.tracks.filter(item=>valid(item,'music')).map(item=>({...item,local:false})):[];
      videos=Array.isArray(data.videos)?data.videos.filter(item=>valid(item,'video')).map(item=>({...item,poster:safePoster(item.poster)})):[];
      libraryReady=true;
      const cover='assets/music-cover.jpg';$('#music-cover-image').src=cover;$('#music-cover-image').hidden=false;
      const remembered=tracks.findIndex(item=>item.id===saved?.id);
      if(tracks.length)loadTrack(remembered>=0?remembered:0,{position:remembered>=0?saved.position:0,remember:false});else renderMusic();
      const selection=readStorage('studywithyorushika.background',null);
      if(videos.length){const rememberedVideo=typeof selection==='string'&&selection.startsWith('video:')?selection.slice(6):null;selectVideo(videos.some(item=>item.id===rememberedVideo)?rememberedVideo:videos[0].id);}
      else{persist('studywithyorushika.background',null);setVideoStatus('尚未加入背景视频。');}
      if(isDetailOpen()&&currentDialog==='scenes')openDialog('scenes');
    }catch(error){libraryReady=true;renderMusic();setVideoStatus('媒体目录暂时无法读取，请刷新重试。');toast('歌单暂时无法读取，请刷新重试。');}
  }
  window.addEventListener('pagehide',()=>{savePlayback();fileUrls.forEach(url=>URL.revokeObjectURL(url));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){savePlayback();videoWasPlaying=!!activeVideo&&!video.paused;video.pause();}else if(activeVideo&&videoWasPlaying)video.play().catch(()=>{});});
  renderMusic();init();
})();
