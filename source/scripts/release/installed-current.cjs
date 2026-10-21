'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
module.exports=async function({root,api,raw}){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'build-provenance.json')));assert.equal(manifest.documentation,'docs/DESKTOP.md');assert.ok(fs.existsSync(path.join(root,manifest.documentation)));
 assert.ok(!fs.existsSync(path.join(root,'docs/ai')));assert.ok(!fs.existsSync(path.join(root,'integrations/mcp/test')));
 for(const [folder,report] of Object.entries(manifest.dependencyPolicy))for(const name of report.removedPackages)assert.ok(!fs.existsSync(path.join(root,folder,name)),name);
 const before=await api('agent/state');
 for(const mode of ['visualization','intelligent-control','industry-ai']){
  const state=await api('agent/state'),plan=await api('agent/plans',{expectedRevision:state.revision,operations:[{op:'project.configure',mode}]});assert.equal((await api('agent/state')).revision,state.revision);await api('agent/plans/'+plan.id+'/apply',{});assert.equal((await api('project')).system.mode,mode);assert.equal((await api('control/status')).state,'manual');
 }
 await api('project',before.project,{'If-Match':(await api('agent/state')).revision});assert.equal((await api('agent/state')).revision,before.revision);
 const component={id:'installed_invalid_reference_probe',kind:'number',x:0,y:0,w:200,h:80,tagId:'not_an_existing_point'};
 const rejected=await raw('agent/plans',{expectedRevision:before.revision,operations:[{op:'component.upsert',pageId:before.project.pages[0].id,component}]});assert.equal(rejected.status,400);assert.equal(rejected.data.code,'invalid-reference');
 const badAlarm=await raw('agent/plans',{expectedRevision:before.revision,operations:[{op:'component.upsert',pageId:before.project.pages[0].id,component:{...component,tagId:'',kind:'alarm',threshold:'bad'}}]});assert.equal(badAlarm.status,400);assert.match(badAlarm.data.error,/threshold/);assert.equal((await api('agent/state')).revision,before.revision);
 const {alarmState}=await import(pathToFileURL(path.join(root,'simplehmi/alarm-state.mjs')));const now=Date.now(),point={polling:1000},sample={quality:'good',ts:now,value:80};assert.equal(alarmState({},point,sample,now).state,'unconfigured');assert.equal(alarmState({threshold:80},point,sample,now).state,'active');assert.equal(alarmState({threshold:80},point,{...sample,quality:'stale'},now).state,'waiting');
 const {optimizePage}=await import(pathToFileURL(path.join(root,'simplehmi/topology.mjs'))),fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../../tests/fixtures/complex-process.json'))),r=optimizePage(fixture);assert.ok(r.page.connections.every(e=>e.routeStatus==='ok'));assert.equal(r.diagnostics.filter(d=>d.code==='route-overlap').length,0);assert.ok(r.diagnostics.some(d=>d.code==='channel-adjusted'));assert.deepEqual(optimizePage(r.page).page,r.page);const byId=Object.fromEntries(r.page.components.map(c=>[c.id,c]));for(const [a,b] of [['furnace','boiler'],['boiler','reactor'],['reactor','filter'],['filter','fan']])assert.ok(byId[a].x<byId[b].x);
 return {payloadPolicyVerified:true,threeModeApplyAndRestore:true,invalidReferenceRejected:true,invalidAlarmRejected:true,installedAlarmStates:true,installedChannelSeparation:true,layoutStable:true,realModel:false};
};
