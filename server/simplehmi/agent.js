'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {mountAi}=require('./ai');
const {validateKnowledgeRevision,citationProblems,assertAssessmentFresh,mountAssessments}=require('./knowledge');
const clone=x=>JSON.parse(JSON.stringify(x));
const digest=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const modes=['visualization','intelligent-control','industry-ai'];
const operations=['project.create','project.configure','device.upsert','device.delete','tag.upsert','tag.delete','page.upsert','page.delete','component.upsert','component.delete','connection.upsert','connection.delete','asset.upsert','asset.delete','page.optimize','project.optimize','rule.upsert','rule.delete','knowledge.upsert','knowledge.delete'];
const idOk=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
function need(value,message){if(!value)throw Error(message);return value}
function upsert(list,value){need(value&&idOk(value.id),'对象需要有效 id');const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(clone(value));else list[i]={...list[i],...clone(value)}}
function remove(list,id){need(list.some(x=>x.id===id),'找不到要删除的对象：'+id);return list.filter(x=>x.id!==id)}
function entities(p){const map=new Map();map.set('project/'+p.id,{name:p.name,system:p.system,activePageId:p.activePageId,simulation:p.simulation});for(const d of p.devices){map.set('device/'+d.id,{...d,tags:undefined});for(const t of d.tags)map.set('tag/'+t.id,t)}for(const pg of p.pages){map.set('page/'+pg.id,{...pg,components:undefined,connections:undefined});for(const c of pg.components)map.set('component/'+c.id,c);for(const e of pg.connections||[])map.set('connection/'+e.id,e)}for(const e of p.knowledge||[])map.set('knowledge/'+e.id,e);for(const r of p.control?.rules||[])map.set('rule/'+r.id,r);for(const a of p.customSymbols||[])map.set('asset/'+a.id,a);return new Map([...map].map(([k,v])=>[p.id+'/'+k,v]))}
function changes(before,after){const a=entities(before),b=entities(after);return [...new Set([...a.keys(),...b.keys()])].flatMap(id=>JSON.stringify(a.get(id))===JSON.stringify(b.get(id))?[]:[{entity:id,action:!a.has(id)?'added':!b.has(id)?'removed':'updated',before:a.get(id)||null,after:b.get(id)||null}])}
function repair(p,impacts){
 const tags=new Set(p.devices.flatMap(d=>d.tags.map(t=>t.id))),assets=new Set((p.customSymbols||[]).map(a=>a.id));
 for(const pg of p.pages){const ids=new Set(pg.components.map(c=>c.id));pg.connections=(pg.connections||[]).filter(e=>{if(ids.has(e.from)&&ids.has(e.to))return true;impacts.push({code:'connection-removed',entity:e.id,message:'端点已删除，关联管线自动移除'});return false});
  for(const c of [...pg.components,...pg.connections]){for(const key of ['tagId','valueTag'])if(c[key]&&!tags.has(c[key])){impacts.push({code:'binding-cleared',entity:c.id,field:key,tagId:c[key],message:'变量已删除，关联显示或动作绑定已解除'});delete c[key]}
   if(Array.isArray(c.details))c.details=c.details.filter(d=>{if(!(d.tagId||d.tag)||tags.has(d.tagId||d.tag))return true;impacts.push({code:'detail-cleared',entity:c.id,tagId:d.tagId||d.tag,message:'设备详情中的失效变量已移除'});return false});
   if(c.assetId?.startsWith('custom_')&&!assets.has(c.assetId))throw Error('自定义图形仍被组件使用，请先替换图形或删除组件');
  }
 }
 for(const r of p.control?.rules||[]){const missing=[r.inputTag,r.outputTag,...(r.guards||[]).map(g=>g.tagId)].filter(id=>!tags.has(id));if(missing.length){r.enabled=false;r.invalidReason='关联变量已删除：'+[...new Set(missing)].join('、');impacts.push({code:'rule-disabled',entity:r.id,message:'控制规则已停用：'+r.invalidReason});}else {const problems=citationProblems(p,r);if(problems.length){r.enabled=false;r.invalidReason=problems.join('；');impacts.push({code:'rule-evidence-invalid',entity:r.id,message:'关联依据变化，规则已停用：'+r.invalidReason});}else delete r.invalidReason;}}
 if(!p.pages.some(pg=>pg.id===p.activePageId)){p.activePageId=p.pages[0]?.id;impacts.push({code:'active-page-changed',message:'当前画面已切换到保留的第一页'})}
}
async function applyOperations(before,request,validate){
 need(Array.isArray(request.operations)&&request.operations.length>0&&request.operations.length<=500,'每个计划需要 1–500 个操作');
 let p=clone(before);const impacts=[],diagnostics=[],optimize=new Set();
 for(const op of request.operations){need(op&&operations.includes(op.op),'未知操作：'+op?.op);
  const pg=()=>need(p.pages.find(x=>x.id===op.pageId),'找不到画面：'+op.pageId);
  const dev=()=>need(p.devices.find(x=>x.id===op.deviceId),'找不到设备：'+op.deviceId);
  switch(op.op){
   case 'project.create':need(request.operations[0]===op,'新建工程必须是首个操作');need(op.project,'缺少工程');need(op.project.id!==before.id,'新建工程必须使用新的 ID');p=clone(op.project);break;
   case 'project.configure':if(op.name!==undefined)p.name=op.name;if(op.mode!==undefined){need(modes.includes(op.mode),'系统模式无效');p.system={...p.system,mode:op.mode}}break;
   case 'device.upsert':upsert(p.devices,op.device);break;
   case 'device.delete':p.devices=remove(p.devices,op.id);break;
   case 'tag.upsert':upsert(dev().tags,op.tag);break;
   case 'tag.delete':dev().tags=remove(dev().tags,op.id);break;
   case 'page.upsert':upsert(p.pages,op.page);break;
   case 'page.delete':p.pages=remove(p.pages,op.id);need(p.pages.length,'工程至少保留一个画面');break;
   case 'component.upsert':upsert(pg().components,op.component);break;
   case 'component.delete':pg().components=remove(pg().components,op.id);break;
   case 'connection.upsert':pg().connections||=[];upsert(pg().connections,op.connection);break;
   case 'connection.delete':pg().connections=remove(pg().connections||[],op.id);break;
   case 'asset.upsert':p.customSymbols||=[];upsert(p.customSymbols,op.asset);break;
   case 'asset.delete':p.customSymbols=remove(p.customSymbols||[],op.id);break;
   case 'knowledge.upsert':p.knowledge||=[];upsert(p.knowledge,op.entry);break;
   case 'knowledge.delete':p.knowledge=remove(p.knowledge||[],op.id);break;
   case 'rule.upsert':p.control||={rules:[]};upsert(p.control.rules,op.rule);break;
   case 'rule.delete':p.control||={rules:[]};p.control.rules=remove(p.control.rules,op.id);break;
   case 'page.optimize':optimize.add(pg().id);break;
   case 'project.optimize':p.pages.forEach(pg=>optimize.add(pg.id));break;
  }
 }
 validateKnowledgeRevision(before,p);repair(p,impacts);p=validate(p);
 const {optimizePage,routePage}=await import('../../simplehmi/topology.mjs');
 p.pages=p.pages.map(pg=>{const result=optimize.has(pg.id)?optimizePage(pg):routePage(pg);diagnostics.push(...result.diagnostics.map(d=>({...d,pageId:pg.id})));return result.page});
 p=validate(p);
 if(JSON.stringify([p.id,p.devices,p.simulation])!==JSON.stringify([before.id,before.devices,before.simulation]))impacts.push({code:'runtime-restart',message:'设备配置变化将重启 FUXA 通信；当前历史缓存和模拟手动值会重置'});
 if(p.devices.some(d=>d.protocol==='sim')&&!['water-transfer','waste-to-energy'].includes(p.simulation))impacts.push({code:'independent-simulation-signals',message:'当前模拟变量是独立信号，未建立物料守恒或设备联动关系，不能用来验证工艺行为'});
 if(p.id!==before.id)impacts.push({code:'project-switch',message:'当前运行工程将切换；原工程文件保留'});
 if(JSON.stringify([p.control,p.system?.mode,p.knowledge])!==JSON.stringify([before.control,before.system?.mode,before.knowledge]))impacts.push({code:'control-paused',message:'控制规则、模式或知识资料变化会暂停自动控制；应用计划不会自动启动，须在控制面板重新检查并启动'});
 if(p.system?.mode==='industry-ai')impacts.push({code:'industry-review-required',message:'行业评估可引用本地资料和当前观测生成建议；模型质量与资料适用性须检查，工程计划应用不会自动启动控制'});
 return {project:p,changes:changes(before,p),impacts,diagnostics,blocked:diagnostics.some(d=>d.code==='route-blocked')};
}
function mountAgent(router,{getProject,getValues=()=>({}),activate,serial,validate,dir}){
 const folder=path.join(dir,'agent');fs.mkdirSync(folder,{recursive:true});
 const planFile=id=>{need(idOk(id),'计划 ID 无效');return path.join(folder,id+'.json')};
 function store(p){const f=planFile(p.id);fs.writeFileSync(f+'.tmp',JSON.stringify(p));fs.renameSync(f+'.tmp',f)}
 const audit=e=>fs.appendFileSync(path.join(folder,'audit.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 const endpoint=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||400).json({error:e.message,code:e.code||'invalid-plan'})}};
 const conflict=()=>{const e=Error('工程已被其他操作修改，请重新读取状态并预览计划');e.status=409;e.code='revision-conflict';throw e};
 router.get('/agent/capabilities',endpoint(async(req,res)=>res.json({apiVersion:'1',transport:'local-http',operations,modes,available:['project-snapshot','plan-preview','dependency-repair','revision-check','idempotent-apply','audit-log','topology-layout','orthogonal-routing','model-generation','model-cancellation','operation-schema','hysteresis-control','control-takeover','verified-control-writes','versioned-knowledge','cited-assessment'],pending:['verified-model-provider','state-machine-editor','verified-industry-assessment','agent-scopes','mcp-adapter','crash-recovery'],maxOperations:500,physicalWritesViaPlans:false})));
 router.get('/agent/state',endpoint(async(req,res)=>res.json({revision:digest(getProject()),project:getProject()})));
 router.get('/agent/audit',endpoint(async(req,res)=>{const f=path.join(folder,'audit.jsonl');res.json(fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).slice(-200).map(x=>JSON.parse(x)):[])}));
 async function previewPlan(request,signal,assessment){const before=clone(getProject()),revision=digest(before);need(typeof request.expectedRevision==='string','请先读取 /agent/state 的 revision');if(request.expectedRevision!==revision)conflict();
  const result=await applyOperations(before,request,validate);if(request.operations.some(o=>o.op==='project.create')&&fs.existsSync(path.join(dir,result.project.id+'.json')))throw Error('工程 ID 已存在，请使用新的 ID');const plan={id:'plan_'+crypto.randomUUID().replaceAll('-',''),createdAt:Date.now(),expiresAt:Date.now()+900000,expectedRevision:revision,actor:String(request.actor||'local').slice(0,100),summary:String(request.summary||'工程修改').slice(0,500),status:'preview',...result};
  if(revision!==digest(getProject()))conflict();
  if(assessment){assertAssessmentFresh(assessment,before,getValues());assertAssessmentFresh(assessment,result.project,getValues());plan.assessment=assessment;plan.expiresAt=Math.min(plan.expiresAt,assessment.expiresAt);}
  if(signal?.aborted)throw Error('生成已停止');
  store(plan);audit({event:'preview',planId:plan.id,actor:plan.actor,changeCount:plan.changes.length});return plan;
 }

 router.post('/agent/plans',endpoint(async(req,res)=>res.json(await previewPlan(req.body))));
 mountAssessments(router,{dir,getProject,getValues,digest,previewPlan,audit});
 mountAi(router,{dir,getProject,getValues,digest,previewPlan,validatePlan:(before,request)=>applyOperations(before,request,validate),audit});
 router.get('/agent/plans/:id',endpoint(async(req,res)=>res.json(JSON.parse(fs.readFileSync(planFile(req.params.id),'utf8')))));
 router.post('/agent/plans/:id/apply',endpoint(async(req,res)=>res.json(await serial(async()=>{
  const p=JSON.parse(fs.readFileSync(planFile(req.params.id),'utf8'));
  if(p.status==='applied')return {id:p.id,status:p.status,revision:p.resultRevision,replayed:true};
  need(p.status==='preview','计划不处于可应用状态');need(p.expiresAt>Date.now(),'计划已过期，请重新预览');need(!p.blocked,'计划有未解决的布线问题');if(p.expectedRevision!==digest(getProject()))conflict();
  assertAssessmentFresh(p.assessment,getProject(),getValues());
  const before=clone(getProject());p.status='applying';p.before=before;store(p);audit({event:'applying',planId:p.id,actor:p.actor});
  try{await activate(p.project);p.status='applied';p.resultRevision=digest(getProject());store(p);audit({event:'applied',planId:p.id,actor:p.actor,revision:p.resultRevision});return {id:p.id,status:p.status,revision:p.resultRevision,project:getProject()}}
  catch(e){p.status='failed';p.error=e.message;try{await activate(before);p.restored=true}catch(restore){p.restored=false;p.restoreError=restore.message}store(p);audit({event:'failed',planId:p.id,error:p.error,restored:p.restored});throw e}
 }))));
 router.post('/agent/plans/:id/cancel',endpoint(async(req,res)=>res.json(await serial(async()=>{const p=JSON.parse(fs.readFileSync(planFile(req.params.id),'utf8'));need(p.status==='preview','只有未应用计划可以取消');p.status='cancelled';store(p);audit({event:'cancelled',planId:p.id});return {id:p.id,status:p.status}}))));
}
module.exports={mountAgent,applyOperations,digest,modes};
