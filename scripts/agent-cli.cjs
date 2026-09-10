#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const base=new URL(process.env.SIMPLEHMI_URL||'http://127.0.0.1:1881/simplehmi/api/');
if(!base.pathname.endsWith('/'))base.pathname+='/';
if(base.username||base.password||!['http:','https:'].includes(base.protocol))throw Error('请使用不包含凭据的本机 HTTP(S) 地址');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('当前 Agent 接口仅支持本机地址');
async function api(route,body){const res=await fetch(new URL(route,base),{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw Error(`${res.status}: ${data.error}`);return data}
async function main(){const [command,arg]=process.argv.slice(2);let data;
 switch(command){
  case 'schema':data=await api('agent/schema');break;
  case 'knowledge':data=await api('knowledge?q='+encodeURIComponent(arg||''));break;
  case 'control':data=await api('control/status');break;
  case 'pause':data=await api('control/pause',{});break;
  case 'assessment':if(!arg)throw Error('需要评估 ID');data=await api('industry/evaluations/'+encodeURIComponent(arg));break;
  case 'context':case 'assess':case 'arm':{if(!arg)throw Error('需要请求 JSON 文件');const request=JSON.parse(fs.readFileSync(arg,'utf8'));const route={context:'industry/context',assess:'industry/evaluations',arm:'control/arm'}[command];data=await api(route,request);break;}
  case 'inspect':data=await api('agent/state');break;
  case 'capabilities':data=await api('agent/capabilities');break;
  case 'audit':data=await api('agent/audit');break;
  case 'values':data=await api('values');break;
  case 'history':if(!arg)throw Error('需要变量 ID');data=await api('history/'+encodeURIComponent(arg));break;
  case 'preview':{if(!arg)throw Error('需要计划 JSON 文件路径');const plan=JSON.parse(fs.readFileSync(arg,'utf8'));if(!plan.expectedRevision)throw Error('计划必须包含 inspect 返回的 expectedRevision；禁止自动替换以掩盖并发冲突');data=await api('agent/plans',plan);break;}
  case 'apply':case 'cancel':if(!arg)throw Error('需要计划 ID');data=await api(`agent/plans/${encodeURIComponent(arg)}/${command}`,{});break;
  default:throw Error('用法：node scripts/agent-cli.cjs inspect|capabilities|schema|values|history <tagId>|audit|preview <plan.json>|apply <planId>|cancel <planId>|knowledge [query]|context <request.json>|assess <request.json>|assessment <id>|control|arm <request.json>|pause');
 }
 process.stdout.write(JSON.stringify(data,null,2)+'\n');
}
main().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1});
