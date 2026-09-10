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
