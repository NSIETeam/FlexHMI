const {test}=require('node:test'),assert=require('node:assert/strict');
const node=(id,x,y)=>({id,kind:'pump',label:id,x,y,w:120,h:120});
const page=(components,connections)=>({id:'main',name:'流程',width:1200,height:800,components,connections});
test('same-side return ports use two bends without an artificial last jog',async()=>{
 const {routePage}=await import('../simplehmi/topology.mjs');const p=page([node('a',100,160),node('b',620,160)],[{id:'r',from:'b',to:'a',fromPort:'top',toPort:'top'}]);const e=routePage(p).page.connections[0];assert.equal(e.routeStatus,'ok');assert.equal(e.routeInfo.bends,2);assert.equal(e.points.length,4);assert.equal(e.points[1].y,e.points[2].y);assert.equal(e.routeInfo.arrowDirection,'bottom');
});
test('cycles unfold into ordered equipment and an outside return; repeated optimization is stable',async()=>{
 const {optimizePage}=await import('../simplehmi/topology.mjs');const p=page([node('c',60,80),node('a',430,250),node('b',720,120)],[{id:'ab',from:'a',to:'b'},{id:'bc',from:'b',to:'c'},{id:'ca',from:'c',to:'a'}]),r=optimizePage(p);const byId=Object.fromEntries(r.page.components.map(n=>[n.id,n]));assert.ok(byId.a.x<byId.b.x&&byId.b.x<byId.c.x);assert.ok(r.page.connections.every(e=>e.routeStatus==='ok'));const back=r.page.connections.find(e=>e.id==='ca');assert.equal(back.layoutRole,'return');assert.equal(back.routeInfo.bends,2);assert.equal(back.from,'c');assert.equal(back.to,'a');assert.ok(back.points[1].y<Math.min(...r.page.components.map(n=>n.y)));assert.deepEqual(optimizePage(r.page).page,r.page);
});
test('branch ordering follows upstream paths and does not depend on input array order',async()=>{
 const {optimizePage}=await import('../simplehmi/topology.mjs');const p=page([node('a',50,70),node('b',50,350),node('x',650,70),node('y',650,350)],[{id:'ay',from:'a',to:'y'},{id:'bx',from:'b',to:'x'}]);const r=optimizePage(p),nodes=Object.fromEntries(r.page.components.map(c=>[c.id,c]));assert.ok(nodes.y.y<nodes.x.y);assert.ok(r.page.connections.every(e=>e.points.length===2));const permuted=optimizePage({...p,components:[...p.components].reverse(),connections:[...p.connections].reverse()});for(const n of permuted.page.components)assert.deepEqual(n,nodes[n.id]);
});
test('automatic ports avoid equipment labels; explicit obstructed ports explain failure',async()=>{
 const {routePage,labelBounds,segmentBlocked}=await import('../simplehmi/topology.mjs');const p=page([node('a',100,60),node('b',100,460)],[{id:'e',from:'a',to:'b'}]);let r=routePage(p),e=r.page.connections[0];assert.equal(e.routeStatus,'ok');const boxes=p.components.map(labelBounds);for(let i=1;i<e.points.length;i++)assert.equal(segmentBlocked(e.points[i-1],e.points[i],boxes),false);assert.ok(r.diagnostics.some(d=>d.code==='port-adjusted'));p.connections[0].fromPort='bottom';r=routePage(p);assert.equal(r.page.connections[0].routeStatus,'blocked');assert.match(r.page.connections[0].routeError,/设备名称/);
});
test('crossing diagnostics distinguish a visual crossover from actual connectivity',async()=>{
 const {connectionCrossings}=await import('../simplehmi/topology.mjs');const a={id:'a',from:'a1',to:'a2',routeStatus:'ok',points:[{x:0,y:50},{x:100,y:50}]},b={id:'b',from:'b1',to:'b2',routeStatus:'ok',points:[{x:50,y:0},{x:50,y:100}]};assert.equal(connectionCrossings([a,b])[0].code,'route-crossing');assert.equal(connectionCrossings([a,{...b,points:[{x:10,y:50},{x:90,y:50}]}])[0].code,'route-overlap');assert.equal(connectionCrossings([a,{...b,from:'a1',points:[{x:0,y:50},{x:40,y:50},{x:40,y:150}]}]).length,0);
});
test('connection editor previews preserve equipment, support reversed arrows and reset automatic ports',async()=>{
 const {connectionDraft}=await import('../simplehmi/connection-editor.mjs');const p=page([node('a',100,100),node('b',500,100)],[{id:'e',from:'a',to:'b',fromPort:'right',toPort:'left'}]),before=JSON.stringify(p),r=connectionDraft(p,{id:'e',from:'b',to:'a',label:'回水',routeMode:'auto',tagId:'running'});assert.equal(JSON.stringify(p),before);assert.deepEqual(r.page.components,p.components);const e=r.page.connections[0];assert.equal(e.routeInfo.arrowDirection,'left');assert.equal(e.tagId,'running');assert.equal(e.fromPort,undefined);assert.equal(e.toPort,undefined);assert.throws(()=>connectionDraft(p,{id:'e',from:'a',to:'a'}),/不同/);assert.throws(()=>connectionDraft(p,{id:'e',from:'a',to:'b',fromPort:'unknown'}),/端口/);
});
test('connection hit targets exist only in editor markup and all text is escaped',async()=>{
 const {connectionMarkup}=await import('../simplehmi/agent-studio.mjs');const p=page([],[{id:'e',label:'<img onerror="x">',from:'a',to:'b',routeStatus:'ok',points:[{x:0,y:0},{x:100,y:0}]}]);assert.ok(!connectionMarkup(p).includes('tabindex'));const html=connectionMarkup(p,{interactive:true});assert.ok(html.includes('data-edit-connection="e"'));assert.ok(html.includes('tabindex="0"'));assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);
});
test('runtime flow only animates fresh true Bool values and stops on stale data',async()=>{
 const {connectionFlowState}=await import('../simplehmi/agent-studio.mjs'),e={tagId:'run'},tags=[{id:'run',type:'Bool',polling:500}],values={run:{quality:'good',ts:10000,value:true}};
 assert.equal(connectionFlowState(e,values,tags,true,11000),'flowing');assert.equal(connectionFlowState(e,values,tags,false,11000),'static');assert.equal(connectionFlowState(e,values,tags,true,14000),'stale');values.run.value=false;assert.equal(connectionFlowState(e,values,tags,true,11000),'stopped');values.run.quality='stale';assert.equal(connectionFlowState(e,values,tags,true,11000),'stale');assert.equal(connectionFlowState(e,values,[{id:'run',type:'Float32'}],true,11000),'static');
});

test('explicit returns do not reorder the main process even when IDs and feed branches prefer another cycle entry',async()=>{
 const {optimizePage,routePage,segmentBlocked,portAnchor}=await import('../simplehmi/topology.mjs');
 const original=require('./fixtures/complex-process.json'),input=structuredClone(original),result=optimizePage(input),p=result.page,byId=Object.fromEntries(p.components.map(n=>[n.id,n]));
 const main=['waste','furnace','boiler','reactor','filter','fan','stack'];for(let i=1;i<main.length;i++)assert.ok(byId[main[i-1]].x<byId[main[i]].x,main[i]);
 assert.deepEqual(input,original);assert.ok(!result.diagnostics.some(d=>d.code==='cycle-layout'));
 const back=p.connections.find(e=>e.id==='edge_10');assert.equal(back.routeMode,'return');assert.equal(back.layoutRole,'return');assert.equal(back.from,'fan');assert.equal(back.to,'furnace');assert.equal(back.routeInfo.bends,2);
 for(const e of p.connections){assert.equal(e.routeStatus,'ok');assert.deepEqual(e.points[0],portAnchor(byId[e.from],e.resolvedPorts.from));assert.deepEqual(e.points.at(-1),portAnchor(byId[e.to],e.resolvedPorts.to));const obstacles=p.components.filter(c=>c.id!==e.from&&c.id!==e.to).map(c=>({x:c.x,y:c.y,r:c.x+c.w,b:c.y+c.h}));for(let i=1;i<e.points.length;i++){assert.ok(e.points[i].x===e.points[i-1].x||e.points[i].y===e.points[i-1].y);assert.ok(!segmentBlocked(e.points[i-1],e.points[i],obstacles));}}
 assert.deepEqual(optimizePage(p).page,p);
 const permuted=optimizePage({...input,components:[...input.components].reverse(),connections:[...input.connections].reverse()}).page;
 for(const c of permuted.components)assert.deepEqual(c,byId[c.id]);for(const e of permuted.connections)assert.deepEqual(e,p.connections.find(x=>x.id===e.id));
 const moved=structuredClone(p);moved.components.find(c=>c.id==='reactor').y+=40;const routed=routePage(moved).page;assert.deepEqual(routed.components,moved.components);assert.equal(routed.connections.find(e=>e.id==='edge_2').to,'reactor');assert.equal(routed.connections.find(e=>e.id==='edge_3').from,'reactor');assert.notDeepEqual(routed.connections.find(e=>e.id==='edge_2').points,p.connections.find(e=>e.id==='edge_2').points);
 assert.deepEqual(routed.connections.find(e=>e.id==='edge_5'),p.connections.find(e=>e.id==='edge_5'));
});
test('declared return decisions are reversible and inferred layoutRole cannot override new graph direction',async()=>{
 const {graphColumns}=await import('../simplehmi/graph-layout.mjs');const nodes=['a','b','c'].map(id=>({id}));
 const edges=[{id:'ab',from:'a',to:'b',routeMode:'return'},{id:'bc',from:'b',to:'c'},{id:'ca',from:'c',to:'a'}];
 const r=graphColumns(nodes,edges);assert.deepEqual(r.columns.map(([,items])=>items.map(c=>c.id)),[['b'],['c'],['a']]);assert.deepEqual(r.feedback,['ab']);assert.deepEqual(r.cycles,[]);
 const again=graphColumns(nodes,edges.map(e=>({...e,routeMode:'auto',layoutRole:'return'})));assert.deepEqual(again.columns.map(([,items])=>items.map(c=>c.id)),[['a'],['b'],['c']]);assert.deepEqual(again.feedback,['ca']);assert.equal(again.cycles.length,1);
});
