'use strict';
const {citationProblems}=require('./knowledge');
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
const compare=(a,op,b)=>({lt:a<b,lte:a<=b,gt:a>b,gte:a>=b,eq:a===b,ne:a!==b})[op];
const outputs=m=>[...new Set((m.states||[]).flatMap(s=>(s.actions||[]).map(a=>a.tagId)))];
const references=m=>[...new Set([...outputs(m),...(m.guards||[]).map(g=>g.tagId),...(m.states||[]).flatMap(s=>(s.transitions||[]).flatMap(t=>(t.conditions||[]).map(g=>g.tagId)))])];
function outputEquals(project,id,a,b){const t=project.devices.flatMap(d=>d.tags).find(t=>t.id===id);return t?.type==='Float32'?Math.fround(Number(a)*t.divisor)===Math.fround(Number(b)*t.divisor):Number(a)===Number(b)}
function validateMachines(project,unique,tags,targets){
 const machines=project.control?.machines||[];
 if(!Array.isArray(machines)||machines.length>20)throw Error('步骤流程最多 20 个');
 for(const m of machines){
  if(!m||!validId(m.id))throw Error('步骤流程 ID 无效');unique(m.id);
  if(typeof m.name!=='string'||!m.name.trim()||m.name.length>100||typeof m.enabled!=='boolean')throw Error('步骤流程名称或启用状态无效');
  const inactiveMissingRefs=!m.enabled&&typeof m.invalidReason==='string'&&m.invalidReason.length>0;
  if(!Array.isArray(m.states)||m.states.length<1||m.states.length>30||!m.states.some(s=>s.id===m.initialState))throw Error('步骤流程需要 1–30 个步骤及有效的起始步骤');
  if(!Number.isFinite(m.maxAgeMs)||m.maxAgeMs<500||m.maxAgeMs>60000||!Number.isFinite(m.minIntervalMs)||m.minIntervalMs<1000||m.minIntervalMs>3600000)throw Error('步骤流程数据时效或最小切换间隔无效');
  function conditions(list){if(!Array.isArray(list)||list.length>16)throw Error('步骤流程条件最多 16 项');for(const g of list)if(!g||(!tags.has(g.tagId)&&!inactiveMissingRefs)||!['lt','lte','gt','gte','eq','ne'].includes(g.op)||!Number.isFinite(g.value))throw Error('步骤流程条件变量或比较无效')}
  conditions(m.guards);
  const ids=new Set(),allOutputs=outputs(m).sort();if(!allOutputs.length||allOutputs.length>16)throw Error('步骤流程需要 1–16 个输出');
  for(const id of allOutputs){if(m.enabled&&targets.has(id))throw Error('同一输出不能由启用的规则或步骤流程同时控制');if(m.enabled)targets.add(id)}
  for(const s of m.states){
   if(!validId(s.id)||ids.has(s.id))throw Error('步骤 ID 无效或重复');ids.add(s.id);
   if(typeof s.name!=='string'||!s.name.trim()||s.name.length>100)throw Error('步骤需要名称');
   if(!Number.isFinite(s.timeoutMs)||(s.timeoutMs!==0&&(s.timeoutMs<1000||s.timeoutMs>86400000)))throw Error('步骤超时应为 0 或 1000–86400000 毫秒');
   if(!Array.isArray(s.actions)||s.actions.length!==allOutputs.length||JSON.stringify(s.actions.map(a=>a.tagId).sort())!==JSON.stringify(allOutputs))throw Error('每个步骤必须为流程的全部输出各声明一次目标值');
   for(const a of s.actions){const t=tags.get(a.tagId);if(!t&&inactiveMissingRefs){if(![a.value,a.min,a.max].every(Number.isFinite)||a.value<a.min||a.value>a.max)throw Error('步骤写值范围无效');continue}if(!t||!t.writable||['100000','300000'].includes(String(t.memory))||(t.protocol==='sim'&&t.sim!=='manual'))throw Error('步骤输出必须是可写点位或手动模拟变量');if(![a.value,a.min,a.max].every(Number.isFinite)||a.min>a.max||a.value<a.min||a.value>a.max)throw Error('步骤写值必须在声明范围内');const raw=a.value*t.divisor;if(!Number.isFinite(raw)||(t.type==='Float32'&&Math.abs(raw)>3.4028234663852886e38)||(t.type==='Bool'&&![0,1].includes(a.value))||(t.type==='UInt16'&&(!Number.isInteger(raw)||raw<0||raw>65535))||(t.type==='Int16'&&(!Number.isInteger(raw)||raw< -32768||raw>32767)))throw Error('步骤写值超出点位类型范围')}
   if(!Array.isArray(s.transitions)||s.transitions.length>20)throw Error('每步最多 20 条跳转');const priorities=new Set();
   for(const t of s.transitions){if(!m.states.some(s=>s.id===t.to)||!Number.isInteger(t.priority)||t.priority<0||t.priority>99||priorities.has(t.priority))throw Error('跳转目标无效，或同一步骤跳转优先级重复');priorities.add(t.priority);conditions(t.conditions);if(!Number.isFinite(t.afterMs)||t.afterMs<0||t.afterMs>86400000||!Number.isFinite(t.holdMs)||t.holdMs<0||t.holdMs>60000||(!t.conditions.length&&t.afterMs<1000))throw Error('跳转需要有效条件或至少 1000 毫秒延时，稳定时间最多 60000 毫秒')}
  }
  const reachable=new Set([m.initialState]);let changed=true;while(changed){changed=false;for(const s of m.states)if(reachable.has(s.id))for(const t of s.transitions)if(!reachable.has(t.to)){reachable.add(t.to);changed=true}}
  if(m.states.some(s=>!reachable.has(s.id)))throw Error('流程包含无法从起始步骤到达的步骤');
 }
}
function initialRecord(project,m,values,now){const initial=m.states.find(s=>s.id===m.initialState);for(const a of initial.actions)if(!outputEquals(project,a.tagId,values[a.tagId]?.value,a.value))throw Error(`流程“${m.name}”输出与起始步骤不一致，请先人工核对并调整`);return {stateId:initial.id,stateName:initial.name,enteredAt:now,lastTransitionAt:0,pending:null,pendingSince:0,writes:0,transitions:0,expectedOutputs:Object.fromEntries(initial.actions.map(a=>[a.tagId,a.value])),lastMessage:'已接管，等待步骤条件'};}
async function tickMachine(m,record,{project,readValues,fresh,now,audit,writeValue,isCurrent,fault}){
 const fail=message=>fault(`流程“${m.name}”${message}`,m.id),refs=references(m);
 function evidenceCurrent(){const problems=citationProblems(project,m,now());if(problems.length){fail(problems.join('；')+'；停止后续写入，已执行输出需人工核对');return false}return true}
 function inspect(){if(!evidenceCurrent())return null;const values=readValues();if(refs.some(id=>!fresh(values,id,m.maxAgeMs))){fail('数据失效，停止后续自动写入；当前输出需人工核对');return null}if(Object.entries(record.expectedOutputs).some(([id,v])=>!outputEquals(project,id,values[id].value,v))){fail('输出被外部修改，已退出自动控制');return null}if(!m.guards.every(g=>compare(Number(values[g.tagId].value),g.op,g.value))){fail('运行允许条件不满足，已停止后续写入；当前输出需人工核对');return null}return values}
 const values=inspect();if(!values)return;const state=m.states.find(s=>s.id===record.stateId);
 if(state.timeoutMs&&now()-record.enteredAt>=state.timeoutMs){fail(`步骤“${state.name}”超时，已停止后续写入`);return}
 const eligible=t=>now()-record.enteredAt>=t.afterMs&&t.conditions.every(g=>compare(Number(values[g.tagId].value),g.op,g.value));
 const transition=[...state.transitions].sort((a,b)=>a.priority-b.priority).find(eligible);
 if(!transition){record.pending=null;record.lastMessage=state.transitions.length?'等待跳转条件':'终点步骤，保持输出监测';return}
 const key=state.id+':'+transition.priority;if(record.pending!==key){record.pending=key;record.pendingSince=now()}
 if(now()-record.pendingSince<transition.holdMs||(record.lastTransitionAt&&now()-record.lastTransitionAt<m.minIntervalMs)){record.lastMessage='等待条件稳定或最小切换间隔';return}
 const target=m.states.find(s=>s.id===transition.to),triggerValues=Object.fromEntries(refs.map(id=>[id,Number(values[id].value)]));let verifiedWrites=0;
 audit({event:'transition-started',machineId:m.id,from:state.id,to:target.id,priority:transition.priority});
 for(const action of target.actions){
  if(!isCurrent())return;
  const current=inspect();if(!current)return;if(state.timeoutMs&&now()-record.enteredAt>=state.timeoutMs){fail('步骤切换期间超时，已执行输出需人工核对');return}
  if(!transition.conditions.every(g=>compare(Object.hasOwn(record.expectedOutputs,g.tagId)?triggerValues[g.tagId]:Number(current[g.tagId].value),g.op,g.value))){fail('切换期间条件发生变化；已验证的写入保留，请人工核对');return}
  if(outputEquals(project,action.tagId,current[action.tagId].value,action.value))continue;
  audit({event:'write-requested',machineId:m.id,from:state.id,to:target.id,tagId:action.tagId,value:action.value});
  try{const result=await writeValue(action.tagId,action.value);if(!result?.verified||!outputEquals(project,action.tagId,result.value,action.value))throw Error('写入未通过回读验证');verifiedWrites++;audit({event:'write-verified',machineId:m.id,tagId:action.tagId,value:result.value});if(!isCurrent())return;record.expectedOutputs[action.tagId]=action.value;record.writes++;}
  catch(e){if(isCurrent())fail(`步骤切换写入失败：${e.message}；本次已有 ${verifiedWrites} 项写入验证，设备输出不回滚`);return}
 }
 if(!isCurrent()||!evidenceCurrent())return;record.stateId=target.id;record.stateName=target.name;record.enteredAt=now();record.lastTransitionAt=now();record.pending=null;record.transitions++;record.lastMessage='已进入“'+target.name+'”，输出已回读';audit({event:'transition-completed',machineId:m.id,from:state.id,to:target.id,verifiedWrites});
}
module.exports={validateMachines,outputs,references,initialRecord,tickMachine,outputEquals};
