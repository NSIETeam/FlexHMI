const {test}=require('node:test');const assert=require('node:assert/strict');
const {stepWaste}=require('../server/simplehmi/waste-simulation');
const {validate}=require('../server/simplehmi');const project=require('../simplehmi/waste-to-energy.json');
test('waste project preserves process units, streams, controls, and bindings',()=>{
 validate(project);const all=project.pages.flatMap(p=>p.components),equipment=all.filter(c=>c.kind==='equipment');assert.equal(equipment.length,17);
 for(const symbol of ['waste','pit','furnace','boiler','reactor','filter','fan','stack','dosing','turbine','ash','preheater'])assert.ok(equipment.some(c=>c.symbol===symbol));
 const ids=new Set(project.devices.flatMap(d=>d.tags.map(t=>t.id)));
 for(const c of all){if(c.tagId)assert.ok(ids.has(c.tagId));if(c.valueTag)assert.ok(ids.has(c.valueTag));}
 assert.equal(project.pages.length,2);assert.equal(project.devices[0].tags.filter(t=>t.writable).length,2);
});
test('process starts, warms up, alarms, recovers, then stops',()=>{
 let state,now=10000;const tick=cmd=>{const r=stepWaste(state,cmd,now+=1000);state=r.state;return r.values};
 let v=tick({run:false,fault:false});assert.equal(v.power_mw,0);assert.equal(v.temp_alarm,0);
 for(let i=0;i<30;i++)v=tick({run:true,fault:false});assert.ok(v.furnace_temp>880&&v.furnace_temp<905);assert.ok(v.power_mw>6.7);assert.ok(v.steam_pressure>4.3);assert.equal(v.induced_fan,1);assert.equal(v.recirc_fan,1);assert.equal(v.temp_alarm,0);
 for(let i=0;i<8;i++)v=tick({run:true,fault:true});assert.equal(v.temp_alarm,1);assert.ok(v.furnace_temp>950);
 for(let i=0;i<12;i++)v=tick({run:true,fault:false});assert.equal(v.temp_alarm,0);
 for(let i=0;i<35;i++)v=tick({run:false,fault:false});assert.equal(v.induced_fan,0);assert.equal(v.turbine_on,0);assert.equal(v.power_mw,0);assert.equal(v.feed_rate,0);
});
