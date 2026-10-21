'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {mountAi}=require('./ai');
const {controlSignature}=require('./control');
const {mcpConfiguration}=require('./mcp-config');
const {projectStore}=require('./project-store');
const {references:machineReferences}=require('./state-machine');
const {validateKnowledgeRevision,citationProblems,assertAssessmentFresh,mountAssessments}=require('./knowledge');
const clone=x=>JSON.parse(JSON.stringify(x));
const digest=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const modes=['visualization','intelligent-control','industry-ai'];
const operations=['project.create','project.load','project.delete','project.restore','project.revert','project.configure','device.upsert','device.delete','tag.upsert','tag.delete','page.upsert','page.delete','component.upsert','component.delete','connection.upsert','connection.delete','asset.upsert','asset.delete','page.optimize','project.optimize','rule.upsert','rule.delete','machine.upsert','machine.delete','knowledge.upsert','knowledge.delete'];
const idOk=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
function need(value,message){if(!value)throw Error(message);return value}
function upsert(list,value){need(value&&idOk(value.id),'对象需要有效 id');const i=list.findIndex(x=>x.id===value.id);if(i<0)list.push(clone(value));else list[i]={...list[i],...clone(value)}}
function remove(list,id){need(list.some(x=>x.id===id),'找不到要删除的对象：'+id);return list.filter(x=>x.id!==id)}
function entities(p){const map=new Map();map.set('project/'+p.id,{name:p.name,system:p.system,activePageId:p.activePageId,simulation:p.simulation});for(const d of p.devices){map.set('device/'+d.id,{...d,tags:undefined});for(const t of d.tags)map.set('tag/'+t.id,t)}for(const pg of p.pages){map.set('page/'+pg.id,{...pg,components:undefined,connections:undefined});for(const c of pg.components)map.set('component/'+c.id,c);for(const e of pg.connections||[])map.set('connection/'+e.id,e)}for(const e of p.knowledge||[])map.set('knowledge/'+e.id,e);for(const r of p.control?.rules||[])map.set('rule/'+r.id,r);for(const m of p.control?.machines||[])map.set('machine/'+m.id,m);for(const a of p.customSymbols||[])map.set('asset/'+a.id,a);return new Map([...map].map(([k,v])=>[p.id+'/'+k,v]))}
function changes(before,after){const a=entities(before),b=entities(after);return [...new Set([...a.keys(),...b.keys()])].flatMap(id=>JSON.stringify(a.get(id))===JSON.stringify(b.get(id))?[]:[{entity:id,action:!a.has(id)?'added':!b.has(id)?'removed':'updated',before:a.get(id)||null,after:b.get(id)||null}])}
function checkNewReferences(before,p){
 const same=before.id===p.id,oldPages=same?before.pages:[],oldTags=new Set(same?before.devices.flatMap(d=>d.tags.map(t=>t.id)):[]);
 const tags=new Set(p.devices.flatMap(d=>d.tags.map(t=>t.id))),oldComponents=new Map(oldPages.flatMap(pg=>pg.components.map(c=>[c.id,c]))),errors=[];
 const issue=(location,id)=>{if(errors.length<24)errors.push(String(location).slice(0,260)+' → '+String(id).slice(0,90)+'（目标不存在）')};
 for(const pg of p.pages){
  const oldPage=oldPages.find(x=>x.id===pg.id),oldEdges=new Map((oldPage?.connections||[]).map(e=>[e.id,e])),oldNodes=new Set((oldPage?.components||[]).map(c=>c.id)),nodes=new Set(pg.components.map(c=>c.id));
  for(const edge of pg.connections||[])for(const key of ['from','to'])if(!nodes.has(edge[key])&&!(oldEdges.get(edge.id)?.[key]===edge[key]&&oldNodes.has(edge[key])))issue(`画面/${pg.id}/连接/${edge.id}/${key}`,edge[key]);
  for(const [kind,items,oldItems] of [['组件',pg.components,oldComponents],['连接',pg.connections||[],oldEdges]])for(const c of items){
   const old=oldItems.get(c.id),location=`画面/${pg.id}/${kind}/${c.id}`;
   for(const key of ['tagId','valueTag'])if(c[key]&&!tags.has(c[key])&&!(old?.[key]===c[key]&&oldTags.has(c[key])))issue(location+'/'+key,c[key]);
   for(const detail of c.details||[]){const id=detail.tagId||detail.tag;if(id&&!tags.has(id)&&!(oldTags.has(id)&&old?.details?.some(d=>(d.tagId||d.tag)===id)))issue(location+'/details',id);}
  }
 }
 const ruleReferences=r=>[r.inputTag,r.outputTag,...(r.guards||[]).map(g=>g.tagId)];
 for(const [kind,items,oldItems,refs] of [['规则',p.control?.rules||[],same?before.control?.rules||[]:[],ruleReferences],['步骤流程',p.control?.machines||[],same?before.control?.machines||[]:[],machineReferences]])for(const item of items){
  const old=oldItems.find(x=>x.id===item.id),previous=new Set(old?refs(old):[]);
  for(const id of refs(item))if(!tags.has(id)&&!previous.has(id))issue(kind+'/'+item.id+'/变量',id);
  for(const citation of item.evidence||[])if(!p.knowledge?.some(e=>e.id===citation.entryId&&e.version===citation.version)&&!old?.evidence?.some(e=>e.entryId===citation.entryId&&e.version===citation.version))issue(kind+'/'+item.id+'/依据',citation.entryId+'@'+citation.version);
 }
 if(errors.length){const e=Error('新增或更改的引用无效：'+errors.join('；')+'。请先创建目标或修正引用；自动清理仅适用于已有对象的删除关联。');e.code='invalid-reference';throw e;}
}
function repair(p,impacts){
 const tags=new Set(p.devices.flatMap(d=>d.tags.map(t=>t.id))),assets=new Set((p.customSymbols||[]).map(a=>a.id));
 for(const pg of p.pages){const ids=new Set(pg.components.map(c=>c.id));if(pg.connections!==undefined)pg.connections=(pg.connections||[]).filter(e=>{if(ids.has(e.from)&&ids.has(e.to))return true;impacts.push({code:'connection-removed',entity:e.id,message:'端点已删除，关联管线自动移除'});return false});
  for(const c of [...pg.components,...(pg.connections||[])]){for(const key of ['tagId','valueTag'])if(c[key]&&!tags.has(c[key])){impacts.push({code:'binding-cleared',entity:c.id,field:key,tagId:c[key],message:'变量已删除，关联显示或动作绑定已解除'});delete c[key]}
   if(Array.isArray(c.details))c.details=c.details.filter(d=>{if(!(d.tagId||d.tag)||tags.has(d.tagId||d.tag))return true;impacts.push({code:'detail-cleared',entity:c.id,tagId:d.tagId||d.tag,message:'设备详情中的失效变量已移除'});return false});
   if(c.assetId?.startsWith('custom_')&&!assets.has(c.assetId))throw Error('自定义图形仍被组件使用，请先替换图形或删除组件');
  }
 }
 for(const r of p.control?.rules||[]){const missing=[r.inputTag,r.outputTag,...(r.guards||[]).map(g=>g.tagId)].filter(id=>!tags.has(id));if(missing.length){r.enabled=false;r.invalidReason='关联变量已删除：'+[...new Set(missing)].join('、');impacts.push({code:'rule-disabled',entity:r.id,message:'控制规则已停用：'+r.invalidReason});}else {const problems=citationProblems(p,r);if(problems.length){r.enabled=false;r.invalidReason=problems.join('；');impacts.push({code:'rule-evidence-invalid',entity:r.id,message:'关联依据变化，规则已停用：'+r.invalidReason});}else delete r.invalidReason;}}
 for(const m of p.control?.machines||[]){const missing=machineReferences(m).filter(id=>!tags.has(id)),problems=citationProblems(p,m);if(missing.length||problems.length){m.enabled=false;m.invalidReason=missing.length?'关联变量已删除：'+missing.join('、'):problems.join('；');impacts.push({code:'machine-disabled',entity:m.id,message:'步骤流程已停用：'+m.invalidReason})}else delete m.invalidReason;}
 if(!p.pages.some(pg=>pg.id===p.activePageId)){p.activePageId=p.pages[0]?.id;impacts.push({code:'active-page-changed',message:'当前画面已切换到保留的第一页'})}
}
async function applyOperations(before,request,validate,store,history){
 need(Array.isArray(request.operations)&&request.operations.length>0&&request.operations.length<=500,'每个计划需要 1–500 个操作');
 let p=clone(before),referenceBaseline=before;const impacts=[],diagnostics=[],optimize=new Set(),fileConditions=[];let fileEffect=null,revertsPlanId=null;
 const lifecycle=request.operations.filter(op=>['project.create','project.load','project.delete','project.restore','project.revert'].includes(op?.op));need(lifecycle.length<=1,'一个计划只能包含一项工程生命周期或历史恢复操作');
 for(const op of request.operations){need(op&&operations.includes(op.op),'未知操作：'+op?.op);
  const pg=()=>need(p.pages.find(x=>x.id===op.pageId),'找不到画面：'+op.pageId);
  const dev=()=>need(p.devices.find(x=>x.id===op.deviceId),'找不到设备：'+op.deviceId);
  switch(op.op){
   case 'project.create':need(request.operations[0]===op,'新建工程必须是首个操作');need(op.project,'缺少工程');need(op.project.id!==before.id,'新建工程必须使用新的 ID');p=clone(op.project);if(store){need(!store.exists(p.id),'工程 ID 已存在，请使用新的 ID');fileConditions.push({id:p.id,revision:null})}break;
   case 'project.load':{need(store,'当前上下文不支持保存工程管理');need(request.operations[0]===op,'加载工程必须是首个操作');const result=store.prepare(op,before.id);p=clone(result.project);referenceBaseline=clone(p);fileConditions.push(...result.conditions);impacts.push({code:'saved-project-load',entity:p.id,message:'加载所预览版本的已保存工程；自动控制将暂停，通信、历史缓存和手动模拟值可能重置。其他编辑窗口尚未保存的修改不会带入。'});break;}
   case 'project.delete':case 'project.restore':{need(store,'当前上下文不支持保存工程管理');need(request.operations.length===1,'删除或恢复保存工程必须单独预览');const result=store.prepare(op,before.id);fileConditions.push(...result.conditions);fileEffect=result.effect;impacts.push({code:fileEffect.action==='delete'?'project-archived':'project-restored',entity:result.project.id,message:fileEffect.action==='delete'?'该保存工程将移入可恢复的归档区；当前运行工程和设备不受影响。':'归档工程将回到工程列表；不会切换当前工程、启动通信或自动控制。'});break;}
   case 'project.revert':{
    need(history,'当前上下文不支持历史版本恢复');need(request.operations.length===1,'历史版本恢复必须单独预览');
    const source=history.read(op.planId);need(source.status==='applied'&&source.before&&!source.fileEffect,'只能恢复已应用的工程修改；归档操作请使用工程恢复');
    need(source.before.id===before.id&&source.project?.id===before.id,'只能恢复当前工程的修改记录；跨工程创建或加载请使用工程列表');
    p=clone(source.before);referenceBaseline=clone(p);revertsPlanId=source.id;
    const changedKnowledge=(p.knowledge||[]).filter(e=>{const current=before.knowledge?.find(x=>x.id===e.id);return !current||digest(current)!==digest(e)});
    if(changedKnowledge.length){
     const versions=history.knowledgeVersions(before.id);
     for(const e of changedKnowledge){const old=e.version;e.version=Math.max(versions[e.id]||0,before.knowledge?.find(x=>x.id===e.id)?.version||0,old)+1;
      impacts.push({code:'knowledge-restored-new-version',entity:e.id,message:`资料“${e.title}”恢复历史正文并创建版本 ${e.version}；旧引用不自动重新授权，相关规则需重新评估`});}
    }
    impacts.push({code:'engineering-snapshot-restored',entity:source.id,message:'恢复到此操作应用前的工程配置；预览明细包含此后修改中将被覆盖的内容。当前保存工程和其他打开窗口的状态需重新核对。'},
     {code:'control-paused',message:'恢复后自动控制保持暂停，必须重新检查规则并启动；已有授权不会恢复'},
     {code:'physical-state-not-reverted',message:'仅恢复工程配置，不恢复历史实时值、设备输出或生产过程；已经发出的设备指令不会撤销'});
    break;
   }
   case 'project.configure':if(op.name!==undefined)p.name=op.name;if(op.mode!==undefined){need(modes.includes(op.mode),'系统模式无效');p.system={...p.system,mode:op.mode}}if(op.simulation!==undefined){need(op.simulation===null||['water-transfer','waste-to-energy'].includes(op.simulation),'过程模拟模型无效');if(op.simulation===null)delete p.simulation;else p.simulation=op.simulation}break;
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
   case 'machine.upsert':p.control||={rules:[]};p.control.machines||=[];upsert(p.control.machines,op.machine);break;
   case 'machine.delete':p.control||={rules:[]};p.control.machines=remove(p.control.machines||[],op.id);break;
   case 'rule.upsert':p.control||={rules:[]};upsert(p.control.rules,op.rule);break;
   case 'rule.delete':p.control||={rules:[]};p.control.rules=remove(p.control.rules,op.id);break;
   case 'page.optimize':optimize.add(pg().id);break;
   case 'project.optimize':p.pages.forEach(pg=>optimize.add(pg.id));break;
  }
 }
 if(fileEffect)return {project:p,changes:[{entity:'saved-project/'+fileEffect.projectId,action:fileEffect.action==='delete'?'archived':'restored'}],impacts,diagnostics,blocked:false,fileConditions,fileEffect};
 validateKnowledgeRevision(before,p);checkNewReferences(referenceBaseline,p);repair(p,impacts);p=validate(p);
 const {optimizePage,routePage}=await import('../../simplehmi/topology.mjs');
 p.pages=p.pages.map(pg=>{if(!optimize.has(pg.id)&&!pg.connections?.length)return pg;const result=optimize.has(pg.id)?optimizePage(pg):routePage(pg);diagnostics.push(...result.diagnostics.map(d=>({...d,pageId:pg.id})));return result.page});
 p=validate(p);
 if(p.id===before.id&&(p.system?.mode||'visualization')!==(before.system?.mode||'visualization')){
  const from=before.system?.mode||'visualization',to=p.system.mode,names={visualization:'数据可视化','intelligent-control':'智能控制','industry-ai':'行业 AI 系统'};
  impacts.push({code:'system-mode-changed',from,to,message:`系统类型从“${names[from]}”切换为“${names[to]}”。本次切换不发送设备停机指令`});
  if(to==='visualization')impacts.push({code:'automatic-control-unavailable',message:'数据可视化类型下不能启动自动控制；已保存的规则和步骤流程可在切回控制类型后检查并启用'});
 }
 if(JSON.stringify([p.id,p.devices,p.simulation])!==JSON.stringify([before.id,before.devices,before.simulation]))impacts.push({code:'runtime-restart',message:'设备配置变化将重启 FUXA 通信；当前历史缓存和模拟手动值会重置'});
 if(p.simulation!==before.simulation)impacts.push({code:'simulation-model-changed',from:before.simulation??null,to:p.simulation??null,message:p.simulation?'启用内置过程模型，模拟状态将从固定初始条件重新开始':'已移除过程模型；保留的模拟点不再具备工艺联动，真实设备点须核对地址、倍率和操作权限'});
 if(p.devices.some(d=>d.protocol==='sim')&&!['water-transfer','waste-to-energy'].includes(p.simulation))impacts.push({code:'independent-simulation-signals',message:'当前模拟变量是独立信号，未建立物料守恒或设备联动关系，不能用来验证工艺行为'});
 for(const pg of p.pages)for(const c of pg.components)if(c.kind==='alarm'&&(c.threshold==null||!c.tagId))impacts.push({code:'alarm-unconfigured',entity:c.id,pageId:pg.id,message:'报警组件“'+(c.label||c.id)+'”'+(c.threshold==null?'缺少报警上限':'')+(c.threshold==null&&!c.tagId?'，':'')+(!c.tagId?'未绑定监测变量':'')+'；画面将显示未配置，不能判断报警'});
 if(p.id!==before.id)impacts.push({code:'project-switch',message:'当前运行工程将切换；原工程文件保留'});
 if(controlSignature(p)!==controlSignature(before))impacts.push({code:'control-paused',message:'设备、模拟模型、控制规则、模式或知识资料变化会暂停自动控制；应用计划不会自动启动，须在控制面板重新检查并启动'});
 if(p.system?.mode==='industry-ai')impacts.push({code:'industry-review-required',message:'行业评估可引用本地资料和当前观测生成建议；模型质量与资料适用性须检查，工程计划应用不会自动启动控制'});
 return {project:p,changes:changes(before,p),impacts,diagnostics,fileConditions,pauseControl:lifecycle[0]?.op==='project.load'||!!revertsPlanId,...(revertsPlanId?{revertsPlanId}:{}),blocked:diagnostics.some(d=>d.code==='route-blocked')};
}
function mountAgent(router,{getProject,getValues=()=>({}),activate,serial,validate,prepare=validate,assertAccess=()=>{},authorization=()=>({protectedMode:false}),dir}){
 const projects=projectStore(dir,validate);
 const folder=path.join(dir,'agent');fs.mkdirSync(folder,{recursive:true});
 const planFile=id=>{need(idOk(id),'计划 ID 无效');return path.join(folder,id+'.json')};
 function readPlan(name){const p=JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));need(idOk(p.id)&&p.id+'.json'===name,'计划记录 ID 不一致');return p}
 function scanPlans(){return fs.readdirSync(folder).filter(f=>/^plan_[a-zA-Z0-9_-]+\.json$/.test(f))}
 function store(p){const f=planFile(p.id);fs.writeFileSync(f+'.tmp',JSON.stringify(p));fs.renameSync(f+'.tmp',f)}
 const history={read:id=>{planFile(id);return readPlan(id+'.json')},knowledgeVersions:projectId=>{const versions=Object.create(null);for(const name of scanPlans()){const record=readPlan(name);for(const p of [record.before,record.project])if(p?.id===projectId)for(const e of p.knowledge||[])versions[e.id]=Math.max(versions[e.id]||0,e.version)}return versions}};
 const audit=e=>fs.appendFileSync(path.join(folder,'audit.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 const endpoint=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||400).json({error:e.message,code:e.code||'invalid-plan',...(e.outcomeUnknown?{outcomeUnknown:true}:{})})}};
 const conflict=()=>{const e=Error('工程已被其他操作修改，请重新读取状态并预览计划');e.status=409;e.code='revision-conflict';throw e};
 router.get('/agent/capabilities',endpoint(async(req,res)=>res.json({apiVersion:'1',transport:'local-http',authorization:authorization(req),operations,modes,available:['project-snapshot','saved-project-lifecycle','engineering-history-revert','editor-save-history','server-agent-authorization','interrupted-plan-detection','plan-preview','dependency-repair','revision-check','idempotent-apply','audit-log','topology-layout','orthogonal-routing','model-generation','model-cancellation','operation-schema','hysteresis-control','state-machine-control','control-takeover','verified-control-writes','versioned-knowledge','cited-assessment','assessment-history','guarded-point-write',...(mcpConfiguration().installed?['mcp-stdio-adapter']:[])],pending:['verified-model-provider','verified-industry-assessment','crash-recovery'],maxOperations:500,physicalWritesViaPlans:false})));
 router.get('/agent/projects',endpoint(async(req,res)=>res.json(projects.inventory(getProject().id))));
 router.get('/agent/projects/:id',endpoint(async(req,res)=>res.json(projects.read(req.params.id,req.query.archived==='1'))));
 function listPlans(query={}){
  const limit=query.limit===undefined?200:Number(query.limit);need(Number.isInteger(limit)&&limit>0&&limit<=200,'历史每页数量必须为 1–200');
  if(query.projectId)need(idOk(query.projectId),'工程 ID 无效');if(query.source)need(['editor','agent','load'].includes(query.source),'历史来源无效');if(query.cursor)need(idOk(query.cursor),'历史游标无效');
  const rows=scanPlans().map(f=>{try{const p=readPlan(f);return {id:p.id,source:p.source||'agent',summary:p.summary,status:p.status,createdAt:p.createdAt,recovery:p.recovery,projectId:p.project?.id,revertsPlanId:p.revertsPlanId,canRevert:p.status==='applied'&&!p.fileEffect&&p.before?.id===getProject().id&&p.project?.id===getProject().id}}catch(e){return {id:f.slice(0,-5),summary:'计划记录无法读取',status:'unreadable',error:e.message,createdAt:0}}}).filter(p=>(!query.projectId||p.projectId===query.projectId||p.status==='unreadable')&&(!query.source||p.source===query.source)).sort((a,b)=>Number(['interrupted','unreadable'].includes(b.status))-Number(['interrupted','unreadable'].includes(a.status))||(b.createdAt||0)-(a.createdAt||0)||b.id.localeCompare(a.id));
  const anchor=query.cursor?rows.findIndex(p=>p.id===query.cursor):-1;need(!query.cursor||anchor>=0,'历史游标不在当前筛选中，请重新加载记录');return rows.slice(anchor+1,anchor+1+limit);
 }
 router.get('/agent/plans',endpoint(async(req,res)=>res.json(listPlans(req.query))));
 router.get('/agent/state',endpoint(async(req,res)=>res.json({revision:digest(getProject()),project:getProject()})));
 router.get('/agent/audit',endpoint(async(req,res)=>{const f=path.join(folder,'audit.jsonl');res.json(fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).slice(-200).map(x=>JSON.parse(x)):[])}));
 async function previewPlan(request,signal,assessment){const before=clone(getProject()),revision=digest(before);need(typeof request.expectedRevision==='string','请先读取 /agent/state 的 revision');if(request.expectedRevision!==revision)conflict();
  const result=await applyOperations(before,request,validate,projects,history);if(request.operations.some(o=>o.op==='project.create')&&fs.existsSync(path.join(dir,result.project.id+'.json')))throw Error('工程 ID 已存在，请使用新的 ID');const plan={id:'plan_'+crypto.randomUUID().replaceAll('-',''),createdAt:Date.now(),expiresAt:Date.now()+900000,expectedRevision:revision,actor:String(request.actor||'local').slice(0,100),summary:String(request.summary||'工程修改').slice(0,500),status:'preview',...result};
  if(revision!==digest(getProject()))conflict();
  if(assessment){need(!request.operations.some(o=>['project.create','project.load','project.delete','project.restore','project.revert'].includes(o.op)),'行业评估不能切换、删除或恢复工程，请单独预览后重新评估');assertAssessmentFresh(assessment,before,getValues());assertAssessmentFresh(assessment,result.project,getValues());plan.assessment=assessment;plan.expiresAt=Math.min(plan.expiresAt,assessment.expiresAt);}
  if(signal?.aborted)throw Error('生成已停止');
  store(plan);audit({event:'preview',planId:plan.id,actor:plan.actor,changeCount:plan.changes.length,...(plan.revertsPlanId?{revertsPlanId:plan.revertsPlanId}:{})});return plan;
 }

 router.post('/agent/plans',endpoint(async(req,res)=>res.json(await previewPlan(req.body))));
 mountAssessments(router,{dir,getProject,getValues,digest,previewPlan,audit});
 mountAi(router,{dir,getProject,getValues,digest,previewPlan,validatePlan:(before,request)=>applyOperations(before,request,validate,projects,history),audit});
 router.get('/agent/plans/:id',endpoint(async(req,res)=>res.json(JSON.parse(fs.readFileSync(planFile(req.params.id),'utf8')))));
 async function execute(p,checkAccess=()=>{}){
  checkAccess();
  const before=clone(getProject());p.status='applying';p.before=before;store(p);audit({event:'applying',planId:p.id,actor:p.actor});
  try{if(p.fileEffect)projects.execute(p.fileEffect);else await activate(p.project,{pauseControl:p.pauseControl,checkAccess})}
  catch(e){p.status='failed';p.error=e.message;try{if(!p.fileEffect)await activate(before);p.restored=p.fileEffect?!projects.completed(p.fileEffect):true}catch(restore){p.restored=false;p.restoreError=restore.message}store(p);audit({event:'failed',planId:p.id,error:p.error,restored:p.restored});throw e}
  p.status='applied';p.resultRevision=digest(getProject());
  try{store(p);audit({event:'applied',planId:p.id,actor:p.appliedBy||p.actor,revision:p.resultRevision,...(p.revertsPlanId?{revertsPlanId:p.revertsPlanId}:{})})}catch(e){e.outcomeUnknown=true;e.code='journal-write-failed';throw e}
  return {id:p.id,status:p.status,revision:p.resultRevision,project:getProject()};
 }
 async function saveEditor(raw,{expectedRevision,source='editor',pauseControl=false,checkAccess=()=>{}}={}){
  const before=clone(getProject()),revision=digest(before);if(expectedRevision&&expectedRevision!==revision)conflict();
  checkAccess();const project=await prepare(raw);checkAccess();const diff=changes(before,project);
  if(digest(project)===revision&&!pauseControl)return {project:getProject(),historyId:null};
  const impacts=[];if(pauseControl||JSON.stringify([before.devices,before.control,before.system,before.simulation,before.knowledge,before.id])!==JSON.stringify([project.devices,project.control,project.system,project.simulation,project.knowledge,project.id]))impacts.push({code:'control-paused',message:'工程控制或通信配置变化，自动控制保持暂停；保存不会启动设备'});
  const labels={component:'组件',page:'画面',connection:'管线',device:'设备',tag:'变量',rule:'规则',machine:'步骤流程',knowledge:'知识',asset:'图形',project:'工程'},first=diff[0],kind=first?.entity.split('/')[1],name=first?.after?.label||first?.after?.name||first?.before?.label||first?.before?.name;
  const summary=source==='load'?'打开工程：'+project.name:'编辑保存：'+(name||labels[kind]||project.name)+(diff.length>1?' 等 '+diff.length+' 项':'');
  const p={id:'plan_'+crypto.randomUUID().replaceAll('-',''),createdAt:Date.now(),expectedRevision:revision,actor:source==='load'?'project-loader':'editor-save',source,summary:summary.slice(0,500),status:'applying',project,changes:diff,impacts,diagnostics:[],pauseControl,blocked:false};
  const result=await execute(p,checkAccess);return {project:result.project,historyId:p.id};
 }
 router.post('/agent/plans/:id/apply',endpoint(async(req,res)=>res.json(await serial(async()=>{
  assertAccess(req);const p=JSON.parse(fs.readFileSync(planFile(req.params.id),'utf8'));
  if(p.status==='applied')return {id:p.id,status:p.status,revision:p.resultRevision,replayed:true};
  need(p.status==='preview','计划不处于可应用状态');need(p.expiresAt>Date.now(),'计划已过期，请重新预览');need(!p.blocked,'计划有未解决的布线问题');if(p.expectedRevision!==digest(getProject()))conflict();
  p.appliedBy=req.flexAuth?.id||p.actor;
  projects.check(p.fileConditions);
  assertAssessmentFresh(p.assessment,getProject(),getValues());
  return execute(p,()=>assertAccess(req));
 }))));
 router.post('/agent/plans/:id/cancel',endpoint(async(req,res)=>res.json(await serial(async()=>{assertAccess(req);const p=JSON.parse(fs.readFileSync(planFile(req.params.id),'utf8'));need(p.status==='preview','只有未应用计划可以取消');p.status='cancelled';store(p);audit({event:'cancelled',planId:p.id});return {id:p.id,status:p.status}}))));
 async function recover(){
  for(const name of scanPlans()){
   let p;try{p=readPlan(name)}catch(e){audit({event:'plan-record-unreadable',file:name,error:e.message});continue}if(p.status!=='applying')continue;
   const observedRevision=digest(getProject()),completed=p.fileEffect?projects.completed(p.fileEffect):observedRevision===digest(p.project);
   p.status=completed?'applied':'interrupted';if(completed)p.resultRevision=observedRevision;
   p.recovery={at:Date.now(),observedRevision,completed,message:completed?'重启后核对持久化结果，计划目标已保存；自动控制未恢复授权。':'进程在应用期间中断，当前保存状态与目标不完全一致。未自动重放；请读取工程和归档状态后重新预览。'};
   store(p);audit({event:'interrupted-plan-reconciled',planId:p.id,status:p.status,...p.recovery});
  }
 }
 return {audit,recover,saveEditor};
}
module.exports={mountAgent,applyOperations,digest,modes};
