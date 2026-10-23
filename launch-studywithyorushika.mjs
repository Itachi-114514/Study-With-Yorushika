import {execFile} from 'node:child_process';
const url='http://127.0.0.1:5173/';
let alreadyRunning=false;
try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});const html=await response.text();if(response.ok&&html.includes('studywithyorushika')&&html.includes('timer-display'))alreadyRunning=true;else throw new Error('Port 5173 is occupied by another app.');}catch(error){if(error.message.includes('occupied'))throw error;}
if(!alreadyRunning)await import('./studywithyorushika/server.mjs');
console.log('studywithyorushika is ready: '+url);
if(!alreadyRunning)console.log('Keep this window open while studying. Press Ctrl+C to stop.');
setTimeout(()=>execFile('cmd.exe',['/c','start','',url],error=>{if(error)console.log('Please open '+url+' in your browser.');}),500);
