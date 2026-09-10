const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'simplehmi-test-'));let server,slave;let log='';
function start(){server=spawn(process.execPath,[path.join(root,'server/main.js')],{cwd:temp,env:{...process.env,SIMPLEHMI:'1',PORT:'1882',userDir:temp},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);}
async function stop(child){if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');setTimeout(()=>{child.kill('SIGKILL');resolve()},2000).unref()})}
async function request(route,body,ok=true){const r=await fetch('http://127.0.0.1:1882/simplehmi/api'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(ok)assert.equal(r.status,200,JSON.stringify(v));return {status:r.status,data:v};}
async function until(fn,timeout=13000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const r=await fn();if(r)return r}catch(e){last=e}await sleep(200)}throw Error('Timed out '+(last?.message||''))}
function project(protocol='sim'){return {schemaVersion:1,id:'test',name:'验收工程',devices:[{id:'plc',name:'测试设备',protocol,host:'127.0.0.1',port:1503,unitId:1,polling:500,timeout:1000,tags:[{id:'temp',name:'温度',type:'UInt16',memory:'400000',address:1,divisor:10,unit:'°C',initial:23.6,sim:'wave',writable:true},{id:'coil',name:'开关',type:'Bool',memory:'0',address:1,divisor:1,initial:1,sim:'manual',writable:true}]}],pages:[{id:'main',name:'主页',width:1024,height:640,background:'#ffffff',components:[{id:'number',kind:'number',x:20,y:20,w:200,h:100,label:'温度',tagId:'temp',color:'#2563eb',fontSize:28}]}],activePageId:'main'}}
test('SimpleHMI real FUXA integration', {timeout:90000}, async t=>{
 try{
 start();await until(async()=> (await request('/status')).data.ready);
 await t.test('simulation runs through FUXA and supports writes',async()=>{await request('/project',project());const first=await until(async()=>{const r=(await request('/values')).data.values.temp;return r.quality==='good'&&r});await sleep(1200);const second=(await request('/values')).data.values.temp;assert.notEqual(first.value,second.value);const write=(await request('/write',{tagId:'coil',value:0})).data;assert.equal(write.verified,true);assert.equal(Number(write.value),0)});
 await t.test('layout saves and reloads without stopping devices',async()=>{let p=(await request('/project')).data;p.pages[0].components[0].x=160;p.pages[0].components[0].label='已修改温度';await request('/project',p);assert.equal((await request('/project')).data.pages[0].components[0].x,160);assert.ok((await request('/projects')).data.some(x=>x.id==='test'));});
 await t.test('invalid and read-only requests fail honestly',async()=>{assert.equal((await request('/project',{schemaVersion:99},false)).status,400);const p=project();p.devices[0].tags[0].writable=false;await request('/project',p);assert.equal((await request('/write',{tagId:'temp',value:20},false)).status,400)});
 slave=spawn(process.execPath,[path.join(root,'scripts/modbus-simulator.cjs')],{cwd:temp,env:{...process.env,MODBUS_PORT:'1503'},stdio:['ignore','pipe','pipe']});await sleep(700);
 await t.test('connection probe performs a real Modbus read',async()=>{const p=project('ModbusTCP');const {tags,...device}=p.devices[0];const probe=(await request('/test',device)).data;assert.equal(probe.read,236);assert.equal(probe.ok,true)});
 await t.test('failed connection probe returns an error without crashing server',async()=>{const d=project('ModbusTCP').devices[0];d.port=1504;const result=await request('/test',d,false);assert.equal(result.status,400);assert.match(result.data.error,/连接/);assert.equal((await request('/status')).data.ready,true)});
 await t.test('FUXA Modbus reads, writes register with scale, writes coil and verifies readback',async()=>{await request('/project',project('ModbusTCP'));await until(async()=>{const v=(await request('/values')).data.values;return v.temp.quality==='good'&&v.temp.value===23.6});let write=(await request('/write',{tagId:'temp',value:30.5})).data;assert.equal(write.value,30.5);write=(await request('/write',{tagId:'coil',value:0})).data;assert.equal(Number(write.value),0);const Modbus=require('../server/node_modules/modbus-serial');const independent=new Modbus();await independent.connectTCP('127.0.0.1',{port:1503});independent.setID(1);const raw=await independent.readHoldingRegisters(0,1);assert.equal(raw.data[0],305);await new Promise(r=>independent.close(r));});
 await t.test('automatic Modbus control needs session authorization and verifies actual coil readback',async()=>{
  let p=(await request('/project')).data;p.system={mode:'intelligent-control'};p.control={rules:[{id:'modbus_rule',name:'测试从站联动',enabled:true,inputTag:'temp',outputTag:'coil',direction:'low',onThreshold:31,offThreshold:32,onValue:1,offValue:0,outputMin:0,outputMax:1,holdMs:0,minIntervalMs:1000,maxAgeMs:3500,guards:[]}]};await request('/project',p);
  let state=(await request('/agent/state')).data;assert.equal((await request('/control/arm',{expectedRevision:state.revision},false)).status,400);
  await request('/control/arm',{expectedRevision:state.revision,allowPhysical:true,physicalTargets:['coil']});
  await until(async()=> (await request('/control/status')).data.rules[0]?.writes===1);
  const Modbus=require('../server/node_modules/modbus-serial'),client=new Modbus();await client.connectTCP('127.0.0.1',{port:1503});client.setID(1);assert.equal((await client.readCoils(0,1)).data[0],true);await new Promise(r=>client.close(r));
  assert.ok((await request('/control/events')).data.some(e=>e.event==='write-verified'&&e.ruleId==='modbus_rule'));
 });
 await t.test('disconnect becomes stale and cannot report successful write',async()=>{await stop(slave);await until(async()=> (await request('/values')).data.values.temp.quality==='stale');await until(async()=> (await request('/control/status')).data.state==='fault');const out=await request('/write',{tagId:'temp',value:35},false);assert.equal(out.status,400);assert.match(out.data.error,/回读/)});
 await t.test('switch project clears previous device and history exists',async()=>{const p=project();p.id='second';await request('/project',p);await until(async()=> (await request('/values')).data.values.temp.quality==='good');await sleep(1200);assert.ok((await request('/history/temp')).data.length>0);const upstream=await(await fetch('http://127.0.0.1:1882/api/project')).json();assert.ok(upstream.devices.sh_second_plc);assert.ok(!upstream.devices.sh_test_plc)});
 await t.test('server restart restores active saved project',async()=>{await stop(server);start();await until(async()=> (await request('/status')).data.ready);assert.equal((await request('/project')).data.id,'second');await until(async()=> (await request('/values')).data.values.temp.quality==='good')});
 await t.test('agent previews without mutation, applies once, and rejects stale competing plans',async()=>{
  const before=(await request('/agent/state')).data;
  const req={expectedRevision:before.revision,summary:'Agent API验收',operations:[{op:'project.configure',name:'Agent API 已应用',mode:'visualization'}]};
  const a=(await request('/agent/plans',req)).data,b=(await request('/agent/plans',req)).data;
  assert.equal((await request('/project')).data.name,before.project.name);
  const result=(await request(`/agent/plans/${a.id}/apply`,{})).data;assert.equal(result.status,'applied');
  assert.equal((await request(`/agent/plans/${a.id}/apply`,{})).data.replayed,true);
  assert.equal((await request(`/agent/plans/${b.id}/apply`,{},false)).status,409);
  const res=await fetch('http://127.0.0.1:1882/simplehmi/api/project',{method:'POST',headers:{'Content-Type':'application/json','If-Match':before.revision},body:JSON.stringify(before.project)});assert.equal(res.status,409);
  const now=(await request('/agent/state')).data;assert.equal(now.project.name,'Agent API 已应用');
  const c=(await request('/agent/plans',{...req,expectedRevision:now.revision})).data;await request(`/agent/plans/${c.id}/cancel`,{});assert.equal((await request(`/agent/plans/${c.id}/apply`,{},false)).status,400);
  assert.ok((await request('/agent/audit')).data.some(e=>e.event==='applied'&&e.planId===a.id));
  await stop(server);start();await until(async()=> (await request('/status')).data.ready);
  assert.equal((await request(`/agent/plans/${a.id}/apply`,{})).data.replayed,true);
 });
 await t.test('AI HTTP generation uses configured provider and produces an unapplied checked preview',async()=>{
  const http=require('node:http');let received;
  const model=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;received=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'测试模型协议输出',operations:[{op:'project.configure',name:'仅预览的名称'}]})}}]}))});
  await new Promise(r=>model.listen(0,'127.0.0.1',r));
  try{
   assert.equal((await request('/ai/config')).data.configured,false);assert.ok((await request('/agent/schema')).data.definitions.project);
   const configured=(await request('/ai/config',{provider:'openai-compatible',baseUrl:'http://127.0.0.1:'+model.address().port+'/v1',model:'protocol-fixture',apiKey:'test-not-real-key'})).data;assert.equal(configured.hasSessionKey,true);assert.ok(!JSON.stringify(configured).includes('test-not-real-key'));
   const before=(await request('/agent/state')).data;const job=(await request('/ai/generate',{prompt:'只预览工程重命名',mode:'visualization',expectedRevision:before.revision})).data;
   const done=await until(async()=>{const j=(await request('/ai/jobs/'+job.id)).data;return j.status!=='running'&&j});assert.equal(done.status,'ready',JSON.stringify(done));assert.equal(done.plan.project.name,'仅预览的名称');assert.equal((await request('/project')).data.name,before.project.name);assert.equal(received.model,'protocol-fixture');
   await request('/agent/plans/'+done.plan.id+'/cancel',{});assert.equal((await request('/ai/clear-key',{})).data.hasSessionKey,false);
  }finally{model.close()}
 });
 await t.test('water process runs through FUXA with independent opposite levels, conservation and stop/resume',async()=>{
  const {waterDemo}=await import('../simplehmi/water-demo.mjs');await request('/project',waterDemo('visualization','water_integration'));
  const first=await until(async()=>{const v=(await request('/values')).data.values;return v.source_level?.quality==='good'&&v.destination_level?.quality==='good'&&v});
  await sleep(2100);const next=(await request('/values')).data.values;assert.ok(next.source_level.value<first.source_level.value);assert.ok(next.destination_level.value>first.destination_level.value);assert.ok(Math.abs(next.total_volume.value-first.total_volume.value)<1e-8);
  await request('/write',{tagId:'pump_command',value:0});await until(async()=>Number((await request('/values')).data.values.pump_running.value)===0);
  const stopped=(await request('/values')).data.values;await sleep(1200);const held=(await request('/values')).data.values;assert.equal(stopped.source_level.value,held.source_level.value);assert.equal(stopped.destination_level.value,held.destination_level.value);assert.equal(held.transfer_flow.value,0);
  await request('/write',{tagId:'pump_command',value:1});await until(async()=>Number((await request('/values')).data.values.pump_running.value)===1);
 });
 await t.test('water rules automatically start and stop with readback; manual takeover and restart stay manual',async()=>{
  const {waterDemo}=await import('../simplehmi/water-demo.mjs');const p=waterDemo('intelligent-control','water_control_test');p.control.rules[0].onThreshold=31;p.control.rules[0].offThreshold=32;p.control.rules[0].holdMs=0;await request('/project',p);
  await until(async()=> (await request('/values')).data.values.destination_level?.quality==='good');const state=(await request('/agent/state')).data;
  await request('/control/arm',{expectedRevision:state.revision});
  await until(async()=> (await request('/control/status')).data.rules[0]?.writes>=2,16000);
  let v=(await request('/values')).data.values;assert.equal(Number(v.pump_command.value),0);assert.ok(v.destination_level.value>=32);assert.equal(v.total_volume.value,4.15);
  await request('/write',{tagId:'pump_command',value:1});assert.equal((await request('/control/status')).data.state,'manual');await sleep(1500);assert.equal(Number((await request('/values')).data.values.pump_command.value),1);
  await stop(server);start();await until(async()=> (await request('/status')).data.ready);assert.equal((await request('/control/status')).data.state,'manual');assert.equal((await request('/project')).data.control.rules.length,1);
 });
 await t.test('industry assessment persists exact citations, rejects changed conditions and applies a fresh reviewed strategy',async()=>{
  const {waterDemo}=await import('../simplehmi/water-demo.mjs');const p=waterDemo('industry-ai','industry_integration');await request('/project',p);await until(async()=> (await request('/values')).data.values.destination_level?.quality==='good');
  const http=require('node:http');const model=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const context=JSON.parse(JSON.parse(body).messages[1].content).evidenceContext;const value=Number(context.observed.pump_command.value);const output={summary:'引用资料确认演示补水策略',operations:[{op:'rule.upsert',rule:{id:'water_level_control',name:'有依据的补水策略'}}],assessment:{conclusion:'使用供水演示资料的阈值；不作为现场设计参数。',citations:[{entryId:'water_control_note',version:1,excerpt:'高位水箱液位 ≤ 35% 时启动供水泵，≥ 40% 时停止供水泵。'}],conditions:[{tagId:'pump_command',min:value,max:value}]}};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]}))});await new Promise(r=>model.listen(0,'127.0.0.1',r));
  try{
   await request('/ai/config',{provider:'openai-compatible',baseUrl:'http://127.0.0.1:'+model.address().port+'/v1',model:'assessment-fixture'});
   const state=(await request('/agent/state')).data;const body={task:'assess',prompt:'依据资料评估补水策略',mode:'industry-ai',expectedRevision:state.revision,knowledgeIds:['water_control_note'],observedTagIds:['pump_command']};
   const make=async()=>{const job=(await request('/ai/generate',body)).data;const done=await until(async()=>{const v=(await request('/ai/jobs/'+job.id)).data;return v.status!=='running'&&v});assert.equal(done.status,'ready',JSON.stringify(done));return done.plan;};
   const a=await make();assert.ok(a.assessment.citations[0].contentHash);
   const context=(await request('/industry/context',{...body,prompt:'外部 Agent 评估'})).data;
   const assessed=(await request('/industry/evaluations',{contextId:context.id,summary:'外部 Agent 有依据的无动作评估',operations:[],assessment:{conclusion:a.assessment.conclusion,citations:a.assessment.citations,conditions:a.assessment.conditions}})).data;
   assert.equal(assessed.status,'report');assert.equal((await request('/industry/evaluations/'+assessed.id)).data.assessment.citations[0].entryId,'water_control_note');
assert.equal((await request('/control/status')).data.state,'manual');await request('/write',{tagId:'pump_command',value:1});assert.equal((await request('/agent/plans/'+a.id+'/apply',{},false)).status,400);
   await request('/write',{tagId:'pump_command',value:0});const b=await make();await request('/agent/plans/'+b.id+'/apply',{});assert.equal((await request('/project')).data.control.rules[0].name,'有依据的补水策略');assert.equal((await request('/control/status')).data.state,'manual');
   const searched=(await request('/knowledge?q='+encodeURIComponent('液位'))).data.entries;assert.ok(searched.some(e=>e.id==='water_control_note'));
   const now=(await request('/agent/state')).data;const entry={...now.project.knowledge[1],version:2,content:now.project.knowledge[1].content+' 更新版本需重新评估。'};const update=(await request('/agent/plans',{expectedRevision:now.revision,operations:[{op:'knowledge.upsert',entry}]})).data;assert.ok(update.impacts.some(e=>e.code==='rule-evidence-invalid'));await request('/agent/plans/'+update.id+'/apply',{});assert.equal((await request('/project')).data.control.rules[0].enabled,false);
  }finally{model.close()}
 });
 await t.test('cross-origin mutation is rejected',async()=>{const r=await fetch('http://127.0.0.1:1882/simplehmi/api/project',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:JSON.stringify(project())});assert.equal(r.status,403)});
 }catch(e){console.error(log.slice(-12000));throw e}finally{await stop(server);await stop(slave);fs.rmSync(temp,{recursive:true,force:true})}
});
