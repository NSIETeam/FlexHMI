'use strict';
// Browser-free IPC edition. A per-user local socket owns exactly one backend child.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),http=require('node:http');
const {spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function configuration(root=path.resolve(__dirname,'../..'),data=path.join(process.env.LOCALAPPDATA||require('node:os').homedir(),'FlexHMI-IPC')){
 const key=crypto.createHash('sha256').update(path.resolve(data).toLowerCase()).digest('hex').slice(0,24);
 return {root,data,pipe:process.platform==='win32'?`\\\\.\\pipe\\FlexHMI-${key}`:path.join(data,'controller.sock'),state:path.join(data,'controller.json'),node:process.execPath,backend:path.join(root,'desktop/backend.cjs')};
}
function log(c,value){try{const file=path.join(c.data,'ipc.log');if(fs.existsSync(file)&&fs.statSync(file).size>5*1024*1024)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,`${new Date().toISOString()} ${value}\n`)}catch{}}
function edgePath(){const candidates=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p,'Microsoft/Edge/Application/msedge.exe'));return candidates.find(p=>fs.existsSync(p))||null}
function openBrowser(c,origin,mode){
 const edge=edgePath();if(!edge)throw Error('未找到 Microsoft Edge。请安装 Edge 后重试；无需安装 Node.js。');
 const url=origin+'/simplehmi/'+(mode==='editor'?'':mode==='kiosk'?'?runtime=1&kiosk=1':'?runtime=1');
 const args=['--no-first-run','--user-data-dir='+path.join(c.data,'browser')];
 if(mode==='kiosk')args.push('--kiosk',url,'--edge-kiosk-type=fullscreen');else args.push('--app='+url);
 return new Promise((resolve,reject)=>{const child=spawn(edge,args,{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})});
}
function request(c,command,timeout=2000){return new Promise((resolve,reject)=>{
 let meta;try{meta=JSON.parse(fs.readFileSync(c.state,'utf8'))}catch(e){return reject(e)}
 const socket=net.createConnection(c.pipe);let buffer='';socket.setTimeout(timeout,()=>socket.destroy(Error('本地服务响应超时')));
 socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({token:meta.token,command})+'\n'));
 socket.on('data',b=>{buffer+=b;if(buffer.length>65536)return socket.destroy(Error('响应过长'));if(buffer.includes('\n')){try{const result=JSON.parse(buffer.split('\n')[0]);socket.end();result.error?reject(Error(result.error)):resolve(result)}catch(e){socket.destroy();reject(e)}}});socket.on('end',()=>{if(!buffer.includes('\n'))reject(Error('本地服务已关闭'))});
})}
function status(origin){return new Promise(resolve=>{const req=http.get(origin+'/simplehmi/api/status',{timeout:1000},res=>{let s='';res.on('data',b=>s+=b);res.on('end',()=>{try{resolve(JSON.parse(s))}catch{resolve(null)}})});req.on('error',()=>resolve(null));req.on('timeout',()=>req.destroy())})}
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})}
async function serve(c,options={}){
 fs.mkdirSync(c.data,{recursive:true});let child,ready=false,closing=false,origin,exitResolve,owned=false;
 const token=crypto.randomBytes(32).toString('hex'),instance=crypto.randomUUID(),ended=new Promise(r=>exitResolve=r);
 async function close(){if(closing)return ended;closing=true;ready=false;if(child&&child.exitCode===null){if(child.connected)child.send({type:'shutdown'});await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null)child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),delay(2000)])}
  server.close();if(owned){try{const meta=JSON.parse(fs.readFileSync(c.state));if(meta.token===token)fs.unlinkSync(c.state)}catch{}}
  process.off('SIGINT',close);process.off('SIGTERM',close);exitResolve();return ended;
 }
 const server=net.createServer(socket=>{let buf='';socket.setTimeout(5000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',async b=>{buf+=b;if(buf.length>4096)return socket.destroy();if(!buf.includes('\n'))return;const line=buf.split('\n')[0];buf='';socket.pause();try{
  const m=JSON.parse(line);if(typeof m.token!=='string'||m.token.length!==token.length||!crypto.timingSafeEqual(Buffer.from(m.token),Buffer.from(token)))throw Error('本地服务认证失败');
  if(m.command==='status'){socket.end(JSON.stringify({ready,origin,instance,pid:child?.pid,closing})+'\n');return}
  if(m.command==='stop'){socket.end('{"stopping":true}\n');void close();return}
  if(!['editor','runtime','kiosk'].includes(m.command))throw Error('不支持的启动方式');if(!ready||closing)throw Error('运行服务尚未就绪');
  await (options.openBrowser||openBrowser)(c,origin,m.command);socket.end('{"opened":true}\n');
 }catch(e){socket.end(JSON.stringify({error:e.message})+'\n')}})});
 // Listening claims the singleton before any metadata or backend is created.
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(c.pipe,resolve)})}catch(e){if(e.code==='EADDRINUSE')return {duplicate:true};throw e}
 owned=true;fs.writeFileSync(c.state,JSON.stringify({token,pid:process.pid}),{mode:0o600});
 server.on('error',e=>{log(c,e.stack);void close()});process.on('SIGINT',close);process.on('SIGTERM',close);
 try{
  const port=await freePort();origin=`http://127.0.0.1:${port}`;
  child=spawn(c.node,[c.backend],{cwd:c.data,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,SIMPLEHMI:'1',PORT:String(port),userDir:c.data,SIMPLEHMI_INSTANCE:instance,PATH:path.join(c.root,'node')+path.delimiter+(process.env.PATH||'')}});
  child.stdout.on('data',b=>log(c,b.toString()));child.stderr.on('data',b=>log(c,b.toString()));child.on('error',e=>{log(c,e.stack);void close()});child.once('exit',(code)=>{log(c,'Backend exited: '+code);void close()});
  for(let i=0;i<240&&!closing;i++){const s=await status(origin);if(s?.ready&&s.instance===instance){ready=true;log(c,'FlexHMI ready: '+origin);break}await delay(250)}
  if(!ready&&!closing)throw Error('运行服务启动超过 60 秒');
 }catch(e){log(c,e.stack);await close();throw e}
 await ended;return {stopped:true};
}
async function main(){const c=configuration();fs.mkdirSync(c.data,{recursive:true});const mode=(process.argv[2]||'--editor').replace(/^--/,'');
 try{
  if(mode==='daemon'){await serve(c);return}
  if(!['editor','runtime','kiosk','stop','status'].includes(mode))throw Error('无效参数');
  if(mode==='status'){console.log(JSON.stringify(await request(c,'status')));return}
  if(mode==='stop'){try{await request(c,'stop')}catch(e){if(!['ENOENT','ECONNREFUSED'].includes(e.code))throw e;return}for(let i=0;i<40;i++){try{await request(c,'status')}catch(e){if(['ENOENT','ECONNREFUSED'].includes(e.code))return}await delay(250)}throw Error('服务尚未停止，请查看 ipc.log。')}
  if(!edgePath())throw Error('未找到 Microsoft Edge，请先安装 Edge。');
  let existing;try{existing=await request(c,'status')}catch{}
  if(!existing){const daemon=spawn(c.node,[__filename,'--daemon'],{cwd:c.data,detached:true,stdio:'ignore',windowsHide:true});await new Promise((resolve,reject)=>{daemon.once('error',reject);daemon.once('spawn',()=>{daemon.unref();resolve()})})}
  for(let i=0;i<260;i++){let s;try{s=await request(c,'status')}catch{}if(s?.ready){await request(c,mode,10000);return}await delay(250)}
  throw Error('运行服务未能就绪。请查看 ipc.log。');
 }catch(e){log(c,e.stack);fs.writeFileSync(path.join(c.data,'last-error.txt'),e.message,'utf8');console.error(e.message);process.exitCode=1}
}
module.exports={configuration,serve,request,status,edgePath};if(require.main===module)void main();
