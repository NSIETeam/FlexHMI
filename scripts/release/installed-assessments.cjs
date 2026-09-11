'use strict';
// Exercise the installed backend and installed control module, with a local model protocol fixture.
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
module.exports=async function({root,api,until}){
 const original=await api('agent/state'),project=structuredClone(original.project);
 project.system={...project.system,mode:'industry-ai'};
 const entry={id:'installed_step_basis',version:1,title:'安装验收步骤资料',domain:'供水演示',source:'examples/water-steps.simplehmi.json；源码测试资料，不是行业标准',content:'待机至少两秒后，高位水箱液位小于32%时供水，达到32%停止。仅用于本软件的封闭水箱演示。'};
 project.knowledge=[entry];await api('project',project,{'If-Match':original.revision});
 await until(async()=> (await api('values')).values.total_volume?.quality==='good');
 let reportOnly=false;
 const output=context=>({summary:reportOnly?'安装验收：保留无改动报告':'安装验收：有依据的步骤流程',operations:reportOnly?[]:[{op:'machine.upsert',machine:{id:project.control.machines[0].id,name:'有依据的安装验收流程'}}],assessment:{conclusion:'采用源码供水演示步骤，参数不是现场标准。',citations:[{entryId:entry.id,version:1,excerpt:entry.content}],conditions:[{tagId:'total_volume',min:Number(context.observed.total_volume.value),max:Number(context.observed.total_volume.value)}]}});
 const model=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const context=JSON.parse(JSON.parse(body).messages[1].content).evidenceContext;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output(context))}}]}))}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}))}});
 await new Promise(r=>model.listen(0,'127.0.0.1',r));
 try{
  await api('ai/config',{provider:'openai-compatible',baseUrl:'http://127.0.0.1:'+model.address().port+'/v1',model:'installed-protocol-fixture'});
  const generate=async()=>{const job=await api('ai/generate',{task:'assess',mode:'industry-ai',prompt:'安装验收供水步骤',expectedRevision:(await api('agent/state')).revision,knowledgeIds:[entry.id],observedTagIds:['total_volume']});const done=await until(async()=>{const v=await api('ai/jobs/'+job.id);return v.status!=='running'&&v});assert.equal(done.status,'ready',JSON.stringify(done));assert.ok(done.evaluationId);return done};
  const plan=await generate();assert.deepEqual(plan.plan.project.control.machines[0].evidence,[{entryId:entry.id,version:1}]);
  await api('agent/plans/'+plan.plan.id+'/apply',{});assert.equal((await api('control/status')).state,'manual');
  reportOnly=true;const revision=(await api('agent/state')).revision,report=await generate();assert.equal(report.plan,undefined);assert.equal((await api('agent/state')).revision,revision);
  const first=await api('industry/evaluations?projectId='+project.id+'&source=model&q='+encodeURIComponent('安装验收')+'&limit=1');assert.equal(first.records.length,1);assert.ok(first.nextCursor);
  const next=await api('industry/evaluations?projectId='+project.id+'&source=model&q='+encodeURIComponent('安装验收')+'&limit=1&cursor='+first.nextCursor);assert.equal(next.records.length,1);assert.notEqual(first.records[0].id,next.records[0].id);
  const context=await api('industry/context',{expectedRevision:revision,prompt:'安装验收外部评估',knowledgeIds:[entry.id],observedTagIds:['total_volume']});
  const external=await api('industry/evaluations',{contextId:context.id,...output(context.context)});assert.equal(external.source,'external');assert.equal(external.status,'report');
  const update=await api('agent/plans',{expectedRevision:revision,operations:[{op:'knowledge.upsert',entry:{...entry,version:2}}]});assert.ok(update.impacts.some(i=>i.code==='machine-disabled'));await api('agent/plans/'+update.id+'/apply',{});assert.equal((await api('project')).control.machines[0].enabled,false);
  await api('project',original.project,{'If-Match':(await api('agent/state')).revision});
  // A source expiring while one real control-module write is awaiting readback must block the next output.
  const p=structuredClone(original.project),machine=p.control.machines[0],device=p.devices.find(d=>d.tags.some(t=>t.id==='pump_command'));
  device.tags.push({...device.tags.find(t=>t.id==='pump_command'),id:'second_test_pump'});
  for(const state of machine.states)state.actions.push({...state.actions.find(a=>a.tagId==='pump_command'),tagId:'second_test_pump'});
  p.knowledge=[{...entry,validUntil:new Date(12500).toISOString()}];machine.evidence=[{entryId:entry.id,version:1}];
  let time=10000;const values={source_level:{value:65,quality:'good',ts:time},destination_level:{value:30,quality:'good',ts:time},pump_command:{value:0,quality:'good',ts:time},second_test_pump:{value:0,quality:'good',ts:time}},writes=[];
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flex-installed-citation-'));
  try{const control=require(path.join(root,'server/simplehmi/control')).createControl({dir,getProject:()=>p,readValues:()=>values,now:()=>time,writeValue:async(id,value)=>{writes.push(id);values[id].value=value;time+=1000;for(const v of Object.values(values))v.ts=time;return {verified:true,value}}});control.arm();time+=2000;for(const v of Object.values(values))v.ts=time;await control.tick();assert.equal(control.status().state,'fault');assert.match(control.status().reason,/过期/);assert.deepEqual(writes,['pump_command']);assert.equal(control.status().machines[0].writes,1);assert.equal(control.status().machines[0].stateId,machine.initialState)}finally{fs.rmSync(dir,{recursive:true,force:true})}
  return {modelPlanId:plan.plan.id,modelEvaluationId:plan.evaluationId,reportId:report.evaluationId,externalReportId:external.id,stepEvidenceAttached:true,knowledgeChangeDisablesStep:true,reportDoesNotChangeProject:true,assessmentSearchPagination:true,expiredEvidenceStopsFurtherWrites:true,modelProvider:'local protocol fixture'};
 }finally{model.close()}
};
