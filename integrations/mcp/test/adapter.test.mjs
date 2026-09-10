import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {safeBase,createApi} from '../client.mjs';import {buildTools} from '../tools.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})})}
async function until(fn){for(let i=0;i<100;i++){try{const r=await fn();if(r)return r}catch{}await delay(150)}throw Error('Backend did not become ready')}
test('MCP URL transport is local-only, rejects redirects and reports uncertain write outcomes',async()=>{
 for(const url of ['https://example.com/simplehmi/api/','http://user:secret@localhost/','file:///tmp/a','http://localhost/?token=x'])assert.throws(()=>safeBase(url));assert.equal(safeBase('http://localhost:1881/simplehmi/api').hostname,'127.0.0.1');
 let options;const api=createApi({base:'http://127.0.0.1:1881/simplehmi/api/',fetchImpl:async(u,o)=>{options=o;throw Error('disconnected')}});await assert.rejects(api('agent/plans',{}),e=>e.outcomeUnknown===true&&e.recovery.includes('不要盲目'));assert.equal(options.redirect,'error');
 await assert.rejects(api('../outside'),/之外/);
 const failedWrite=createApi({base:'http://127.0.0.1:1881/simplehmi/api/',fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:'readback timed out',outcomeUnknown:true})})});await assert.rejects(failedWrite('agent/write',{}),e=>e.outcomeUnknown===true&&e.status===400);
});
test('MCP validates tool arguments and enforces host scopes without an HTTP request',async()=>{
 let called=0;const api=async()=>{called++;return {}};const read=buildTools(api,{access:'read'});assert.ok(!read.some(t=>t.name==='flexhmi_apply'));
 const full=buildTools(api);await assert.rejects(full.find(t=>t.name==='flexhmi_write_point').call({}),e=>e.code==='invalid-arguments');await assert.rejects(full.find(t=>t.name==='flexhmi_control_arm').call({expectedRevision:'a'.repeat(64),physicalTargets:['out']}),/未启用真实/);assert.equal(called,0);
 const controller=new AbortController();let received;const tools=buildTools(async(r,b,s)=>{received=s;return {}});await tools[0].call({},controller.signal);assert.equal(received,controller.signal);
});
test('official MCP stdio client engineers and operates a real FUXA simulation', {timeout:60000},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'flex-mcp-')),port=await freePort();let log='',backend,client,readClient;
 async function connect(access='full'){
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'integrations/mcp/server.mjs')],env:{...process.env,FLEXHMI_URL:`http://127.0.0.1:${port}/simplehmi/api/`,FLEXHMI_ACCESS:access,FLEXHMI_PHYSICAL_WRITES:'0',FLEXHMI_AGENT_ID:'mcp-acceptance'},stderr:'pipe'});transport.stderr.on('data',b=>log+=b);
  const c=new Client({name:'flexhmi-acceptance',version:'1.0.0'});await c.connect(transport);return c;
 }
 async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;}
 try{
  backend=spawn(process.execPath,[path.join(root,'server/main.js')],{cwd:temp,env:{...process.env,SIMPLEHMI:'1',PORT:String(port),userDir:temp},stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>log+=b);backend.stderr.on('data',b=>log+=b);
  await until(async()=> (await(await fetch(`http://127.0.0.1:${port}/simplehmi/api/status`)).json()).ready);
  client=await connect();const listed=await client.listTools();assert.equal(listed.tools.length,21);assert.equal((await client.listResources()).resources.length,4);
  const guide=await client.readResource({uri:'flexhmi://guide'});assert.match(guide.contents[0].text,/expectedRevision/);
  const prompt=await client.getPrompt({name:'build_system',arguments:{requirement:'双水箱供水画面',mode:'visualization'}});assert.match(prompt.messages[0].content.text,/双水箱/);
  const before=await call('flexhmi_state');
  const plan=await call('flexhmi_preview',{expectedRevision:before.revision,summary:'MCP 添加已绑定变量的画面',operations:[{op:'page.upsert',page:{id:'mcp_page',name:'MCP 生成画面',width:640,height:480,components:[]}},{op:'component.upsert',pageId:'mcp_page',component:{id:'mcp_number',kind:'number',label:'原水箱液位',tagId:'source_level',x:40,y:60,w:240,h:100}}]});assert.equal(plan.blocked,false);assert.equal((await call('flexhmi_state')).revision,before.revision);
  const applied=await call('flexhmi_apply',{planId:plan.id});assert.equal(applied.status,'applied');assert.equal((await call('flexhmi_apply',{planId:plan.id})).replayed,true);
  const state=await call('flexhmi_state');assert.equal(state.project.pages.find(p=>p.id==='mcp_page').components[0].tagId,'source_level');
  await until(async()=> (await call('flexhmi_values')).values.pump_command.quality==='good');const observed=(await call('flexhmi_values')).values.pump_command,v=observed.value;
  const q={expectedRevision:state.revision,deviceId:'supply',tagId:'pump_command',expectedValue:v,observedAt:observed.ts,value:Number(v)?0:1,outputMin:0,outputMax:1};assert.equal((await call('flexhmi_write_point',q)).verified,true);
  const conflict=await client.callTool({name:'flexhmi_write_point',arguments:q});assert.equal(conflict.isError,true);assert.equal(conflict.structuredContent.code,'value-conflict');
  assert.ok((await call('flexhmi_audit')).data.some(e=>e.event==='point-write-verified'&&e.actor==='mcp-acceptance'));
  readClient=await connect('read');assert.ok(!(await readClient.listTools()).tools.some(t=>t.name==='flexhmi_apply'));await assert.rejects(readClient.callTool({name:'flexhmi_apply',arguments:{planId:plan.id}}),/未在当前/);
  const {waterDemo}=await import('../../../simplehmi/water-demo.mjs');
  const knowledge={id:'mcp_evidence',title:'MCP 守恒演示资料',domain:'示例',source:'测试样例，不是行业标准',version:1,content:'封闭水箱演示系统的总水量恒定为 4.15 m³。'};
  const seed=await call('flexhmi_preview',{expectedRevision:state.revision,summary:'准备 MCP 行业评估与控制',operations:[{op:'project.configure',mode:'industry-ai'},{op:'knowledge.upsert',entry:knowledge},{op:'rule.upsert',rule:waterDemo('intelligent-control','mcp_fixture').control.rules[0]}]});await call('flexhmi_apply',{planId:seed.id});
  const seeded=await call('flexhmi_state');assert.equal((await call('flexhmi_control_arm',{expectedRevision:seeded.revision})).state,'automatic');assert.equal((await call('flexhmi_control_pause')).state,'manual');
  const context=await call('flexhmi_assessment_context',{expectedRevision:seeded.revision,prompt:'依据演示资料核验总水量',knowledgeIds:['mcp_evidence'],observedTagIds:['total_volume']});
  const evaluation=await call('flexhmi_evaluate',{contextId:context.id,summary:'引用守恒资料的 MCP 评估',operations:[{op:'project.configure',name:'MCP 行业评估已应用'}],assessment:{conclusion:'当前总水量符合本演示的守恒值，不代表现场认证。',citations:[{entryId:'mcp_evidence',version:1,excerpt:'总水量恒定为 4.15 m³。'}],conditions:[{tagId:'total_volume',min:4.14,max:4.16}]}});
  assert.equal(evaluation.status,'preview');assert.equal((await call('flexhmi_assessment',{evaluationId:evaluation.id})).id,evaluation.id);await call('flexhmi_apply',{planId:evaluation.plan.id});assert.equal((await call('flexhmi_state')).project.name,'MCP 行业评估已应用');
  const fresh=await call('flexhmi_state'),stale=await client.callTool({name:'flexhmi_preview',arguments:{expectedRevision:before.revision,summary:'过期计划',operations:[{op:'project.configure',name:'不应覆盖'}]}});assert.equal(stale.isError,true);assert.equal(stale.structuredContent.status,409);assert.equal((await call('flexhmi_state')).revision,fresh.revision);
 }catch(e){e.message+='\n'+log.slice(-2500);throw e}
 finally{await readClient?.close();await client?.close();if(backend&&backend.exitCode===null)await new Promise(r=>{backend.once('exit',r);backend.kill('SIGTERM');setTimeout(()=>{backend.kill('SIGKILL');r()},3000).unref()});fs.rmSync(temp,{recursive:true,force:true});}
});
