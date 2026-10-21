const {test}=require('node:test'),assert=require('node:assert/strict');
const {applyOperations,digest}=require('../server/simplehmi/agent');
const {validate}=require('../server/simplehmi');
function project(){return {schemaVersion:1,id:'agent_test',name:'Agent test',devices:[{id:'plc',name:'模拟PLC',protocol:'sim',host:'127.0.0.1',port:502,unitId:1,polling:1000,timeout:2000,tags:[{id:'level',name:'水位',address:1,type:'UInt16',memory:'400000',divisor:1,initial:50,writable:false}]}],activePageId:'main',pages:[{id:'main',name:'总览',width:1200,height:800,components:[{id:'tank',kind:'tank',label:'水箱',x:48,y:64,w:160,h:160,tagId:'level'},{id:'pump',kind:'pump',label:'水泵',x:500,y:64,w:160,h:160,valueTag:'level',details:[{tag:'level',label:'水位'}]}],connections:[{id:'supply',from:'tank',to:'pump',tagId:'level'}]}]}}
test('agent deletion repairs all dependent bindings and reports runtime impact',async()=>{const before=project(),hash=digest(before),r=await applyOperations(before,{operations:[{op:'device.delete',id:'plc'}]},validate);assert.equal(digest(before),hash);assert.equal(r.project.devices.length,0);assert.ok(!r.project.pages[0].components[0].tagId);assert.ok(!r.project.pages[0].components[1].valueTag);assert.deepEqual(r.project.pages[0].components[1].details,[]);assert.ok(!r.project.pages[0].connections[0].tagId);assert.equal(r.impacts.filter(x=>x.code==='binding-cleared').length,3);assert.ok(r.impacts.some(x=>x.code==='runtime-restart'));});
test('component deletion cascades connections; invalid plans never mutate input',async()=>{const before=project(),r=await applyOperations(before,{operations:[{op:'component.delete',pageId:'main',id:'pump'}]},validate);assert.deepEqual(r.project.pages[0].connections,[]);assert.ok(r.impacts.some(x=>x.code==='connection-removed'));await assert.rejects(()=>applyOperations(before,{operations:[{op:'page.delete',id:'main'}]},validate),/至少/);assert.equal(before.pages.length,1);});
test('topological layout respects lock and leaves no overlapping nodes',async()=>{const p=project();p.pages[0].components.push({id:'label',kind:'text',label:'工艺标题',x:32,y:16,w:600,h:40,locked:true});const r=await applyOperations(p,{operations:[{op:'project.optimize'}]},validate),page=r.project.pages[0];assert.equal(page.components[2].x,32);assert.equal(page.components[2].y,16);assert.ok(page.components[0].x+160<page.components[1].x);assert.equal(r.blocked,false);assert.ok(page.connections[0].points.length>=2)});
test('orthogonal routing avoids obstacle and follows moved endpoints',async()=>{const {routePage,segmentBlocked}=await import('../simplehmi/topology.mjs');const p=project().pages[0];p.components.push({id:'obstacle',kind:'text',x:280,y:80,w:130,h:130});let r=routePage(p);assert.deepEqual(r.diagnostics,[]);let pts=r.page.connections[0].points;for(let i=1;i<pts.length;i++){assert.ok(pts[i].x===pts[i-1].x||pts[i].y===pts[i-1].y);assert.equal(segmentBlocked(pts[i-1],pts[i],[{x:280,y:80,r:410,b:210}]),false)}p.components[1].y=350;r=routePage(p);assert.equal(r.page.connections[0].points.at(-1).y,423.862);});
test('unroutable ports produce a blocking diagnostic, not fake straight lines',async()=>{const {routePage}=await import('../simplehmi/topology.mjs'),p=project().pages[0];p.components[1].x=150;const r=routePage(p);assert.equal(r.page.connections[0].routeStatus,'blocked');assert.deepEqual(r.page.connections[0].points,[]);assert.equal(r.diagnostics[0].code,'route-blocked')});
test('mode validation distinguishes available configuration from future execution',async()=>{const p=project(),r=await applyOperations(p,{operations:[{op:'project.configure',mode:'industry-ai'}]},validate);assert.equal(r.project.system.mode,'industry-ai');assert.ok(r.impacts.some(x=>x.code==='industry-review-required'));assert.throws(()=>validate({...p,system:{mode:'unsupported'}}),/模式/);assert.throws(()=>validate({...p,pages:[{...p.pages[0],connections:[{id:'edge',from:'tank',to:'missing'}]}]}),/端点/)});
module.exports={project};

test('new and edited dangling references fail with locations instead of silently becoming unbound',async()=>{
 const before=project(),revision=digest(before);
 for(const operation of [
  {op:'component.upsert',pageId:'main',component:{id:'tank',tagId:'plc'}},
  {op:'component.upsert',pageId:'main',component:{id:'pump',valueTag:'unknown'}},
  {op:'component.upsert',pageId:'main',component:{id:'pump',details:[{tagId:'unknown'}]}},
  {op:'connection.upsert',pageId:'main',connection:{id:'supply',tagId:'unknown'}},
  {op:'connection.upsert',pageId:'main',connection:{id:'new_edge',from:'tank',to:'unknown'}},
  {op:'connection.upsert',pageId:'main',connection:{id:'supply',to:'unknown'}}
 ])await assert.rejects(applyOperations(before,{operations:[operation]},validate),e=>e.code==='invalid-reference'&&/画面\/main/.test(e.message)&&/目标不存在/.test(e.message));
 assert.equal(digest(before),revision);
});
test('forward references in one plan work but newly introduced links to a deleted target are rejected',async()=>{
 const p=project(),component={id:'new_number',kind:'number',x:800,y:300,w:180,h:100,tagId:'new_value'},tag={...p.devices[0].tags[0],id:'new_value'};
 const valid=await applyOperations(p,{operations:[{op:'component.upsert',pageId:'main',component},{op:'tag.upsert',deviceId:'plc',tag}]},validate);
 assert.equal(valid.project.pages[0].components.at(-1).tagId,'new_value');assert.ok(!valid.impacts.some(i=>i.code==='binding-cleared'));
 await assert.rejects(applyOperations(p,{operations:[{op:'component.upsert',pageId:'main',component:{...component,tagId:'level'}},{op:'tag.delete',deviceId:'plc',id:'level'}]},validate),/new_number\/tagId/);
 const cloned={...structuredClone(p),id:'another_project',devices:[]};
 await assert.rejects(applyOperations(p,{operations:[{op:'project.create',project:cloned}]},validate),/tank\/tagId/);
});
test('loaded projects use their own deletion baseline and reject later new bad bindings',async()=>{
 const current=project(),saved={...structuredClone(current),id:'saved_project'},store={prepare:()=>({project:saved,conditions:[]})},load={op:'project.load',id:saved.id,expectedSavedRevision:digest(saved)};
 const result=await applyOperations(current,{operations:[load,{op:'device.delete',id:'plc'}]},validate,store);
 assert.equal(result.project.devices.length,0);assert.ok(result.impacts.some(i=>i.code==='binding-cleared'));assert.equal(result.project.pages[0].components[0].tagId,undefined);
 await assert.rejects(applyOperations(current,{operations:[load,{op:'component.upsert',pageId:'main',component:{id:'tank',tagId:'wrong_value'}}]},validate,store),/tank\/tagId/);
});
test('control dependency deletion remains recoverable while newly mistyped rule and step references fail',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs'),p=waterDemo('intelligent-control','dependency_test');
 await assert.rejects(applyOperations(p,{operations:[{op:'rule.upsert',rule:{id:p.control.rules[0].id,inputTag:'typo_level'}}]},validate),/规则\/water_level_control\/变量.*typo_level/);
 const deleted=await applyOperations(p,{operations:[{op:'tag.delete',deviceId:'supply',id:'destination_level'}]},validate);
 assert.equal(deleted.project.control.rules[0].enabled,false);
 const retained=await applyOperations(deleted.project,{operations:[{op:'project.configure',name:'保留已停用规则'}]},validate);assert.equal(retained.project.control.rules[0].enabled,false);
 const machine=structuredClone(require('../examples/water-steps.simplehmi.json').control.machines[0]);
 machine.states[0].actions[0].tagId='missing_output';
 await assert.rejects(applyOperations(p,{operations:[{op:'machine.upsert',machine}]},validate),/步骤流程.*missing_output/);
});
test('new invented source references fail while existing source updates still disable dependent rules',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs'),p=waterDemo('industry-ai','citation_reference');
 for(const evidence of [[{entryId:'invented_source',version:1}],[{entryId:'water_control_note',version:999}]])await assert.rejects(applyOperations(p,{operations:[{op:'rule.upsert',rule:{id:'water_level_control',evidence}}]},validate),/规则\/water_level_control\/依据/);
 const entry={...p.knowledge.find(e=>e.id==='water_control_note'),version:2},updated=await applyOperations(p,{operations:[{op:'knowledge.upsert',entry}]},validate);
 assert.equal(updated.project.control.rules[0].enabled,false);assert.ok(updated.impacts.some(i=>i.code==='rule-evidence-invalid'));
 const retained=await applyOperations(updated.project,{operations:[{op:'project.configure',name:'保留待复核规则'}]},validate);assert.equal(retained.project.control.rules[0].enabled,false);
});

test('different equipment sizes align their visible ports with no gratuitous elbow',async()=>{const {optimizePage}=await import('../simplehmi/topology.mjs');const p=project().pages[0];p.components[0].h=200;p.components[1].h=160;const r=optimizePage(p),e=r.page.connections[0];assert.equal(e.routeStatus,'ok');assert.equal(e.points.length,2);assert.equal(e.points[0].y,e.points[1].y);assert.equal(e.routeInfo.bends,0);assert.equal(e.routeInfo.arrowDirection,'right');assert.ok(e.points[0].x<r.page.components[0].x+r.page.components[0].w,'port is on visible tank, not selection box');});
test('reversed and vertical flows point toward destination with the appropriate side',async()=>{const {routePage}=await import('../simplehmi/topology.mjs');let p=project().pages[0];p.connections[0].from='pump';p.connections[0].to='tank';let e=routePage(p).page.connections[0];assert.equal(e.routeStatus,'ok');assert.deepEqual(e.resolvedPorts,{from:'left',to:'right'});assert.equal(e.routeInfo.arrowDirection,'left');p=project().pages[0];p.components[1].x=48;p.components[1].y=450;e=routePage(p).page.connections[0];assert.equal(e.routeStatus,'ok');assert.notEqual(e.resolvedPorts.from,'bottom','automatic route must avoid the source label');assert.equal(e.routeInfo.autoPortAdjusted,true);const last=e.points.at(-1),previous=e.points.at(-2),target=p.components[1];assert.ok(last.x>=target.x&&last.x<=target.x+target.w);assert.ok(last.y>=target.y&&last.y<=target.y+target.h);assert.ok(previous.x>last.x,'arrow enters the right-hand port toward the device');});
test('offset horizontal ports use a centered corridor instead of tiny end stubs',async()=>{const {routePage}=await import('../simplehmi/topology.mjs'),p=project().pages[0];p.components[1].y=320;const e=routePage(p).page.connections[0];assert.equal(e.routeStatus,'ok');assert.equal(e.points.length,4);assert.equal(e.routeInfo.bends,2);assert.equal(e.points[1].x,e.points[2].x);assert.ok(e.points[1].x>p.components[0].x+p.components[0].w+30);assert.ok(e.points[1].x<p.components[1].x-30);assert.equal(e.routeInfo.arrowDirection,'right');});
test('manual flow drawings cannot silently disconnect during automatic layout',async()=>{const {optimizePage}=await import('../simplehmi/topology.mjs'),p=project().pages[0];p.components.push({id:'legacy',kind:'flow',x:0,y:0,w:1200,h:800});assert.throws(()=>optimizePage(p),/手绘管线/)});
test('process optimization preserves unconnected titles, controls and cards while aligning equipment',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs'),{optimizePage}=await import('../simplehmi/topology.mjs');
 const before=waterDemo('visualization','layoutdemo').pages[0],connected=new Set(before.connections.flatMap(e=>[e.from,e.to])),result=optimizePage(before);
 for(const c of before.components.filter(c=>!connected.has(c.id)))assert.deepEqual(result.page.components.find(n=>n.id===c.id),c);
 assert.deepEqual(result.diagnostics,[]);assert.ok(result.page.connections.every(e=>e.points.length===2));
 const second=optimizePage(result.page);assert.deepEqual(second.page,result.page,'optimizing an already optimized process is stable');
});

test('type conversion preserves the complete engineering configuration and reports executable consequences',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs');
 const choices=['visualization','intelligent-control','industry-ai'];
 const seeded=waterDemo('industry-ai','mode_change');
 for(const from of choices)for(const to of choices.filter(x=>x!==from)){
  const normalized=await applyOperations(seeded,{operations:[{op:'project.configure',mode:from}]},validate),before=normalized.project;
  const result=await applyOperations(before,{operations:[{op:'project.configure',mode:to}]},validate);
  assert.equal(result.project.system.mode,to);
  for(const key of ['id','name','devices','pages','control','knowledge','simulation','activePageId'])assert.deepEqual(result.project[key],before[key],`${from} -> ${to}: ${key}`);
  const impact=result.impacts.find(x=>x.code==='system-mode-changed');assert.deepEqual([impact.from,impact.to],[from,to]);
  assert.ok(result.impacts.some(x=>x.code==='control-paused'));
  assert.equal(result.impacts.some(x=>x.code==='automatic-control-unavailable'),to==='visualization');
  assert.ok(!result.impacts.some(x=>x.code==='runtime-restart'));
  assert.equal(result.blocked,false);
 }
});
