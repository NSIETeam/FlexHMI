// Real browser and FUXA backend; the model response is an explicitly local protocol fixture.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('../../integrations/browser/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'flex-report-ui-'));
const artifacts=path.resolve(root,process.env.FLEXHMI_ASSESSMENT_ARTIFACTS||path.join(os.tmpdir(),'flex-assessment-evidence'));fs.mkdirSync(artifacts,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){let last;for(let i=0;i<100;i++){try{const r=await fn();if(r)return r}catch(e){last=e}await sleep(150)}throw Error('Assessment UI timeout: '+(last?.message||''))}
async function stop(child){if(!child||child.exitCode!==null)return;await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');r()},3000).unref()})}
(async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>r(port))})});
 const base=`http://127.0.0.1:${port}/simplehmi/`;let backend,browser,tab,logs='',model;
 const start=()=>{backend=spawn(process.execPath,[path.join(root,'server/main.js')],{cwd:temp,env:{...process.env,SIMPLEHMI:'1',PORT:String(port),userDir:temp},stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>logs+=b);backend.stderr.on('data',b=>logs+=b)};
 async function api(route,body){const r=await fetch(base+'api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d}
 function report(context,summary='浏览器生成的供水评估',operations=[]){const e=context.entries[0];return {summary,operations,assessment:{conclusion:'当前总水量符合该演示模型的记录，本次无需修改工程。',citations:[{entryId:e.id,version:e.version,excerpt:e.content.slice(0,120)}],conditions:Object.entries(context.observed).map(([tagId,v])=>({tagId,min:Number(v.value),max:Number(v.value)}))}}}
 try{
  start();await until(async()=> (await api('status')).ready);
  const {waterDemo}=await import('../../simplehmi/water-demo.mjs'),p=waterDemo('industry-ai','report_browser');await api('project',p);
  await until(async()=> (await api('values')).values.total_volume?.quality==='good');
  model=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const context=JSON.parse(JSON.parse(body).messages[1].content).evidenceContext;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(report(context))}}]}))});
  await new Promise(r=>model.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{channel:'chrome'})});
  tab=await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});const errors=[];tab.on('pageerror',e=>errors.push(e.message));
  await tab.goto(base);await tab.getByRole('button',{name:'AI 工作台',exact:true}).click();
  await tab.locator('#ai-model').fill('assessment-protocol-fixture');await tab.locator('#ai-base-url').fill('http://127.0.0.1:'+model.address().port+'/v1');await tab.locator('#ai-save-config').click();
  await until(async()=>!(await tab.locator('#ai-generate').isDisabled()));
  await tab.locator('#ai-task').selectOption('assess');await tab.locator('#ai-prompt').fill('核对演示总水量，条件满足时保留无改动报告。');
  await tab.locator('#ai-evidence-options details').nth(1).evaluate(e=>e.open=true);
  for(const box of await tab.locator('[data-ai-observe]').all())await box.setChecked((await box.getAttribute('data-ai-observe'))==='total_volume');
  const before=await api('agent/state');await tab.locator('#ai-generate').click();await tab.getByText(/报告编号：evaluation_/).waitFor();
  assert.equal((await api('agent/state')).revision,before.revision);assert.equal(await tab.locator('#agent-apply').isDisabled(),true);
  const saved=(await api('industry/evaluations?source=model')).records[0];assert.ok(saved.id);await tab.getByRole('button',{name:'关闭',exact:true}).click();
  await stop(backend);start();await until(async()=> (await api('status')).ready);await tab.reload();
  await tab.getByRole('button',{name:'AI 工作台',exact:true}).click();await tab.locator('#agent-assessments').click();
  await tab.locator(`[data-evaluation-id="${saved.id}"]`).click();await tab.getByText('当前总水量符合该演示模型的记录，本次无需修改工程。',{exact:true}).waitFor();
  assert.equal(await tab.locator('#agent-apply').isDisabled(),true);assert.equal((await api('industry/evaluations/'+saved.id)).source,'model');
  await tab.locator('#agent-result').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await until(async()=>{const r=await tab.locator('#agent-result').boundingBox(),b=await tab.locator('.agent-dialog .dialog-body').boundingBox();return r.y>=b.y&&r.y+r.height<=b.y+b.height});await tab.screenshot({path:path.join(artifacts,'FlexHMI-重启后找回评估.png')});
  await tab.getByRole('button',{name:'关闭',exact:true}).click();
  await until(async()=> (await api('values')).values.total_volume?.quality==='good');
  const request={expectedRevision:(await api('agent/state')).revision,prompt:'检验评估历史',knowledgeIds:[p.knowledge[0].id],observedTagIds:['total_volume']};
  for(let i=0;i<23;i++){const c=await api('industry/context',request);await api('industry/evaluations',{contextId:c.id,...report(c.context,'外部供水评估 '+i)})}
  const c=await api('industry/context',request),proposed=await api('industry/evaluations',{contextId:c.id,...report(c.context,'可审阅的工程名称建议',[{op:'project.configure',name:'已审阅的供水工程'}])});
  await tab.getByRole('button',{name:'AI 工作台',exact:true}).click();await tab.locator('#agent-assessments').click();
  await until(async()=>await tab.locator('[data-evaluation-id]').count()===20);await tab.locator('#assessment-more').click();await until(async()=>await tab.locator('[data-evaluation-id]').count()===25);
  assert.equal(await tab.locator('#assessment-more').isVisible(),false);const ids=await tab.locator('[data-evaluation-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.evaluationId));assert.equal(new Set(ids).size,25);
  await tab.locator('#assessment-source').selectOption('model');await until(async()=>await tab.locator('[data-evaluation-id]').count()===1);
  await tab.locator('#assessment-source').selectOption('external');await tab.locator('#assessment-query').fill('外部供水评估 22');await tab.locator('#assessment-search button').click();
  await until(async()=>await tab.locator('[data-evaluation-id]').count()===1);assert.ok((await tab.locator('.assessment-history-list').innerText()).includes('外部供水评估 22'));
  await tab.locator('#assessment-query').fill('不存在的报告');await tab.locator('#assessment-search button').click();await tab.getByText('该筛选下暂无评估记录。',{exact:true}).waitFor();
  await tab.locator('#assessment-query').fill('');await tab.locator('#assessment-search button').click();await until(async()=>await tab.locator('[data-evaluation-id]').count()===20);
  await tab.locator('#agent-assessments-panel').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await tab.screenshot({path:path.join(artifacts,'FlexHMI-评估记录搜索.png')});
  await tab.locator(`[data-evaluation-id="${proposed.id}"]`).click();await until(async()=>!(await tab.locator('#agent-apply').isDisabled()));await tab.locator('#agent-apply').click();await until(async()=>!(await tab.locator('#dialog').evaluate(e=>e.open)));
  assert.equal((await api('project')).name,'已审阅的供水工程');
  await tab.getByRole('button',{name:'AI 工作台',exact:true}).click();await tab.locator('#agent-assessments').click();await tab.locator(`[data-evaluation-id="${proposed.id}"]`).click();
  await tab.getByText('状态：已应用',{exact:true}).waitFor();assert.equal(await tab.locator('#agent-apply').isDisabled(),true);
  await tab.setViewportSize({width:767,height:700});await tab.locator('#agent-assessments').click();await until(async()=>await tab.locator('[data-evaluation-id]').count()===20);
  await tab.locator('#agent-assessments-panel').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
  await until(async()=>{const r=await tab.locator('#agent-assessments-panel').boundingBox(),b=await tab.locator('.agent-dialog .dialog-body').boundingBox();return r.y>=b.y&&r.y<b.y+60});assert.ok(await tab.locator('[data-evaluation-id]').first().evaluate(e=>{const r=e.getBoundingClientRect(),s=e.querySelector('span').getBoundingClientRect();return s.x-r.x<20}));const bounds=await tab.locator('#dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=767);
  assert.equal(await tab.locator('#assessment-search').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await tab.screenshot({path:path.join(artifacts,'FlexHMI-窄屏评估记录.png')});assert.deepEqual(errors,[]);
  const result={passed:true,browser:'headless Chrome',isolatedData:true,model:'local protocol fixture, not a real LLM',reportGeneratedFromUi:true,noProjectMutation:true,reportSurvivesBackendRestart:true,search:true,pagination:true,sourceFilter:true,latestPlanStatus:true,narrowLayout:true};fs.writeFileSync(path.join(artifacts,'assessment-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(tab)await tab.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(artifacts,'backend-failure.log'),logs);throw e}
 finally{await browser?.close();model?.close();await stop(backend);fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
