// Real headless Chrome UI acceptance, isolated FUXA data and an ephemeral port.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('../../integrations/browser/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'flex-ui-')),artifacts=path.resolve(root,process.env.FLEXHMI_BROWSER_ARTIFACTS||path.join(os.tmpdir(),'flexhmi-browser-evidence'));fs.mkdirSync(artifacts,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){let last;for(let i=0;i<100;i++){try{const v=await fn();if(v)return v}catch(e){last=e}await sleep(150)}throw Error('UI acceptance timed out: '+(last?.message||''))}
(async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});let backend,browser,tab,logs='';
 try{
  backend=spawn(process.execPath,[path.join(root,'server/main.js')],{cwd:temp,env:{...process.env,SIMPLEHMI:'1',PORT:String(port),userDir:temp},stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>logs+=b);backend.stderr.on('data',b=>logs+=b);
  const base=`http://127.0.0.1:${port}/simplehmi/`,api=async route=>(await fetch(base+'api/'+route)).json();await until(async()=> (await api('status')).ready);
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{channel:'chrome'})});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});tab=await context.newPage();const errors=[];tab.on('pageerror',e=>errors.push(e.message));
  const processPage=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/complex-process.json')));
  // Rectangular labeled nodes deliberately isolate graph semantics from SVG port geometry.
  processPage.components=processPage.components.map(c=>({...c,kind:'text',fontSize:18,color:'#343c43',textAlign:'center'}));
  const project={schemaVersion:1,id:'complex_browser',name:'多分支布局验收',devices:[],activePageId:processPage.id,pages:[processPage,{id:'notes',name:'说明',width:800,height:600,components:[{id:'notes_title',kind:'text',label:'保留页面',x:40,y:40,w:300,h:80}]}]};
  const setup=await fetch(base+'api/project',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(project)});assert.equal(setup.status,200);const before=await setup.json();
  await tab.goto(base);const open=()=>tab.getByRole('button',{name:'AI 工作台',exact:true}).click();
  await open();await tab.locator('#agent-layout').click();await until(async()=>!(await tab.locator('#agent-apply').isDisabled()));
  assert.deepEqual(await api('project'),before);assert.ok((await tab.locator('#agent-result').innerText()).includes('中间通道已调整'));await tab.screenshot({path:path.join(artifacts,'FlexHMI-多分支优化预览.png')});
  await tab.getByRole('button',{name:'关闭',exact:true}).click();assert.deepEqual(await api('project'),before);
  await open();await tab.locator('#agent-layout').click();await until(async()=>!(await tab.locator('#agent-apply').isDisabled()));await tab.locator('#agent-apply').click();await until(async()=>!(await tab.locator('#dialog').evaluate(d=>d.open)));
  const optimized=await api('project'),pg=optimized.pages[0],byId=Object.fromEntries(pg.components.map(c=>[c.id,c]));
  const order=['waste','furnace','boiler','reactor','filter','fan','stack'];for(let i=1;i<order.length;i++)assert.ok(byId[order[i-1]].x<byId[order[i]].x);
  assert.deepEqual(optimized.pages[1],before.pages[1]);assert.deepEqual(pg.connections.map(e=>[e.id,e.from,e.to]),before.pages[0].connections.map(e=>[e.id,e.from,e.to]));
  const {connectionCrossings}=await import('../../simplehmi/topology.mjs');assert.equal(connectionCrossings(pg.connections).filter(d=>d.code==='route-overlap').length,0);
  const returnLine=pg.connections.find(e=>e.id==='edge_10');assert.equal(returnLine.layoutRole,'return');assert.equal(returnLine.routeInfo.bends,2);
  await tab.screenshot({path:path.join(artifacts,'FlexHMI-主流程与回流.png')});await tab.reload();await tab.getByRole('button',{name:'AI 工作台',exact:true}).waitFor();assert.deepEqual(await api('project'),optimized);
  const target=tab.locator('[data-id="reactor"]'),bounds=await target.boundingBox();await tab.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await tab.mouse.down();await tab.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2+28,{steps:8});await tab.mouse.up();
  await until(async()=> (await api('project')).pages[0].components.find(c=>c.id==='reactor').y!==byId.reactor.y);const moved=await api('project');assert.notDeepEqual(moved.pages[0].connections.find(e=>e.id==='edge_2').points,pg.connections.find(e=>e.id==='edge_2').points);assert.deepEqual(moved.pages[1],optimized.pages[1]);
  await tab.getByRole('button',{name:'撤销',exact:true}).click();await until(async()=>JSON.stringify((await api('project')).pages)===JSON.stringify(optimized.pages));
  await open();await tab.locator('#agent-layout').click();await until(async()=>!(await tab.locator('#agent-apply').isDisabled()));assert.ok((await tab.locator('#agent-result').innerText()).includes('0 项对象变化'));await tab.getByRole('button',{name:'关闭',exact:true}).click();
  assert.deepEqual(errors,[]);const result={passed:true,browser:'headless Chrome',isolatedData:true,fixture:'complex-process.json with rectangular text nodes',realModel:false,previewDoesNotApply:true,diagnosticsVisible:true,independentPathsSeparated:true,mainOrderRespectsReturn:true,arrowEndpointsPreserved:true,returnTwoBends:true,otherPageUnchanged:true,persistReload:true,localMoveReroutes:true,undoRestores:true,repeatedOptimizeNoChanges:true,remaining:'Two non-connecting crossings remain; shared-path warnings eliminated in this fixture; no claim of arbitrary layout quality'};fs.writeFileSync(path.join(artifacts,'complex-browser.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(artifacts,'optimized-project.json'),JSON.stringify(optimized,null,2));console.log(JSON.stringify(result,null,2));
 }catch(e){if(tab){await tab.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(artifacts,'failure.html'),await tab.content().catch(()=>''));}fs.writeFileSync(path.join(artifacts,'backend-failure.log'),logs);throw e}
 finally{await browser?.close();if(backend&&backend.exitCode===null&&!backend.signalCode)await new Promise(r=>{backend.once('exit',r);backend.kill('SIGTERM');setTimeout(()=>{backend.kill('SIGKILL');r()},3000).unref()});fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
