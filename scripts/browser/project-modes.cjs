// Browser acceptance of project creation and reviewed type conversion on an isolated FUXA instance.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('../../integrations/browser/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'flex-mode-ui-'));
const artifacts=path.resolve(root,process.env.FLEXHMI_MODE_ARTIFACTS||path.join(os.tmpdir(),'flex-mode-evidence'));fs.mkdirSync(artifacts,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){let last;for(let i=0;i<100;i++){try{const r=await fn();if(r)return r}catch(e){last=e}await sleep(150)}throw Error('Project type UI timeout: '+(last?.message||''))}
async function stop(child){if(!child||child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');r()},3000).unref()})}
(async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
 const base=`http://127.0.0.1:${port}/simplehmi/`;let backend,browser,tab,logs='';
 const start=()=>{backend=spawn(process.execPath,[path.join(root,'server/main.js')],{cwd:temp,env:{...process.env,SIMPLEHMI:'1',PORT:String(port),userDir:temp},stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>logs+=b);backend.stderr.on('data',b=>logs+=b)};
 async function api(route,body,status=200){const r=await fetch(base+'api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d}
 const labels={'visualization':'数据可视化','intelligent-control':'智能控制','industry-ai':'行业 AI 系统'},created={};
 try{
  start();await until(async()=> (await api('status')).ready);
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{channel:'chrome'})});
  tab=await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});const errors=[];tab.on('pageerror',e=>errors.push(e.message));
  await tab.goto(base);
  for(const [mode,label] of Object.entries(labels)){
   await tab.getByRole('button',{name:'项目',exact:true}).click();await tab.locator('#new-project').click();
   await tab.locator('#new-name').fill(label+'新建验收');await tab.locator(`input[name=project-mode][value="${mode}"]`).check();
   assert.equal(await tab.locator('.project-mode-choice').count(),3);
   if(mode==='industry-ai')await tab.screenshot({path:path.join(artifacts,'FlexHMI-选择系统类型.png')});
   await tab.getByRole('button',{name:'创建工程',exact:true}).click();await until(async()=>!(await tab.locator('#dialog').evaluate(d=>d.open)));
   const p=await api('project');created[mode]=p.id;assert.equal(p.system.mode,mode);assert.equal(p.name,label+'新建验收');assert.equal(p.pages.length,1);assert.equal(p.devices.length,0);assert.equal((await api('control/status')).state,'manual');
   await tab.reload();await tab.getByRole('button',{name:'系统类型：'+label,exact:true}).waitFor();
   await tab.getByRole('button',{name:'AI 工作台',exact:true}).click();await tab.getByLabel('本次生成类型',{exact:true}).waitFor();assert.equal(await tab.locator('#agent-mode').inputValue(),mode);await tab.getByRole('button',{name:'关闭',exact:true}).click();
  }
  // A server restart, not only a browser reload, must retain all three saved project types.
  await stop(backend);start();await until(async()=> (await api('status')).ready);await tab.reload();
  for(const [mode,label] of Object.entries(labels)){
   await tab.getByRole('button',{name:'项目',exact:true}).click();await tab.locator(`[data-load="${created[mode]}"]`).click();await tab.getByRole('button',{name:'系统类型：'+label,exact:true}).waitFor();assert.equal((await api('project')).system.mode,mode);
  }
  const {waterDemo}=await import('../../simplehmi/water-demo.mjs');
  const rich=waterDemo('industry-ai','mode_conversion');rich.system.mode='intelligent-control';
  const machine=JSON.parse(fs.readFileSync(path.join(root,'examples/water-steps.simplehmi.json'))).control.machines[0];machine.enabled=false;rich.control.machines=[machine];
  rich.control.rules[0].onThreshold=90;rich.control.rules[0].offThreshold=95;
  await api('project',rich);await tab.reload();await tab.locator('#project-mode').waitFor();
  await until(async()=> (await api('values')).values.pump_command?.quality==='good');await api('control/arm',{expectedRevision:(await api('agent/state')).revision});
  await until(async()=>Number((await api('values')).values.pump_command.value)===1);
  const baseline=await api('project');
  // Opening and cancelling a conversion must not pause a running system or mutate the project.
  await tab.locator('#project-mode').click();await tab.locator('input[value=visualization]').check();await tab.locator('#mode-preview').click();await until(async()=>!(await tab.locator('#mode-apply').isDisabled()));
  assert.equal((await api('project')).system.mode,'intelligent-control');assert.equal((await api('control/status')).state,'automatic');
  await tab.getByRole('button',{name:'关闭',exact:true}).click();assert.deepEqual(await api('project'),baseline);assert.equal((await api('control/status')).state,'automatic');
  await tab.getByRole('button',{name:'项目',exact:true}).click();await tab.locator('#project-mode-settings').click();await tab.locator('input[value=visualization]').check();await tab.locator('#mode-preview').click();await until(async()=>!(await tab.locator('#mode-apply').isDisabled()));
  assert.ok((await tab.locator('#mode-result').innerText()).includes('不能启动自动控制'));
  await tab.screenshot({path:path.join(artifacts,'FlexHMI-预览类型转换.png')});
  // Editing the choice invalidates the previous preview.
  await tab.locator('input[value=industry-ai]').check();assert.equal(await tab.locator('#mode-apply').isDisabled(),true);await tab.locator('input[value=visualization]').check();await tab.locator('#mode-preview').click();await until(async()=>!(await tab.locator('#mode-apply').isDisabled()));
  await tab.locator('#mode-apply').click();await until(async()=>!(await tab.locator('#dialog').evaluate(d=>d.open)));
  let converted=await api('project');assert.equal(converted.system.mode,'visualization');assert.equal((await api('control/status')).state,'manual');assert.equal(Number((await api('values')).values.pump_command.value),1,'conversion must not secretly issue a stop value');
  for(const key of ['pages','devices','control','knowledge','simulation','activePageId'])assert.deepEqual(converted[key],baseline[key],key+' preserved');
  assert.match((await api('control/arm',{expectedRevision:(await api('agent/state')).revision},400)).error,/工程类型/);
  // Revision conflicts reject a stale preview and require a fresh, visible preview.
  await tab.locator('#project-mode').click();await tab.locator('input[value=industry-ai]').check();await tab.locator('#mode-preview').click();await until(async()=>!(await tab.locator('#mode-apply').isDisabled()));
  const external=await api('project');external.name='外部修改后的供水工程';await api('project',external);
  await tab.locator('#mode-apply').click();await tab.getByText(/工程已被其他操作修改/).waitFor();assert.equal(await tab.locator('#mode-apply').isDisabled(),true);assert.equal((await api('project')).system.mode,'visualization');
  await tab.locator('#mode-preview').click();await until(async()=>!(await tab.locator('#mode-apply').isDisabled()));await tab.getByText('外部修改后的供水工程 · 当前类型：数据可视化',{exact:true}).waitFor();await tab.locator('#mode-apply').click();await until(async()=>!(await tab.locator('#dialog').evaluate(d=>d.open)));
  converted=await api('project');assert.equal(converted.system.mode,'industry-ai');assert.equal(converted.name,external.name);for(const key of ['pages','devices','control','knowledge'])assert.deepEqual(converted[key],baseline[key]);assert.equal((await api('control/status')).state,'manual');
  await tab.setViewportSize({width:767,height:700});await tab.locator('#project-mode').click();await tab.locator('input[value=intelligent-control]').check();await tab.locator('#mode-preview').click();await until(async()=>!(await tab.locator('#mode-apply').isDisabled()));
  const bounds=await tab.locator('#dialog').boundingBox(),apply=await tab.locator('#mode-apply').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=767);assert.ok(apply.y>=bounds.y&&apply.y+apply.height<=bounds.y+bounds.height);assert.equal(await tab.locator('.project-mode-dialog .dialog-body').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await tab.screenshot({path:path.join(artifacts,'FlexHMI-窄屏类型转换.png')});await tab.locator('#mode-apply').click();await until(async()=>!(await tab.locator('#dialog').evaluate(d=>d.open)));assert.equal((await api('project')).system.mode,'intelligent-control');assert.equal((await api('control/status')).state,'manual');
  await stop(backend);start();await until(async()=> (await api('status')).ready);await tab.reload();await tab.getByRole('button',{name:'系统类型：智能控制',exact:true}).waitFor();assert.equal((await api('project')).name,external.name);
  // If another editor already made this conversion, a fresh preview is a no-op and leaves its control session alone.
  await tab.locator('#project-mode').click();await tab.locator('input[value=industry-ai]').check();const sameTarget=await api('project');sameTarget.system.mode='industry-ai';await api('project',sameTarget);await until(async()=> (await api('values')).values.pump_command?.quality==='good');await api('control/arm',{expectedRevision:(await api('agent/state')).revision});
  await tab.locator('#mode-preview').click();await tab.getByText('当前工程已经是该类型，无需转换。',{exact:true}).waitFor();assert.equal(await tab.locator('#mode-apply').isDisabled(),true);assert.equal((await api('control/status')).state,'automatic');await tab.getByRole('button',{name:'关闭',exact:true}).click();await api('control/pause',{});
  // Legacy projects without a type are presented as visualization without silently rewriting them.
  const legacy=await api('project');delete legacy.system;await api('project',legacy);await tab.reload();await tab.getByRole('button',{name:'系统类型：数据可视化',exact:true}).click();assert.equal(await tab.locator('input[value=visualization]').isChecked(),true);assert.equal(await tab.locator('#mode-preview').isDisabled(),true);assert.equal((await api('project')).system,undefined);
  assert.deepEqual(errors,[]);
  const result={passed:true,browser:'headless Chrome',isolatedData:true,threeTypesCreatedFromUi:true,typesPersistAcrossServerRestart:true,visibleCurrentType:true,modelGenerationDefaultsToCurrentType:true,cancelDoesNotPauseControl:true,previewDoesNotApply:true,changedChoiceInvalidatesPreview:true,conversionPausesControl:true,conversionDoesNotWriteStop:true,visualizationCannotArm:true,layoutsBindingsRulesStepsKnowledgePreserved:true,revisionConflictRejected:true,freshPreviewAfterConflict:true,narrowDialogActionsVisible:true,legacyTypeNotSilentlyRewritten:true,alreadyConvertedDoesNotPauseControl:true};fs.writeFileSync(path.join(artifacts,'project-modes-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(tab)await tab.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(artifacts,'backend-failure.log'),logs);throw e}
 finally{await browser?.close();await stop(backend);fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
