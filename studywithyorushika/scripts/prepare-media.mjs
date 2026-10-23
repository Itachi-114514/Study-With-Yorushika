import {readdir,readFile,writeFile,mkdir,stat,copyFile,unlink} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=path.dirname(project);
const output=path.join(project,'dist');
const limit=25*1024*1024,target=24*1024*1024;
const argIndex=process.argv.indexOf('--ffmpeg');
const ffmpeg=argIndex>=0?process.argv[argIndex+1]:process.env.FFMPEG_PATH||'ffmpeg';
const hasFfmpeg=spawnSync(ffmpeg,['-version'],{windowsHide:true,encoding:'utf8'}).status===0;
const audioExtensions=new Set(['.mp3','.m4a','.aac','.ogg','.wav','.flac']);
const videoExtensions=new Set(['.mp4','.webm','.mov','.m4v']);
async function list(dir,extensions){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}let files=[];for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())files.push(...await list(file,extensions));else if(entry.isFile()&&extensions.has(path.extname(entry.name).toLowerCase()))files.push(file);}return files.sort((a,b)=>a.localeCompare(b,'zh-CN'));}
function probe(file){if(!hasFfmpeg)return {};const text=spawnSync(ffmpeg,['-hide_banner','-i',file],{windowsHide:true,encoding:'utf8',maxBuffer:2*1024*1024}).stderr||'';const time=/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);const dimensions=/Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(text);return {duration:time?+time[1]*3600+ +time[2]*60+ +time[3]:null,width:dimensions?+dimensions[1]:null,height:dimensions?+dimensions[2]:null,hevc:/Video:\s*hevc/i.test(text)};}
function run(args){return new Promise((resolve,reject)=>{const child=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let log='';child.stderr.on('data',chunk=>{log=(log+chunk).slice(-5000);});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error('FFmpeg failed: '+log)));});}
async function hash(file){return createHash('sha256').update(await readFile(file)).digest('hex').slice(0,16);}
async function exists(file){try{return (await stat(file)).size>0;}catch{return false;}}
async function safeCopy(src,dest){if(!await exists(dest))await copyFile(src,dest);}
async function copyClean(src,dest){if(await exists(dest))return;if(!hasFfmpeg){await copyFile(src,dest);return;}try{await run(['-hide_banner','-loglevel','error','-y','-i',src,'-map','0','-c','copy','-map_metadata','-1','-map_chapters','-1',dest]);}catch{await copyFile(src,dest);}}
async function prepare(){
 const tracks=[],videos=[],expected=new Set();let previous={};try{previous=JSON.parse(await readFile(path.join(output,'media-library.json'),'utf8'));}catch{}
 await mkdir(path.join(output,'media/music'),{recursive:true});await mkdir(path.join(output,'media/video'),{recursive:true});
 for(const file of await list(path.join(sourceRoot,'music'),audioExtensions)){
  const info=await stat(file);if(info.size>limit)throw Error('Music exceeds the 25 MiB Pages limit: '+file);
  const id='track-'+await hash(file),filename=id+path.extname(file).toLowerCase(),dest=path.join(output,'media/music',filename);
  await copyClean(file,dest);expected.add(dest);const meta=probe(file);
  tracks.push({id,title:path.basename(file,path.extname(file)),artist:'ヨルシカ',src:'media/music/'+filename,bytes:info.size,duration:meta.duration??previous.tracks?.find(t=>t.id===id)?.duration??null});
 }
 for(const file of await list(path.join(sourceRoot,'video'),videoExtensions)){
  const info=await stat(file),meta=probe(file),id='video-'+await hash(file),convert=info.size>limit||meta.hevc||path.extname(file).toLowerCase()!=='.mp4';
  const filename=id+(convert?'-avc.mp4':'.mp4'),dest=path.join(output,'media/video',filename),poster=path.join(output,'media/video',id+'.jpg');
  if(convert&&!await exists(dest)){
   if(!hasFfmpeg)throw Error('This video needs an H.264 copy below 25 MiB. Install FFmpeg or pass --ffmpeg <path>: '+file);
   console.log('Preparing background video (original kept): '+path.basename(file));
   for(const [crf,scale] of [[26,false],[28,false],[27,true],[30,true]]){
    await run(['-hide_banner','-loglevel','error','-y','-i',file,'-map','0:v:0','-an',...(scale?['-vf','scale=-2:720']:[]),'-c:v','libx264','-preset','slow','-crf',String(crf),'-pix_fmt','yuv420p','-movflags','+faststart',dest]);
    if((await stat(dest)).size<=target)break;
   }
  }else if(!convert)await copyClean(file,dest);
  const result=await stat(dest);if(result.size>limit)throw Error('Prepared video still exceeds 25 MiB: '+dest);expected.add(dest);
  if(hasFfmpeg&&!await exists(poster))await run(['-hide_banner','-loglevel','error','-y','-ss',String(Math.min(10,(meta.duration||20)/2)),'-i',dest,'-frames:v','1','-vf','scale=640:-2','-q:v','3',poster]);
  if(await exists(poster))expected.add(poster);
  const finalMeta=hasFfmpeg?probe(dest):previous.videos?.find(v=>v.id===id)||{};
  videos.push({id,title:path.basename(file,path.extname(file)),src:'media/video/'+filename,poster:await exists(poster)?'media/video/'+id+'.jpg':null,bytes:result.size,originalBytes:info.size,duration:finalMeta.duration,width:finalMeta.width,height:finalMeta.height});
 }
 // Remove only obsolete files generated by this script, within the two known output folders.
 for(const type of ['music','video'])for(const entry of await readdir(path.join(output,'media',type),{withFileTypes:true})){
  const file=path.join(output,'media',type,entry.name);if(entry.isFile()&&/^(track|video)-[a-f0-9]{16}(?:-avc)?\.[a-z0-9]+$/.test(entry.name)&&!expected.has(file))await unlink(file);
 }
 const library={schemaVersion:1,project:'studywithyorushika',tracks,videos};
 await writeFile(path.join(output,'media-library.json'),JSON.stringify(library,null,2)+'\n');
 console.log(JSON.stringify({trackCount:tracks.length,videoCount:videos.length,totalMiB:+((tracks.reduce((s,t)=>s+t.bytes,0)+videos.reduce((s,v)=>s+v.bytes,0))/1048576).toFixed(2),videos:videos.map(v=>({title:v.title,MiB:+(v.bytes/1048576).toFixed(2),width:v.width,height:v.height}))}));
}
prepare().catch(error=>{console.error(error.message);process.exitCode=1;});
