const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{fork}=require('node:child_process');
const {projectStore}=require('../server/simplehmi/project-store'),{applyOperations,digest}=require('../server/simplehmi/agent'),{validate}=require('../server/simplehmi');
const project=id=>({schemaVersion:1,id,name:id,devices:[],pages:[{id:'page',name:'画面',width:800,height:600,components:[]}]});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flex-projects-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const save=p=>fs.writeFileSync(path.join(dir,p.id+'.json'),JSON.stringify(p));return {dir,save,store:projectStore(dir,validate)}}
test('saved project lifecycle preserves exact archived content and refuses stale or active targets',async t=>{
 const {save,store}=fixture(t),current=project('current'),other=project('other');save(current);save(other);
 const revision=store.read('other').revision;
 await assert.rejects(applyOperations(current,{operations:[{op:'project.delete',id:'current',expectedSavedRevision:digest(current)}]},validate,store),/当前运行/);
 await assert.rejects(applyOperations(current,{operations:[{op:'project.load',id:'other',expectedSavedRevision:'bad'}]},validate,store),/版本/);
 const deletion=await applyOperations(current,{operations:[{op:'project.delete',id:'other',expectedSavedRevision:revision}]},validate,store);assert.equal(deletion.project.id,'current');assert.equal(store.exists('other'),true);assert.equal(deletion.impacts[0].code,'project-archived');
 store.execute(deletion.fileEffect);assert.equal(store.exists('other'),false);assert.equal(store.completed(deletion.fileEffect),true);assert.deepEqual(store.read(deletion.fileEffect.archiveId,true).project,other);
 const restore=store.prepare({op:'project.restore',archiveId:deletion.fileEffect.archiveId,expectedSavedRevision:revision},'current');store.execute(restore.effect);assert.equal(store.completed(restore.effect),true);assert.deepEqual(store.read('other').project,other);assert.equal(store.inventory('current').archives.length,0);
 const load=await applyOperations(current,{operations:[{op:'project.load',id:'other',expectedSavedRevision:revision},{op:'project.configure',name:'加载后编辑'}]},validate,store);assert.equal(load.project.name,'加载后编辑');assert.equal(load.pauseControl,true);assert.equal(store.read('other').project.name,'other');
 save({...other,name:'changed elsewhere'});assert.throws(()=>store.check(load.fileConditions),e=>e.status===409);assert.throws(()=>store.read('../escape'),/ID/);
});
test('new projects and restore destinations are checked again immediately before mutation',async t=>{
 const {store,save}=fixture(t),current=project('current'),next=project('new');save(current);
 const plan=await applyOperations(current,{operations:[{op:'project.create',project:next}]},validate,store);save(next);assert.throws(()=>store.check(plan.fileConditions),/已变化/);
 const deletion=store.prepare({op:'project.delete',id:next.id,expectedSavedRevision:digest(next)},current.id);store.execute(deletion.effect);
 const restore=store.prepare({op:'project.restore',archiveId:deletion.effect.archiveId,expectedSavedRevision:digest(next)},current.id);save({...next,name:'new occupant'});assert.throws(()=>store.execute(restore.effect),/已变化/);assert.equal(store.read('new').project.name,'new occupant');assert.ok(store.read(deletion.effect.archiveId,true));
 await assert.rejects(applyOperations(current,{operations:[{op:'project.create',project:project('a')},{op:'project.create',project:project('b')}]},validate,store),/一项/);
});
async function startChild(dir,phase){
 const child=fork(path.join(__dirname,'fixtures/agent-process.cjs'),[],{env:{...process.env,FLEXHMI_TEST_DIR:dir,FLEXHMI_CRASH_PHASE:phase||''},execArgv:[],silent:true});let logs='';child.stderr.on('data',b=>logs+=b);child.stdout.on('data',b=>logs+=b);
 const messages=[],waiters=[];child.on('message',m=>{messages.push(m);for(const w of [...waiters])w()});
 function wait(key){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('Fixture timeout '+key+' '+logs))},10000);function cleanup(){clearTimeout(timer);const i=waiters.indexOf(check);if(i>=0)waiters.splice(i,1)}function check(){const m=messages.find(m=>Object.hasOwn(m,key));if(m){cleanup();resolve(m[key])}const error=messages.find(m=>m.error);if(error){cleanup();reject(Error(error.error))}}waiters.push(check);check()})}
 const port=await wait('port');const request=async(route,body)=>{const r=await fetch('http://127.0.0.1:'+port+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
 const stop=async()=>{if(child.exitCode!==null||child.signalCode)return;await new Promise(r=>{child.once('exit',r);child.kill('SIGKILL')})};return {request,wait,stop};
}
for(const phase of ['before-save','after-save'])test('SIGKILL '+phase+' reconciles the journal without replaying an interrupted operation',{timeout:25000},async t=>{
 const {dir,save}=fixture(t),p=project('original');save(p);fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(p));let child=await startChild(dir,phase);t.after(()=>child.stop());
 const before=(await child.request('/agent/state')).data,plan=(await child.request('/agent/plans',{expectedRevision:before.revision,operations:[{op:'project.configure',name:'desired'}]})).data;
 const pending=child.request('/agent/plans/'+plan.id+'/apply',{}).catch(()=>null);assert.equal(await child.wait('phase'),phase);await child.stop();await pending;
 child=await startChild(dir);const recovered=(await child.request('/agent/plans/'+plan.id)).data;
 assert.equal(recovered.status,phase==='after-save'?'applied':'interrupted');assert.equal(recovered.recovery.completed,phase==='after-save');assert.equal((await child.request('/agent/state')).data.project.name,phase==='after-save'?'desired':'original');
 const retry=await child.request('/agent/plans/'+plan.id+'/apply',{});assert.equal(retry.status,phase==='after-save'?200:400);if(phase==='after-save')assert.equal(retry.data.replayed,true);
 assert.ok((await child.request('/agent/plans')).data.some(p=>p.id===plan.id));await child.stop();
});
test('restart reconciles archived files and reports corrupt journal records without blocking the service',{timeout:15000},async t=>{
 const {dir,save,store}=fixture(t),p=project('original'),other=project('inactive');save(p);save(other);fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(p));
 const effect=store.prepare({op:'project.delete',id:'inactive',expectedSavedRevision:digest(other)},p.id).effect;
 fs.mkdirSync(path.join(dir,'agent'),{recursive:true});fs.writeFileSync(path.join(dir,'agent/plan_archive.json'),JSON.stringify({id:'plan_archive',status:'applying',fileEffect:effect,project:p,before:p}));fs.writeFileSync(path.join(dir,'agent/plan_corrupt.json'),'{broken');store.execute(effect);
 const child=await startChild(dir);t.after(()=>child.stop());assert.equal((await child.request('/agent/plans/plan_archive')).data.status,'applied');const inventory=(await child.request('/agent/projects')).data;assert.ok(inventory.archives.some(p=>p.archiveId===effect.archiveId));assert.ok(!inventory.projects.some(p=>p.id==='inactive'));assert.ok((await child.request('/agent/plans')).data.some(p=>p.id==='plan_corrupt'&&p.status==='unreadable'));assert.equal(fs.readFileSync(path.join(dir,'agent/plan_corrupt.json'),'utf8'),'{broken');await child.stop();
});

test('history restoration previews all overwritten changes, rejects races, is replay-safe and persists',{timeout:25000},async t=>{
 const {dir,save}=fixture(t),original=validate(project('history'));save(original);fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(original));let child=await startChild(dir);t.after(()=>child.stop());
 const state=async()=> (await child.request('/agent/state')).data;
 const preview=async operations=>child.request('/agent/plans',{expectedRevision:(await state()).revision,operations});
 const initial=(await preview([{op:'component.upsert',pageId:'page',component:{id:'newlabel',kind:'text',label:'Added',x:20,y:20,w:120,h:40}}])).data;
 await child.request('/agent/plans/'+initial.id+'/apply',{});
 const rename=(await preview([{op:'project.configure',name:'later changes'}])).data;await child.request('/agent/plans/'+rename.id+'/apply',{});
 const restore=(await preview([{op:'project.revert',planId:initial.id}])).data;
 assert.equal(restore.revertsPlanId,initial.id);assert.equal(restore.pauseControl,true);assert.equal(restore.project.name,'history');assert.equal(restore.project.pages[0].components.length,0);assert.equal((await state()).project.name,'later changes');assert.ok(restore.changes.some(c=>c.action==='removed'));assert.ok(restore.impacts.some(i=>i.code==='physical-state-not-reverted'));
 const newer=(await preview([{op:'project.configure',name:'concurrent'}])).data;await child.request('/agent/plans/'+newer.id+'/apply',{});assert.equal((await child.request('/agent/plans/'+restore.id+'/apply',{})).status,409);
 const fresh=(await preview([{op:'project.revert',planId:initial.id}])).data;assert.equal((await child.request('/agent/plans/'+fresh.id+'/apply',{})).status,200);assert.equal((await state()).project.name,'history');
 assert.equal((await child.request('/agent/plans/'+fresh.id+'/apply',{})).data.replayed,true);await child.stop();child=await startChild(dir);assert.equal((await state()).project.pages[0].components.length,0);assert.equal((await child.request('/agent/plans/'+fresh.id+'/apply',{})).data.replayed,true);
 const history=(await child.request('/agent/plans')).data;assert.equal(history.find(p=>p.id===fresh.id).canRevert,true);assert.equal(history.find(p=>p.id===restore.id).canRevert,false);
 const mixed=await preview([{op:'project.revert',planId:initial.id},{op:'project.configure',name:'extra'}]);assert.equal(mixed.status,400);await child.stop();
});

test('restoring deleted knowledge uses a new historical high-water version and invalidates old rule evidence',{timeout:25000},async t=>{
 const {dir,save}=fixture(t),{waterDemo}=await import('../simplehmi/water-demo.mjs'),p=validate(waterDemo('intelligent-control','restoreknowledge'));const entry={id:'evidence',title:'Test evidence',domain:'test',source:'fixture',content:'Original control guidance.',version:1};p.knowledge=[entry];p.control.rules[0].evidence=[{entryId:'evidence',version:1}];save(p);fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(p));const child=await startChild(dir);t.after(()=>child.stop());
 const preview=async operations=>child.request('/agent/plans',{expectedRevision:(await child.request('/agent/state')).data.revision,operations});
 const edit=(await preview([{op:'knowledge.upsert',entry:{...entry,version:7,content:'Revised control guidance.'}}])).data;await child.request('/agent/plans/'+edit.id+'/apply',{});
 const remove=(await preview([{op:'knowledge.delete',id:entry.id}])).data;await child.request('/agent/plans/'+remove.id+'/apply',{});
 const restore=(await preview([{op:'project.revert',planId:edit.id}])).data;assert.equal(restore.project.knowledge[0].version,8);assert.equal(restore.project.knowledge[0].content,entry.content);assert.equal(restore.project.control.rules[0].enabled,false);assert.match(restore.project.control.rules[0].invalidReason,/需重新评估/);assert.equal((await child.request('/agent/plans/'+restore.id+'/apply',{})).status,200);
 const neverApplied=await preview([{op:'project.revert',planId:remove.id}]);assert.equal(neverApplied.status,200);const rejected=await preview([{op:'project.revert',planId:neverApplied.data.id}]);assert.equal(rejected.status,400);
 await child.stop();
});

test('history restoration refuses cross-project switches, archived-file plans and missing snapshots',async()=>{
 const p=project('current');const run=source=>applyOperations(p,{operations:[{op:'project.revert',planId:'plan_test'}]},validate,null,{read:()=>source,knowledgeVersions:()=>({})});
 await assert.rejects(run({status:'applied',before:project('other'),project:p}),/当前工程/);await assert.rejects(run({status:'applied',before:p,project:p,fileEffect:{}}),/归档/);await assert.rejects(run({status:'interrupted',before:p,project:p}),/已应用/);await assert.rejects(run({status:'applied',project:p}),/已应用/);
});

for(const phase of ['before-save','after-save'])test('history restore SIGKILL '+phase+' does not repeat or lose a confirmed result',{timeout:25000},async t=>{
 const {dir,save}=fixture(t),p=validate(project('restorecrash'));save(p);fs.writeFileSync(path.join(dir,'active.json'),JSON.stringify(p));let child=await startChild(dir);t.after(()=>child.stop());
 const first=(await child.request('/agent/plans',{expectedRevision:(await child.request('/agent/state')).data.revision,operations:[{op:'project.configure',name:'changed'}]})).data;await child.request('/agent/plans/'+first.id+'/apply',{});await child.stop();
 child=await startChild(dir,phase);const revert=(await child.request('/agent/plans',{expectedRevision:(await child.request('/agent/state')).data.revision,operations:[{op:'project.revert',planId:first.id}]})).data;
 const pending=child.request('/agent/plans/'+revert.id+'/apply',{}).catch(()=>null);assert.equal(await child.wait('phase'),phase);await child.stop();await pending;
 child=await startChild(dir);const status=(await child.request('/agent/plans/'+revert.id)).data;assert.equal(status.revertsPlanId,first.id);assert.equal(status.status,phase==='after-save'?'applied':'interrupted');assert.equal((await child.request('/agent/state')).data.project.name,phase==='after-save'?p.name:'changed');
 const retry=await child.request('/agent/plans/'+revert.id+'/apply',{});assert.equal(retry.status,phase==='after-save'?200:400);if(phase==='after-save')assert.equal(retry.data.replayed,true);await child.stop();
});
