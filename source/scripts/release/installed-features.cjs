'use strict';
// Runs against the installed product with an isolated qualification data directory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const [root,artifacts,arch,phase]=process.argv.slice(2);
const {configuration,request}=require(path.join(root,'desktop/ipc/launcher.cjs'));
const password='qualification-owner-password-043';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await delay(200)}throw Error('Installed feature did not reach expected state')}
(async()=>{
 assert.equal(process.arch,arch);const service=await request(configuration(root),'status');assert.equal(service.ready,true);
 const base=service.origin+'/simplehmi/api/';
 async function raw(route,body,headers={}){const res=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});return {status:res.status,data:await res.json(),historyId:res.headers.get('x-history-id'),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
 async function api(route,body,headers={}){const r=await raw(route,body,headers);assert.equal(r.status,200,JSON.stringify(r.data));return r.data}
 const evidenceFile=path.join(artifacts,'installed-features.json');
 if(phase==='exercise'){
  assert.equal((await api('access/status')).enabled,false);const before=await api('agent/state');assert.ok(before.project.devices.every(d=>d.protocol==='sim'));
  const current=await require('./installed-current.cjs')({root,api,raw});
  const edited=structuredClone(before.project);edited.name+=' · 历史验收';
  const saved=await raw('project',edited,{'If-Match':before.revision});assert.equal(saved.status,200);assert.ok(saved.historyId);
  const history=await api('agent/plans?source=editor&projectId='+before.project.id+'&limit=20');assert.ok(history.some(h=>h.id===saved.historyId));
  const revision=(await api('agent/state')).revision;
  const revert=await api('agent/plans',{expectedRevision:revision,summary:'安装包恢复普通编辑记录',operations:[{op:'project.revert',planId:saved.historyId}]});assert.equal(revert.blocked,false);assert.equal((await api('agent/state')).revision,revision);
  await api('agent/plans/'+revert.id+'/apply',{});assert.equal((await api('agent/state')).revision,before.revision);assert.equal((await api('control/status')).state,'manual');
  const demo=JSON.parse(fs.readFileSync(path.join(root,'examples/water-steps.simplehmi.json')));demo.id=before.project.id;demo.name=before.project.name;demo.pages=before.project.pages;
  await api('project',demo,{'If-Match':before.revision});await until(async()=>{const v=(await api('values')).values;return ['pump_command','source_level','destination_level'].every(id=>v[id]?.quality==='good'&&Date.now()-v[id].ts<3500)&&Number(v.pump_command.value)===0});
  await api('control/arm',{expectedRevision:(await api('agent/state')).revision});
  await until(async()=>(await api('control/status')).machines[0]?.stateId==='supply');assert.equal(Number((await api('values')).values.pump_command.value),1);
  await until(async()=>(await api('control/status')).machines[0]?.stateId==='done');assert.equal(Number((await api('values')).values.pump_command.value),0);assert.equal((await api('values')).values.total_volume.value,4.15);assert.equal((await api('control/status')).machines[0].writes,2);await api('control/pause',{});
  const assessments=await require('./installed-assessments.cjs')({root,api,until});
  const enabled=await raw('access/enable',{password});assert.equal(enabled.status,200);const owner={Cookie:enabled.cookie};assert.equal((await raw('agent/state')).status,401);
  const read=await api('access/tokens',{label:'安装包只读授权',scope:'read',days:7},owner),full=await api('access/tokens',{label:'安装包控制授权',scope:'full',days:7},owner);
  const sdk=path.join(root,'integrations/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client');const {Client}=await import(pathToFileURL(path.join(sdk,'index.js'))),{StdioClientTransport}=await import(pathToFileURL(path.join(sdk,'stdio.js')));
  const client=new Client({name:'installed-protected-qa',version:'0.4.3'}),transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'integrations/mcp/server.mjs')],env:{...process.env,FLEXHMI_URL:base,FLEXHMI_ACCESS:'full',FLEXHMI_TOKEN:read.token,FLEXHMI_PHYSICAL_WRITES:'0'},stderr:'pipe'});transport.stderr.on('data',b=>process.stderr.write(b));
  try{await client.connect(transport);assert.notEqual((await client.callTool({name:'flexhmi_state',arguments:{}})).isError,true);const reports=await client.callTool({name:'flexhmi_assessments',arguments:{projectId:before.project.id,source:'model'}});assert.notEqual(reports.isError,true);assert.ok(reports.structuredContent.records.some(r=>r.id===assessments.reportId));const denied=await client.callTool({name:'flexhmi_control_pause',arguments:{}});assert.equal(denied.isError,true);assert.equal(denied.structuredContent.status,403);}finally{await client.close()}
  const auth={Authorization:'Bearer '+full.token};const state=await api('agent/state',undefined,auth);
  assert.equal((await raw('control/arm',{expectedRevision:state.revision,allowPhysical:true},auth)).status,403);
  await api('control/arm',{expectedRevision:state.revision},auth);await api('access/tokens/'+full.id+'/revoke',{},owner);await until(async()=>(await api('control/status',undefined,owner)).state==='manual');assert.equal((await raw('agent/state',undefined,auth)).status,401);
  await api('project',before.project,{'If-Match':(await api('agent/state',undefined,owner)).revision,...owner});
  const active=await api('agent/state',undefined,owner);assert.equal(active.revision,before.revision);
  fs.writeFileSync(evidenceFile,JSON.stringify({arch,platform:process.platform,instance:service.instance,projectId:before.project.id,revision:before.revision,editorHistoryId:saved.historyId,readGrantId:read.id,revokedGrantId:full.id,editorHistoryRestore:true,stepFlowVerifiedWrites:2,waterConserved:true,mcpServerScopeEnforced:true,physicalWriteDenied:true,revokedControlPaused:true,accessEnabled:true,assessments,current,restartVerified:false},null,2));
 }else if(phase==='restore'){
  const old=JSON.parse(fs.readFileSync(evidenceFile));assert.notEqual(service.instance,old.instance);assert.equal((await raw('agent/state')).status,401);assert.equal((await api('access/status')).enabled,true);
  const login=await raw('access/login',{password});assert.equal(login.status,200);const owner={Cookie:login.cookie};const state=await api('agent/state',undefined,owner);assert.equal(state.revision,old.revision);assert.equal((await api('control/status',undefined,owner)).state,'manual');
  const grants=(await api('access/tokens',undefined,owner)).tokens;assert.equal(grants.find(k=>k.id===old.readGrantId).revokedAt,null);assert.ok(grants.find(k=>k.id===old.revokedGrantId).revokedAt);
  const report=await api('industry/evaluations/'+old.assessments.reportId,undefined,owner);assert.equal(report.status,'report');assert.equal(report.projectId,old.projectId);assert.equal(report.source,'model');assert.equal(report.plan,undefined);const assessed=await api('agent/plans/'+old.assessments.modelPlanId,undefined,owner);assert.equal(assessed.status,'applied');assert.deepEqual(assessed.project.control.machines[0].evidence,[{entryId:'installed_step_basis',version:1}]);assert.equal((await api('industry/evaluations/'+old.assessments.externalReportId,undefined,owner)).source,'external');
  const record=await api('agent/plans/'+old.editorHistoryId,undefined,owner);assert.equal(record.status,'applied');
  fs.writeFileSync(evidenceFile,JSON.stringify({...old,restartVerified:true,protectionPersisted:true,grantMetadataPersisted:true,editorHistoryPersisted:true,manualAfterRestart:true,assessmentHistoryPersisted:true},null,2));
 }else throw Error('Unknown installed feature phase');
 console.log('PASS installed new features',arch,phase);
})().catch(e=>{console.error(e);process.exitCode=1});
