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
  await tab.goto(base);await tab.getByRole('button',{name:'添加报警',exact:true}).dblclick();
  const card=tab.locator('[data-kind="alarm"]'),id=await card.getAttribute('data-id');
  const state=async expected=>until(async()=>await card.locator('[data-alarm-state]').getAttribute('data-alarm-state')===expected);
  await state('unconfigured');assert.equal(await tab.locator('#c-threshold').inputValue(),'');
  await tab.locator('[data-prop="data"]').click();await tab.locator('#c-tag').selectOption('source_level');
  await state('unconfigured');await tab.locator('[data-prop="appearance"]').click();
  const limit=tab.locator('#c-threshold');await limit.fill('1000');await limit.blur();await state('normal');
  assert.ok((await card.innerText()).includes('未触发上限报警'));assert.ok(!(await card.innerText()).includes('运行正常'));
  await limit.fill('0');await limit.blur();await state('active');await tab.screenshot({path:path.join(artifacts,'FlexHMI-上限报警.png')});
  await limit.fill('');await limit.blur();await state('unconfigured');
  await until(async()=> (await api('project')).pages.flatMap(p=>p.components).find(c=>c.id===id)?.threshold===null);
  await tab.reload();await state('unconfigured');await card.click();await tab.locator('[data-prop="appearance"]').click();assert.equal(await tab.locator('#c-threshold').inputValue(),'');
  await tab.screenshot({path:path.join(artifacts,'FlexHMI-未配置报警.png')});
  await tab.locator('#c-threshold').fill('1000');await tab.locator('#c-threshold').blur();await state('normal');
  await tab.getByRole('button',{name:'运行',exact:true}).click();await state('normal');
  // Fault injection changes the browser's sample only; real model or PLC quality is not claimed.
  let variant='stale';await tab.route('**/simplehmi/api/values',async route=>{const r=await route.fetch(),data=await r.json();data.values.source_level={...data.values.source_level,quality:variant==='stale'?'stale':'good',ts:variant==='old'?Date.now()-60000:Date.now(),value:variant==='invalid'?'not-a-number':0};await route.fulfill({response:r,json:data})});
  await state('waiting');assert.ok(!(await card.innerText()).includes('未触发'));variant='invalid';await state('invalid');variant='old';await state('waiting');
  await tab.screenshot({path:path.join(artifacts,'FlexHMI-数据失效报警.png')});
  await tab.unroute('**/simplehmi/api/values');await state('normal');await tab.getByRole('button',{name:'返回编辑'}).click();
  await card.click();await tab.locator('[data-prop="data"]').click();await tab.locator('#c-tag').selectOption('');await state('unbound');
  assert.deepEqual(errors,[]);const result={passed:true,browser:'headless Chrome',isolatedData:true,newAlarmHasNoAssumedLimit:true,zeroThresholdActive:true,clearAndReloadUnconfigured:true,normalMeansOnlyUpperLimitNotTriggered:true,unboundExplicit:true,runtimeStaleInvalidAndOldSamplesCannotShowNormal:true,recoveryAfterFreshData:true,faultInjection:'browser values response only',desktopInteractiveTested:false};fs.writeFileSync(path.join(artifacts,'alarm-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }catch(e){if(tab){await tab.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(artifacts,'failure.html'),await tab.content().catch(()=>''));}fs.writeFileSync(path.join(artifacts,'backend-failure.log'),logs);throw e}
 finally{await browser?.close();if(backend&&backend.exitCode===null&&!backend.signalCode)await new Promise(r=>{backend.once('exit',r);backend.kill('SIGTERM');setTimeout(()=>{backend.kill('SIGKILL');r()},3000).unref()});fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
