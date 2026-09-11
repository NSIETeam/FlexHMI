const {test}=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../server/simplehmi'),{applyOperations}=require('../server/simplehmi/agent');
const fixture=()=>({schemaVersion:1,id:'alarm_project',name:'报警验收',devices:[],activePageId:'main',pages:[{id:'main',width:800,height:600,components:[{id:'alarm',kind:'alarm',x:20,y:20,w:300,h:140}]}]});
test('alarm drafts remain explicitly unconfigured and invalid thresholds fail with location',async()=>{
 const p=fixture();assert.equal(validate(p).pages[0].components[0].threshold,undefined);
 const preview=await applyOperations(p,{operations:[{op:'project.configure',name:'draft'}]},validate);assert.ok(preview.impacts.some(i=>i.code==='alarm-unconfigured'&&i.entity==='alarm'));
 for(const threshold of ['', '80', false, {}, []]){p.pages[0].components[0].threshold=threshold;assert.throws(()=>validate(p),/main\/组件\/alarm\/threshold/)}
 for(const threshold of [null,0,-12.5,80]){p.pages[0].components[0].threshold=threshold;assert.equal(validate(p).pages[0].components[0].threshold,threshold)}
});
test('alarm never reports normal without a configured limit and fresh numeric evidence',async()=>{
 const {alarmState}=await import('../simplehmi/alarm-state.mjs'),now=100000,point={polling:1000},sample={quality:'good',ts:now,value:20},c={threshold:80};
 for(const threshold of [undefined,null,'',false,'80',NaN,Infinity])assert.equal(alarmState({threshold},point,sample,now).state,'unconfigured');
 assert.equal(alarmState(c,null,sample,now).state,'unbound');
 for(const s of [undefined,{...sample,quality:'stale'},{...sample,ts:0},{...sample,ts:now-3501},{...sample,ts:now+1001}])assert.equal(alarmState(c,point,s,now).state,'waiting');
 for(const value of [null,undefined,'',' ',NaN,Infinity,'bad',{},[]])assert.equal(alarmState(c,point,{...sample,value},now).state,'invalid');
 for(const value of [0,79.99,'20',false])assert.equal(alarmState(c,point,{...sample,value},now).state,'normal');
 for(const value of [80,81])assert.equal(alarmState(c,point,{...sample,value},now).state,'active');
 assert.equal(alarmState({threshold:1},point,{...sample,value:true},now).state,'active');
 assert.equal(alarmState({threshold:0},point,{...sample,value:0},now).state,'active');
 assert.equal(alarmState({threshold:-10},point,{...sample,value:-11},now).state,'normal');
 assert.equal(alarmState(c,{polling:2000},{...sample,ts:now-5000},now).state,'normal');
});
