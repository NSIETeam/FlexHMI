import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function safeBase(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('FlexHMI MCP 仅连接不含凭据的本机 HTTP(S) 地址');if(u.hostname==='localhost')u.hostname='127.0.0.1';if(!u.pathname.endsWith('/'))u.pathname+='/';return u;}
export function createApi({base,agentId='mcp-agent',token=process.env.FLEXHMI_TOKEN,fetchImpl=fetch,timeoutMs=30000}={}){
 let resolved=base?safeBase(base):null;
 async function discover(){if(resolved)return resolved;try{const {configuration,request}=require('../../desktop/ipc/launcher.cjs'),s=await request(configuration(),'status');if(s.ready)return safeBase(s.origin+'/simplehmi/api/')}catch{}return safeBase('http://127.0.0.1:1881/simplehmi/api/');}
 return async(route,body,signal)=>{
  const destination=await discover(),url=new URL(route,destination);if(url.origin!==destination.origin||!url.pathname.startsWith(destination.pathname))throw Error('禁止访问 FlexHMI API 之外的地址');
  const timeout=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
   const res=await fetchImpl(url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-FlexHMI-Agent':agentId,...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:combined});
   const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||'FlexHMI 请求失败'),{status:res.status,code:data.code||'backend-error',outcomeUnknown:body!==undefined&&(data.outcomeUnknown===true||res.status>=500)});return data;
  }catch(e){if(e.status)throw e;throw Object.assign(Error('本机服务连接中断或响应无效：'+e.message),{code:'transport-error',outcomeUnknown:body!==undefined,recovery:body!==undefined?'先读取计划状态、实时值和审计；不要盲目重试写入。':'确认 FlexHMI 已启动且本机地址正确。'});}
 };
}
