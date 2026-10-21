const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {validate}=require('../server/simplehmi');const {applyOperations,digest}=require('../server/simplehmi/agent');const {createAi}=require('../server/simplehmi/ai');
const {validateKnowledge,validateKnowledgeRevision,searchKnowledge,evaluationContext,verifyAssessment,assertAssessmentFresh,citationProblems}=require('../server/simplehmi/knowledge');

test('model-generated steps inherit verified citations and stop when their basis changes or expires', async t => {
 const {p,values,request}=await fixture();
 p.control.rules=[];
 p.knowledge.find(e=>e.id==='water_control_note').validUntil=new Date(Date.now()+60000).toISOString();
 const machine=structuredClone(require('../examples/water-steps.simplehmi.json').control.machines[0]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flex-assessed-steps-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let preview;
 const ai=createAi({dir,getProject:()=>p,getValues:()=>values,digest,audit:()=>{},
  complete:async(c,k,m)=>JSON.stringify({...report(JSON.parse(m[1].content).evidenceContext),operations:[{op:'machine.upsert',machine}]}),
  validatePlan:(before,r)=>applyOperations(before,r,validate),
  previewPlan:async(r,signal,a)=>(preview={...await applyOperations(p,r,validate),assessment:a})});
 ai.configure({provider:'ollama',baseUrl:'http://127.0.0.1:11434',model:'test-fixture'});
 const job=ai.start({...request,task:'assess',mode:'industry-ai',expectedRevision:digest(p)});
 await ai.wait(job.id);
 assert.equal(ai.get(job.id).status,'ready',JSON.stringify(ai.get(job.id)));
 const generated=preview.project.control.machines[0];
 assert.deepEqual(generated.evidence,[{entryId:'water_control_note',version:1}]);
 assert.equal(p.control.machines,undefined,'preview must not modify the source project');
 const entry=preview.project.knowledge.find(e=>e.id==='water_control_note');
 for(const operation of [{op:'knowledge.upsert',entry:{...entry,version:2}},{op:'knowledge.delete',id:entry.id}]){
  const changed=await applyOperations(preview.project,{operations:[operation]},validate);
  assert.equal(changed.project.control.machines[0].enabled,false);
  assert.ok(changed.impacts.some(i=>i.code==='machine-disabled'));
 }
 let time=Date.now(),writes=0;
 values.pump_command={value:0,ts:time,quality:'good'};
 const control=require('../server/simplehmi/control').createControl({dir,getProject:()=>preview.project,readValues:()=>values,now:()=>time,writeValue:async()=>{writes++;return {verified:true}}});
 control.arm();
 time=Date.parse(entry.validUntil)+1;
 for(const value of Object.values(values))value.ts=time;
 await control.tick();
 assert.equal(control.status().state,'fault');
 assert.match(control.status().reason,/依据.*过期/);
 assert.equal(writes,0);
});
async function fixture(){const {waterDemo}=await import('../simplehmi/water-demo.mjs');const p=waterDemo('industry-ai','industry_test');const values={destination_level:{value:30,ts:Date.now(),quality:'good'},source_level:{value:65,ts:Date.now(),quality:'good'}};return {p,values,request:{prompt:'评估高位水箱补水启停策略',knowledgeIds:['water_control_note'],observedTagIds:['destination_level','source_level']}}}
test('long model waits never extend the three-minute assessment observation lifetime',async t=>{
 const {p,values,request}=await fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmi-assessment-budget-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ai=createAi({dir,getProject:()=>p,getValues:()=>values,digest,audit:()=>{},complete:(_c,_k,_m,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled'))))});
 for(const timeoutSeconds of [30,900]){
  ai.configure({provider:'ollama',baseUrl:'http://127.0.0.1:11434',model:'test-fixture',timeoutSeconds});
  const job=ai.start({...request,task:'assess',mode:'industry-ai',expectedRevision:digest(p)});
  assert.ok(job.timeoutSeconds<=Math.min(timeoutSeconds,180));assert.ok(job.timeoutSeconds>Math.min(timeoutSeconds,180)-2);
  ai.cancel(job.id);await ai.wait(job.id);assert.equal(ai.get(job.id).status,'cancelled');
 }
});
function report(ctx){return {summary:'采用有依据的演示回差策略',operations:[{op:'rule.upsert',rule:{id:'water_level_control',onThreshold:35,offThreshold:40}}],assessment:{conclusion:'根据演示回差策略，低液位具备补水条件；参数仅用于该模拟。',citations:[{entryId:'water_control_note',version:1,excerpt:'高位水箱液位 ≤ 35% 时启动供水泵，≥ 40% 时停止供水泵。'}],conditions:Object.keys(ctx.observed).map(id=>({tagId:id,min:id==='destination_level'?25:60,max:id==='destination_level'?35:70}))}}}
test('knowledge validation, Chinese retrieval, exact version increments and expired sources',async()=>{const {p,values,request}=await fixture();validate(p);assert.ok(searchKnowledge(p,'液位补水').some(e=>e.id==='water_control_note'));const next=structuredClone(p);next.knowledge[0].content+='修改';assert.throws(()=>validateKnowledgeRevision(p,next),/版本/);next.knowledge[0].version++;assert.doesNotThrow(()=>validateKnowledgeRevision(p,next));p.knowledge[1].validUntil='2000-01-01T00:00:00Z';assert.throws(()=>evaluationContext(p,request,values),/过期/);assert.ok(searchKnowledge(p,'')[1].expired||searchKnowledge(p,'').some(e=>e.expired));const invalid=structuredClone(p);invalid.knowledge[0].version=0;assert.throws(()=>validateKnowledge(invalid),/版本/)});
test('citations require exact source excerpts and every observed value has a valid interval',async()=>{const {p,values,request}=await fixture();const ctx=evaluationContext(p,request,values),out=report(ctx);assert.ok(verifyAssessment(out,ctx).citations[0].contentHash);out.assessment.citations[0].excerpt='不存在的行业标准条款';assert.throws(()=>verifyAssessment(out,ctx),/摘录/);const bad=report(ctx);bad.assessment.conditions[0].max=20;assert.throws(()=>verifyAssessment(bad,ctx),/区间/);const missing=report(ctx);missing.assessment.conditions.pop();assert.throws(()=>verifyAssessment(missing,ctx),/每个/);values.source_level.quality='stale';assert.throws(()=>evaluationContext(p,request,values),/过期/)});
test('application checks data drift, source mutation, expiration and observed tag configuration',async()=>{const {p,values,request}=await fixture(),ctx=evaluationContext(p,request,values),assessment=verifyAssessment(report(ctx),ctx);assert.doesNotThrow(()=>assertAssessmentFresh(assessment,p,values));values.destination_level.value=80;assert.throws(()=>assertAssessmentFresh(assessment,p,values),/区间/);values.destination_level.value=30;const changed=structuredClone(p);changed.devices[0].tags.find(t=>t.id==='source_level').name='改名';assert.throws(()=>assertAssessmentFresh(assessment,changed,values),/配置/);const missing=structuredClone(p);missing.knowledge=[];assert.throws(()=>validate(missing),/依据/);const source=structuredClone(p);source.knowledge[1].content+='偷偷修改';assert.throws(()=>assertAssessmentFresh(assessment,source,values),/知识/);assert.throws(()=>assertAssessmentFresh(assessment,p,values,assessment.expiresAt+1),/过期/)});
test('knowledge changes and deletes disable dependent rules and appear in plan changes',async()=>{const {p}=await fixture();const entry={...p.knowledge[1],version:2,content:p.knowledge[1].content+' 需要重新复核。'};const r=await applyOperations(p,{operations:[{op:'knowledge.upsert',entry}]},validate);assert.equal(r.project.control.rules[0].enabled,false);assert.ok(r.impacts.some(i=>i.code==='rule-evidence-invalid'));assert.ok(r.changes.some(c=>c.entity.includes('knowledge/water_control_note')));const d=await applyOperations(p,{operations:[{op:'knowledge.delete',id:'water_control_note'}]},validate);assert.equal(d.project.control.rules[0].enabled,false);assert.match(citationProblems(d.project,d.project.control.rules[0])[0],/删除/)});
test('model assessment receives selected evidence, creates a cited preview, and never auto-executes',async t=>{const {p,values,request}=await fixture();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmi-assessment-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let preview,context;const ai=createAi({dir,getProject:()=>p,getValues:()=>values,digest,audit:()=>{},complete:async(c,k,m)=>{context=JSON.parse(m[1].content).evidenceContext;assert.equal(JSON.parse(m[1].content).currentProject.knowledge,undefined);return JSON.stringify(report(context));},validatePlan:(before,r)=>applyOperations(before,r,validate),previewPlan:async(r,signal,a)=>{preview={...await applyOperations(p,r,validate),assessment:a};return preview;}});ai.configure({provider:'ollama',baseUrl:'http://127.0.0.1:11434',model:'test-fixture'});const job=ai.start({...request,task:'assess',mode:'industry-ai',expectedRevision:digest(p)});await ai.wait(job.id);assert.equal(ai.get(job.id).status,'ready');assert.equal(context.entries.length,1);assert.ok(preview.assessment.citations.length);assert.deepEqual(preview.project.control.rules[0].evidence,[{entryId:'water_control_note',version:1}]);assert.equal(p.control.rules[0].onThreshold,35)});
test('empty-action assessment is a report and does not fabricate a modification',async t=>{const {p,values,request}=await fixture();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmi-assessment-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const ai=createAi({dir,getProject:()=>p,getValues:()=>values,digest,audit:()=>{},complete:async(c,k,m)=>JSON.stringify({...report(JSON.parse(m[1].content).evidenceContext),operations:[]}),previewPlan:()=>{throw Error('must not create plan')},validatePlan:()=>{throw Error('must not fabricate operations')}});ai.configure({provider:'ollama',baseUrl:'http://127.0.0.1:11434',model:'test-fixture'});const j=ai.start({...request,task:'assess',mode:'industry-ai',expectedRevision:digest(p)});await ai.wait(j.id);assert.ok(ai.get(j.id).report);assert.equal(ai.get(j.id).plan,undefined);const store=require('../server/simplehmi/assessment-store').createAssessmentStore(dir);const saved=store.read(ai.get(j.id).evaluationId);assert.equal(saved.projectId,p.id);assert.equal(saved.source,'model');assert.deepEqual(saved.assessment,ai.get(j.id).report);assert.equal(store.list({projectId:p.id,source:'model'}).records[0].id,saved.id)});
test('an armed rule faults when its cited source expires, without writing another output',async t=>{const {p,values}=await fixture();const {createControl}=require('../server/simplehmi/control');let time=Date.now(),writes=0;values.pump_command={value:0,quality:'good',ts:time};p.knowledge[1].validUntil=new Date(time+1000).toISOString();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmi-evidence-control-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const control=createControl({dir,getProject:()=>p,readValues:()=>values,now:()=>time,writeValue:async()=>{writes++;return {verified:true}}});control.arm();time+=1500;await control.tick();assert.equal(control.status().state,'fault');assert.match(control.status().reason,/过期/);assert.equal(writes,0)});
