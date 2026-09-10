'use strict';
// Executes with the installed Node, against the installed runtime on a fresh CI VM.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [root,artifacts,arch,phase]=process.argv.slice(2),{configuration,request}=require(path.join(root,'desktop/ipc/launcher.cjs'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 assert.equal(process.platform,'win32');assert.equal(process.arch,arch);const c=configuration(root),service=await request(c,'status');assert.equal(service.ready,true);
 async function api(route,body){const res=await fetch(service.origin+'/simplehmi/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await res.json();assert.equal(res.ok,true,JSON.stringify(data));return data}
 const snapshot=await api('agent/state'),name='Windows '+arch+' 保存重开验收';assert.ok(snapshot.project.devices.every(d=>d.protocol==='sim'),'Smoke test must never use physical devices');
 if(phase==='exercise'){
  assert.equal(snapshot.project.simulation,'water-transfer');assert.equal((await api('control/status')).state,'manual');
  await api('write',{tagId:'pump_command',value:0});await delay(1400);const held1=(await api('values')).values;await delay(1400);const held2=(await api('values')).values;
  assert.equal(held1.source_level.value,held2.source_level.value);assert.equal(held1.destination_level.value,held2.destination_level.value);
  await api('write',{tagId:'pump_command',value:1});await delay(2200);const moving=(await api('values')).values;
  assert.ok(moving.source_level.value<held2.source_level.value);assert.ok(moving.destination_level.value>held2.destination_level.value);assert.equal(moving.total_volume.value,4.15);
  await api('write',{tagId:'pump_command',value:0});
  const preview=await api('agent/plans',{expectedRevision:snapshot.revision,actor:'windows-package-qa',summary:'Windows 安装包保存和数据绑定验收',operations:[{op:'project.configure',name},{op:'page.upsert',page:{id:'windows_qa',name:'验收画面',width:640,height:480,background:'#ffffff',components:[]}},{op:'component.upsert',pageId:'windows_qa',component:{id:'windows_qa_value',kind:'number',label:'原水箱液位',x:48,y:64,w:240,h:100,tagId:'source_level'}}]});assert.equal(preview.blocked,false);const applied=await api('agent/plans/'+preview.id+'/apply',{});assert.equal(applied.status,'applied');
  fs.writeFileSync(path.join(artifacts,'exercise.json'),JSON.stringify({platform:process.platform,arch,origin:service.origin,instance:service.instance,pid:service.pid,held:held2,moving,revision:applied.revision,projectId:snapshot.project.id},null,2));
 }else if(phase==='restore'){
  assert.equal(snapshot.project.name,name);assert.equal(snapshot.project.pages.find(p=>p.id==='windows_qa').components[0].tagId,'source_level');assert.equal((await api('control/status')).state,'manual');
  const before=JSON.parse(fs.readFileSync(path.join(artifacts,'exercise.json')));assert.notEqual(service.instance,before.instance);
  fs.writeFileSync(path.join(artifacts,'restore.json'),JSON.stringify({platform:process.platform,arch,origin:service.origin,instance:service.instance,projectId:snapshot.project.id,revision:snapshot.revision,controlState:'manual',pageRestored:true,bindingRestored:true},null,2));
 }else throw Error('Invalid verification phase');
 console.log('PASS installed package',arch,phase,service.origin);
})().catch(e=>{console.error(e);process.exitCode=1});
