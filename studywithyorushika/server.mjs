import http from 'node:http';
import {open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=await realpath(path.join(path.dirname(fileURLToPath(import.meta.url)),'dist'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.wav':'audio/wav','.flac':'audio/flac','.mp4':'video/mp4','.webm':'video/webm'};
const server=http.createServer(async(req,res)=>{
 let handle;
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
  const url=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  const resolved=await realpath(file);if(!resolved.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  handle=await open(resolved,'r');const info=await handle.stat();if(!info.isFile()){await handle.close();res.writeHead(404);return res.end();}
  const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes','Last-Modified':info.mtime.toUTCString(),'X-Content-Type-Options':'nosniff'};
  let start=0,end=info.size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let valid=!!match;if(match){if(!match[1]&&match[2]){const count=Number(match[2]);start=Math.max(0,info.size-count);valid=count>0;}else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}}if(!valid||start>end||start>=info.size||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)){await handle.close();res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});return res.end();}status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;}
  headers['Content-Length']=String(end-start+1);res.writeHead(status,headers);
  if(req.method==='HEAD'||!info.size){await handle.close();return res.end();}
  const stream=handle.createReadStream({start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch(error){if(handle)await handle.close().catch(()=>{});if(!res.headersSent)res.writeHead(error instanceof URIError?400:404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 5173 is in use. Open http://127.0.0.1:5173/ or stop the other server.':error.message);process.exitCode=1;});
server.listen(5173,'127.0.0.1',()=>console.log('studywithyorushika · Local: http://127.0.0.1:5173'));
