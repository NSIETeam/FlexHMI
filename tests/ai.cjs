const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');
const {createAi,normalizeConfig,parsePlan,completion}=require('../server/simplehmi/ai');
const {applyOperations,digest}=require('../server/simplehmi/agent');const {validate}=require('../server/simplehmi');
const initial=()=>({schemaVersion:1,id:'ai_test',name:'原工程',devices:[],activePageId:'main',pages:[{id:'main',name:'总览',width:1280,height:720,components:[]}]});
const output=JSON.stringify({summary:'重命名',operations:[{op:'project.configure',name:'模型计划'}]});
function fixture(t,complete,timeoutMs){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'simplehmi-ai-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let active=initial(),plans=[],events=[];
 const service=createAi({dir,getProject:()=>active,digest,complete,timeoutMs,audit:e=>events.push(e),validatePlan:(p,r)=>applyOperations(p,r,validate),previewPlan:async request=>{if(request.expectedRevision!==digest(active)){const e=Error('revision conflict');e.status=409;throw e}const p={id:'testplan',...await applyOperations(active,request,validate)};plans.push(p);return p;}});
 service.configure({provider:'openai-compatible',baseUrl:'https://example.invalid/v1',model:'test-model',apiKey:'test-only-secret'});
 return {service,dir,plans,events,getProject:()=>active,change:()=>{active.name='人工修改'},request:()=>({prompt:'把当前工程改名',expectedRevision:digest(active),mode:'visualization'})};}
test('model settings reject insecure remote URLs and credentials never persist or move to a new destination',t=>{assert.throws(()=>normalizeConfig({provider:'openai-compatible',baseUrl:'http://remote.invalid',model:'test'}),/HTTPS/);assert.throws(()=>normalizeConfig({provider:'ollama',baseUrl:'https://remote.invalid',model:'test'}),/本机/);const f=fixture(t,async()=>output);assert.equal(f.service.status().hasSessionKey,true);assert.ok(!fs.readFileSync(path.join(f.dir,'ai/config.json'),'utf8').includes('secret'));f.service.configure({provider:'openai-compatible',baseUrl:'https://other.invalid/v1',model:'test'});assert.equal(f.service.status().hasSessionKey,false);assert.ok(!JSON.stringify(f.events).includes('secret'));});
test('generation wait settings validate bounds and survive restart without persisting credentials',t=>{
 const config={provider:'openai-compatible',baseUrl:'http://127.0.0.1:1234/v1',model:'local-test'};
 assert.equal(normalizeConfig(config).timeoutSeconds,120);
 for(const timeoutSeconds of [0,29,901,30.5,'invalid',Infinity])assert.throws(()=>normalizeConfig({...config,timeoutSeconds}),/30–900/);
 for(const timeoutSeconds of [30,900])assert.equal(normalizeConfig({...config,timeoutSeconds}).timeoutSeconds,timeoutSeconds);
 const f=fixture(t,async()=>output);f.service.configure({...config,timeoutSeconds:900,apiKey:'session-only-test'});
 const saved=JSON.parse(fs.readFileSync(path.join(f.dir,'ai/config.json'),'utf8'));assert.equal(saved.timeoutSeconds,900);assert.ok(!JSON.stringify(saved).includes('session-only-test'));
 const restart=()=>createAi({dir:f.dir,getProject:f.getProject,digest,audit:()=>{}}).status();
 assert.equal(restart().timeoutSeconds,900);assert.equal(restart().hasSessionKey,false);
 delete saved.timeoutSeconds;fs.writeFileSync(path.join(f.dir,'ai/config.json'),JSON.stringify(saved));assert.equal(restart().timeoutSeconds,120,'older saved configurations retain the two-minute default');
});
test('each job snapshots its wait budget and terminal elapsed time stays fixed',async t=>{
 let release;const f=fixture(t,()=>new Promise(r=>release=r)),config={provider:'openai-compatible',baseUrl:'https://example.invalid/v1',model:'test-model'};
 f.service.configure({...config,timeoutSeconds:900});const job=f.service.start(f.request());assert.equal(job.timeoutSeconds,900);
 f.service.configure({...config,timeoutSeconds:30});assert.equal(f.service.get(job.id).timeoutSeconds,900);
 const cancelled=f.service.cancel(job.id);await new Promise(r=>setTimeout(r,15));assert.equal(f.service.get(job.id).elapsedMs,cancelled.elapsedMs,'cancellation stops the clock even if the provider has not resolved');
 release(output);await f.service.wait(job.id);assert.equal(f.service.get(job.id).elapsedMs,cancelled.elapsedMs);assert.equal(f.plans.length,0);
 const next=f.service.start(f.request());assert.equal(next.timeoutSeconds,30);release(output);await f.service.wait(next.id);const ready=f.service.get(next.id);assert.equal(ready.status,'ready');await new Promise(r=>setTimeout(r,15));assert.equal(f.service.get(next.id).elapsedMs,ready.elapsedMs);
});
test('a model output becomes a checked preview only, never applies to the live project',async t=>{const f=fixture(t,async(config,key,messages)=>{assert.equal(key,'test-only-secret');assert.ok(!JSON.stringify(messages).includes(key));return output;});const job=f.service.start(f.request());await f.service.wait(job.id);assert.equal(f.service.get(job.id).status,'ready');assert.equal(f.plans[0].project.name,'模型计划');assert.equal(f.getProject().name,'原工程');});
test('invalid model operations get exactly one repair and a second invalid answer fails',async t=>{let calls=0;const f=fixture(t,async()=>++calls===1?JSON.stringify({summary:'bad',operations:[{op:'not-real'}]}):output);const j=f.service.start(f.request());await f.service.wait(j.id);assert.equal(calls,2);assert.equal(f.service.get(j.id).status,'ready');let bad=0;const g=fixture(t,async()=>{bad++;return 'not json'});const k=g.service.start(g.request());await g.service.wait(k.id);assert.equal(bad,2);assert.equal(g.service.get(k.id).status,'failed');assert.equal(g.plans.length,0);});
test('concurrent engineering edits invalidate model output rather than replacing the revision',async t=>{let release;const f=fixture(t,()=>new Promise(r=>release=r));const j=f.service.start(f.request());f.change();release(output);await f.service.wait(j.id);assert.equal(f.service.get(j.id).status,'failed');assert.equal(f.plans.length,0);assert.equal(f.getProject().name,'人工修改');});
test('cancellation and timeout cannot produce a late preview',async t=>{let release;const f=fixture(t,()=>new Promise(r=>release=r));const j=f.service.start(f.request());assert.throws(()=>f.service.start(f.request()),/已有/);f.service.cancel(j.id);release(output);await f.service.wait(j.id);assert.equal(f.service.get(j.id).status,'cancelled');assert.equal(f.plans.length,0);
 const g=fixture(t,(_c,_k,_m,signal)=>new Promise((r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),20);g.service.configure({...g.service.status(),timeoutSeconds:900});const k=g.service.start(g.request());const keepAlive=setTimeout(()=>{},1000);await g.service.wait(k.id);clearTimeout(keepAlive);assert.match(g.service.get(k.id).error,/超时/);assert.match(g.service.get(k.id).error,/更快的模型或分步生成/);assert.ok(!g.service.get(k.id).error.includes('延长等待'));assert.equal(g.plans.length,0);});
test('both provider wire protocols parse valid JSON; redirect does not leak bearer token',async t=>{let requests=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;requests.push({url:req.url,auth:req.headers.authorization,body:JSON.parse(raw)});res.setHeader('Content-Type','application/json');if(req.url==='/redirect/chat/completions'){res.writeHead(302,{Location:'/stolen'});res.end();return}res.end(JSON.stringify(req.url==='/api/chat'?{done:true,message:{content:output}}:{choices:[{message:{content:output},finish_reason:'stop'}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const baseUrl='http://127.0.0.1:'+server.address().port;const messages=[{role:'system',content:'JSON'}];const signal=new AbortController().signal;
 assert.equal(await completion({provider:'openai-compatible',baseUrl:baseUrl+'/v1',model:'wire-test',jsonMode:true},'test-only',messages,signal),output);assert.equal(requests[0].url,'/v1/chat/completions');assert.equal(requests[0].body.response_format.type,'json_object');assert.equal(requests[0].body.store,false);
 assert.equal(await completion({provider:'ollama',baseUrl,model:'wire-test'},'',messages,signal),output);assert.equal(requests[1].body.format,'json');assert.equal(requests[1].auth,undefined);
 await assert.rejects(completion({provider:'openai-compatible',baseUrl:baseUrl+'/redirect',model:'wire-test'},'test-only',messages,signal),/重定向/);assert.ok(!requests.some(r=>r.url==='/stolen'));
});
test('plan schema is valid draft-07 and model cannot choose actor or revision',()=>{const Ajv=require('../server/node_modules/ajv');const {planSchema}=require('../server/simplehmi/ai-contract');const ajv=new Ajv({strict:false});assert.equal(ajv.validateSchema(planSchema),true,JSON.stringify(ajv.errors));assert.ok(ajv.compile(planSchema)(JSON.parse(output)));const parsed=parsePlan(JSON.stringify({...JSON.parse(output),actor:'admin',expectedRevision:'wrong'}));assert.equal(parsed.actor,undefined);assert.equal(parsed.expectedRevision,undefined);});
test('model transport bounds decompressed data and cancellation closes pending headers and bodies',async t=>{
 let entered,closed;
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/oversize')){res.setHeader('Content-Encoding','gzip');res.end(require('node:zlib').gzipSync(Buffer.from(JSON.stringify({padding:'x'.repeat(2000001)}))));return;}
  if(req.url.startsWith('/gateway')){res.writeHead(502);res.end('{}');return;}
  if(req.url.startsWith('/body')){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');}
  res.on('close',()=>closed?.());entered?.();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const config=route=>({provider:'openai-compatible',baseUrl:`http://127.0.0.1:${server.address().port}/${route}`,model:'wire-test',jsonMode:true,timeoutSeconds:900});
 await assert.rejects(completion(config('oversize'),'',[],new AbortController().signal),/2 MB/);
 await assert.rejects(completion(config('gateway'),'',[],new AbortController().signal),/HTTP 502.*服务暂时不可用/);
 for(const route of ['headers','body']){
  const controller=new AbortController(),arrival=new Promise(r=>entered=r),disconnected=new Promise(r=>closed=r);
  const pending=completion(config(route),'',[],controller.signal);const rejected=assert.rejects(pending,()=>controller.signal.aborted);
  await arrival;controller.abort();await rejected;await disconnected;
 }
});
test('duplicate ID feedback identifies both conflicting objects for model repair',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs');
 let p=waterDemo('visualization','diagnostic_test');p.pages[0].components[0].id=p.devices[0].id;
 assert.throws(()=>validate(p),/ID 重复：supply.*设备\/supply.*画面\/overview\/组件\/supply/);
 p=waterDemo('visualization','diagnostic_test');p.pages[1].components[0].id=p.pages[0].components[0].id;
 assert.throws(()=>validate(p),/画面\/overview\/组件\/heading.*画面\/trends\/组件\/heading/);
 p=waterDemo('visualization','diagnostic_test');p.devices[0].tags[0].id='prototype';
 assert.throws(()=>validate(p),/ID 无效：设备\/supply\/变量\/prototype/);
});
