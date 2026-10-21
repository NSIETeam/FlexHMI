const {test}=require('node:test');const assert=require('node:assert/strict');
const {stepWater}=require('../server/simplehmi/water-simulation');
const {validate,fuxaDevice}=require('../server/simplehmi');
test('process contracts reject incompatible generated points without mutating the project',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs');
 for(const [id,patch] of [['pump_running',{writable:true}],['source_level',{type:'Bool'}],['pump_command',{sim:'wave'}],['pump_command',{initial:2}],['pump_command',{writable:false}]]){
  const p=waterDemo(),tag=p.devices[0].tags.find(t=>t.id===id);Object.assign(tag,patch);const before=structuredClone(p);
  assert.throws(()=>validate(p),e=>e.code==='invalid-simulation'&&e.message.includes(id));assert.deepEqual(p,before);
 }
 const p=waterDemo();p.devices[0].tags=p.devices[0].tags.filter(t=>t.id!=='pump_command');assert.throws(()=>validate(p),/缺少命令点 pump_command/);
 p.simulation='invented';assert.throws(()=>validate(p),/未知过程模型/);
 const physical=waterDemo();physical.devices[0].protocol='ModbusTCP';assert.throws(()=>validate(physical),/必须属于模拟设备/);
 delete physical.simulation;assert.doesNotThrow(()=>validate(physical));
});
test('model startup feedback follows commands rather than conflicting tag initial values',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs');const p=waterDemo('intelligent-control','startup_test');
 p.devices[0].tags.find(t=>t.id==='source_level').initial=1;
 const dev=fuxaDevice(validate(p),p.devices[0]),initial=id=>dev.tags['sh_'+p.id+'_'+id].init;
 assert.equal(initial('pump_running'),'0');assert.equal(initial('transfer_flow'),'0');assert.equal(initial('source_level'),'65');assert.equal(initial('total_volume'),'4.15');
 // Unused model outputs may be removed; unrelated manual tags keep their behavior.
 for(const page of p.pages){page.components=[];page.connections=[]}delete p.control;
 p.devices[0].tags=p.devices[0].tags.filter(t=>t.id==='pump_command');assert.doesNotThrow(()=>validate(p));
});
test('AI plans cannot turn process feedback into commands',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs'),{applyOperations,digest}=require('../server/simplehmi/agent');const p=waterDemo(),before=digest(p);
 await assert.rejects(applyOperations(p,{operations:[{op:'tag.upsert',deviceId:'supply',tag:{id:'pump_running',writable:true}}]},validate),e=>e.code==='invalid-simulation'&&/pump_running/.test(e.message));
 assert.equal(digest(p),before);
});
test('waste process contract retains legacy binary types and rejects writable feedback',()=>{
 const p=structuredClone(require('../simplehmi/waste-to-energy.json'));assert.doesNotThrow(()=>validate(p));
 p.devices[0].tags.find(t=>t.id==='furnace_temp').writable=true;assert.throws(()=>validate(p),/furnace_temp.*必须只读/);
});
test('two tanks conserve water and move in opposite directions with unequal capacity',()=>{
 let p=stepWater(null,0);const initial=p.values;
 for(let i=0;i<100;i++){const next=stepWater(p.state,1);assert.ok(next.values.source_level<p.values.source_level);assert.ok(next.values.destination_level>p.values.destination_level);assert.ok(Math.abs(next.values.total_volume-initial.total_volume)<1e-10);assert.ok(Math.abs((p.state.sourceVolume-next.state.sourceVolume)-(next.state.destinationVolume-p.state.destinationVolume))<1e-10);p=next}
 assert.ok(Math.abs((3.25-p.state.sourceVolume)-(p.state.destinationVolume-.9))<1e-10);
 // Published percentages are rounded to 0.01%; volume conservation is asserted on physical state above.
 assert.ok(Math.abs((initial.source_level-p.values.source_level)*5-(p.values.destination_level-initial.destination_level)*3)<.04);
});
test('stopping holds both tank levels and flow is zero; restarting resumes transfer',()=>{const p=stepWater(null,1);const stopped=stepWater(p.state,0,10);assert.deepEqual(stopped.state,p.state);assert.equal(stopped.values.transfer_flow,0);assert.equal(stopped.values.pump_running,0);assert.ok(stepWater(stopped.state,1).state.sourceVolume<p.state.sourceVolume)});
test('full destination and dry source limit exact transfer without creating or losing water',()=>{
 const nearFull={sourceVolume:2,destinationVolume:2.849};const full=stepWater(nearFull,1,60);assert.ok(Math.abs(full.state.destinationVolume-2.85)<1e-10);assert.equal(full.values.destination_high,1);assert.equal(full.values.pump_running,0);assert.ok(Math.abs(full.state.sourceVolume+full.state.destinationVolume-4.849)<1e-10);assert.deepEqual(stepWater(full.state,1).state,full.state);
 const nearDry={sourceVolume:.251,destinationVolume:.8};const dry=stepWater(nearDry,1,60);assert.equal(dry.state.sourceVolume,.25);assert.equal(dry.values.source_low,1);assert.equal(dry.values.pump_running,0);assert.ok(Math.abs(dry.state.sourceVolume+dry.state.destinationVolume-1.051)<1e-10);
});
test('water demo binds separate levels, actual pump feedback and writable command with straight routes',async()=>{const {waterDemo}=await import('../simplehmi/water-demo.mjs');const {routePage}=await import('../simplehmi/topology.mjs');const {validate}=require('../server/simplehmi');const p=validate(waterDemo('visualization','testwater'));const components=p.pages[0].components;assert.equal(p.simulation,'water-transfer');assert.notEqual(components.find(c=>c.id==='tank_1').tagId,components.find(c=>c.id==='tank_2').tagId);const routed=routePage(p.pages[0]);assert.deepEqual(routed.diagnostics,[]);assert.ok(routed.page.connections.every(c=>c.points.length===2));assert.equal(p.devices[0].tags.find(t=>t.id==='pump_running').writable,false);});
test('first launch and project demo entry use the same physically coupled water model',()=>{const fs=require('node:fs'),path=require('node:path');const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../simplehmi/demo.json')));assert.equal(p.simulation,'water-transfer');const bindings=p.pages[0].components.filter(c=>c.kind==='tank').map(c=>c.tagId);assert.deepEqual(bindings,['source_level','destination_level']);assert.ok(p.devices[0].tags.filter(t=>bindings.includes(t.id)).every(t=>t.sim==='manual'));});
test('Agent switches model and device atomically while preserving bindings and reporting control pause',async()=>{
 const {waterDemo}=await import('../simplehmi/water-demo.mjs'),{applyOperations,digest}=require('../server/simplehmi/agent');const p=waterDemo('intelligent-control','conversion_test'),before=digest(p);
 const operations=[{op:'device.upsert',device:{id:'supply',protocol:'ModbusTCP',host:'127.0.0.1',port:1503}},{op:'project.configure',simulation:null}];
 const result=await applyOperations(p,{operations},validate);assert.equal(digest(p),before);assert.equal(result.project.simulation,undefined);assert.deepEqual(result.project.pages.map(p=>p.components.map(c=>c.tagId)),p.pages.map(p=>p.components.map(c=>c.tagId)));
 for(const code of ['simulation-model-changed','runtime-restart','control-paused'])assert.ok(result.impacts.some(i=>i.code===code),code);
 const restored=await applyOperations(result.project,{operations:[{op:'project.configure',simulation:'water-transfer'},{op:'device.upsert',device:{id:'supply',protocol:'sim'}}]},validate);assert.equal(restored.project.simulation,'water-transfer');
 const unchanged=await applyOperations(p,{operations:[{op:'project.configure',name:'改名称'}]},validate);assert.equal(unchanged.project.simulation,p.simulation);assert.ok(!unchanged.impacts.some(i=>i.code==='control-paused'));
 await assert.rejects(applyOperations(p,{operations:[{op:'project.configure',simulation:'invented'}]},validate),/模型无效/);
});
