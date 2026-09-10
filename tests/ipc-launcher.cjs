const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {configuration,serve,request,status}=require('../desktop/ipc/launcher.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('IPC controller owns one runtime, authenticates launches and stops only its child',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flex-ipc-')),c=configuration(path.resolve(__dirname,'..'),dir);let running;
 try{
  c.backend=path.join(dir,'fixture.cjs');fs.writeFileSync(c.backend,`const http=require('http');const server=http.createServer((q,s)=>s.end(JSON.stringify({ready:true,instance:process.env.SIMPLEHMI_INSTANCE})));server.listen(+process.env.PORT,'127.0.0.1');process.on('message',m=>{if(m.type==='shutdown')server.close(()=>process.exit(0))});`);
  const opened=[];running=serve(c,{openBrowser:async(c,origin,mode)=>opened.push({origin,mode})});
  let state;for(let i=0;i<50;i++){try{state=await request(c,'status');if(state.ready)break}catch{}await delay(100)}assert.equal(state.ready,true);
  assert.deepEqual(await serve(c),{duplicate:true});assert.equal((await request(c,'status')).pid,state.pid);
  for(const command of ['editor','runtime','kiosk'])assert.equal((await request(c,command)).opened,true);assert.deepEqual(opened.map(x=>x.mode),['editor','runtime','kiosk']);
  await assert.rejects(request(c,'unknown'),/不支持/);
  const denied=await new Promise((resolve,reject)=>{const s=net.createConnection(c.pipe);s.on('error',reject);s.on('connect',()=>s.write(JSON.stringify({token:'wrong',command:'stop'})+'\n'));let b='';s.on('data',d=>b+=d);s.on('end',()=>resolve(JSON.parse(b)))});assert.match(denied.error,/认证失败/);assert.equal((await request(c,'status')).ready,true);
  assert.equal((await status(state.origin)).instance,state.instance);await request(c,'stop');await running;assert.equal(fs.existsSync(c.state),false);assert.equal(await status(state.origin),null);
 }finally{try{await request(c,'stop')}catch{}if(running)await running;fs.rmSync(dir,{recursive:true,force:true})}
});
