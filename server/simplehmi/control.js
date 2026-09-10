'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {citationProblems}=require('./knowledge');
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
const compare = (a, op, b) => ({lt: a < b, lte: a <= b, gt: a > b, gte: a >= b, eq: a === b, ne: a !== b})[op];
const finite = Number.isFinite;
function validateControl(project, unique = () => {}) {
  if (project.control === undefined) return;
  const rules = project.control?.rules;
  if (!Array.isArray(rules) || rules.length > 50) throw Error('控制配置需要规则列表，最多 50 条');
  const tags = new Map(project.devices.flatMap(d => d.tags.map(t => [t.id, {...t, protocol:d.protocol}])));
  const targets = new Set();
  for (const rule of rules) {
    if (!rule || !validId(rule.id)) throw Error('控制规则 ID 无效');
    unique(rule.id);
    if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 100 || typeof rule.enabled !== 'boolean') throw Error('规则名称或启用状态无效');
    // A deleted dependency keeps a disabled draft, so the affected rule stays inspectable.
    if (!rule.enabled && rule.invalidReason) continue;
    const input = tags.get(rule.inputTag), output = tags.get(rule.outputTag);
    if (!input || !output) throw Error('规则引用了不存在的输入或输出变量');
    if (!output.writable || ['100000','300000'].includes(String(output.memory))) throw Error('规则输出变量未开放写入');
    if (output.protocol === 'sim' && output.sim !== 'manual') throw Error('控制输出必须绑定手动模拟变量，不能绑定自动波动信号');
    if (!['low','high'].includes(rule.direction) || !finite(rule.onThreshold) || !finite(rule.offThreshold) || (rule.direction === 'low' ? rule.onThreshold >= rule.offThreshold : rule.onThreshold <= rule.offThreshold)) throw Error('启停阈值必须形成有效回差区间');
    if (![rule.onValue,rule.offValue,rule.outputMin,rule.outputMax].every(finite) || rule.outputMin > rule.outputMax || rule.onValue === rule.offValue || [rule.onValue,rule.offValue].some(v => v < rule.outputMin || v > rule.outputMax)) throw Error('规则写值必须在声明的输出范围内');
    for (const v of [rule.onValue,rule.offValue]) {
      const raw = v * output.divisor;
      if (!finite(raw) || (output.type === 'Float32' && Math.abs(raw) > 3.4028234663852886e38) || (output.type === 'Bool' && ![0,1].includes(v)) || (output.type === 'UInt16' && (!Number.isInteger(raw) || raw < 0 || raw > 65535)) || (output.type === 'Int16' && (!Number.isInteger(raw) || raw < -32768 || raw > 32767))) throw Error('控制写值超出点位数据类型范围');
    }
    if (![rule.holdMs,rule.minIntervalMs,rule.maxAgeMs].every(finite) || rule.holdMs < 0 || rule.holdMs > 60000 || rule.minIntervalMs < 1000 || rule.minIntervalMs > 3600000 || rule.maxAgeMs < 500 || rule.maxAgeMs > 60000) throw Error('规则稳定时间、写入间隔或数据时效无效');
    if (!Array.isArray(rule.guards) || rule.guards.length > 16) throw Error('规则允许条件最多 16 项');
    for (const g of rule.guards) if (!tags.has(g.tagId) || !['lt','lte','gt','gte','eq','ne'].includes(g.op) || !finite(g.value)) throw Error('规则允许条件无效');
    if (rule.enabled && targets.has(rule.outputTag)) throw Error('同一输出不能由多条启用规则同时控制');
    if (rule.enabled) targets.add(rule.outputTag);
  }
}
function controlSignature(p) { return JSON.stringify([p?.id,p?.devices,p?.system?.mode,p?.control,p?.simulation,p?.knowledge]); }
function createControl({getProject, readValues, writeValue, dir, now = Date.now}) {
  const folder = path.join(dir,'control'); fs.mkdirSync(folder,{recursive:true});
  const logFile = path.join(folder,'events.jsonl');
  let state = 'manual', reason = '自动控制尚未启动', session = null, generation = 0;
  const records = new Map();
  function audit(event) {
    const record = {at:new Date(now()).toISOString(),projectId:getProject()?.id,...event};
    // Keep a bounded local log; the previous generation remains available for diagnosis.
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2000000) fs.renameSync(logFile,logFile+'.previous');
    fs.appendFileSync(logFile,JSON.stringify(record)+'\n');
  }
  function events() { return fs.existsSync(logFile) ? fs.readFileSync(logFile,'utf8').trim().split('\n').filter(Boolean).slice(-200).map(line=>JSON.parse(line)) : []; }
  function status() { return {state,reason,session:session?{startedAt:session.startedAt,physicalTargets:session.physicalTargets}:null,rules:[...records].map(([id,r])=>({id,...r})),events:events().slice(-20)}; }
  function pause(message = '已切换为人工接管；不会自动改变当前输出') {
    generation++; session = null; state = 'manual'; reason = message;
    if (records.size) audit({event:'manual-takeover',message});
    return status();
  }
  function fault(message, ruleId) { generation++;session=null;state='fault';reason=message;audit({event:'fault',ruleId,message}); }
  function fresh(values,id,maxAge) {
    const v = values[id];
    return v && v.quality === 'good' && v.value !== null && (typeof v.value === 'number' || typeof v.value === 'boolean') && finite(Number(v.value)) && finite(v.ts) && v.ts <= now()+1000 && now()-v.ts <= maxAge;
  }
  function arm({allowPhysical = false, physicalTargets = []} = {}) {
    const p = getProject(); validateControl(p);
    if (!['intelligent-control','industry-ai'].includes(p.system?.mode)) throw Error('请先把工程类型设为智能控制或行业 AI');
    const rules = (p.control?.rules || []).filter(r=>r.enabled);
    if (!rules.length) throw Error('没有可运行的控制规则');
    const values = readValues(); const actualTargets = rules.filter(r=>p.devices.find(d=>d.tags.some(t=>t.id===r.outputTag)).protocol !== 'sim').map(r=>r.outputTag).sort();
    if (actualTargets.length && (allowPhysical !== true || !Array.isArray(physicalTargets) || JSON.stringify([...new Set(physicalTargets)].sort())!==JSON.stringify(actualTargets))) throw Error('需要明确授权本次会话涉及的真实设备输出');
    for (const r of rules) {
      const evidenceErrors=citationProblems(p,r,now());if(evidenceErrors.length)throw Error(evidenceErrors.join('；'));
      if ([r.inputTag,r.outputTag,...r.guards.map(g=>g.tagId)].some(id=>!fresh(values,id,r.maxAgeMs))) throw Error(`规则“${r.name}”数据未就绪或已过期`);
      const out = Number(values[r.outputTag].value);
      if (![r.onValue,r.offValue].includes(out)) throw Error(`规则“${r.name}”当前输出不属于启停值，请先人工调整`);
    }
    generation++; records.clear();
    for (const r of rules) records.set(r.id,{phase:Number(values[r.outputTag].value)===r.onValue?'on':'off',pending:null,pendingSince:0,lastWriteAt:0,lastMessage:'已接管，等待条件',writes:0});
    state='automatic';reason='按规则运行';session={startedAt:now(),signature:controlSignature(p),physicalTargets:actualTargets};
    audit({event:'armed',ruleIds:rules.map(r=>r.id),physicalTargets:actualTargets}); return status();
  }
  function takeover(tagId) { if (state === 'automatic' && getProject().control?.rules.some(r=>r.enabled&&r.outputTag===tagId)) pause('人工写入控制点位，自动控制已暂停'); }
  async function tick() {
    if (state !== 'automatic') return;
    const token=generation,p=getProject();
    if (session.signature !== controlSignature(p)) {pause('控制相关配置已变化，请重新检查并启动');return;}
    for (const rule of p.control.rules.filter(r=>r.enabled)) {
      if (generation!==token || state!=='automatic') return;
      const evidenceErrors=citationProblems(p,rule,now());if(evidenceErrors.length){fault(evidenceErrors.join('；'),rule.id);return;}
      const values=readValues(), record=records.get(rule.id), refs=[rule.inputTag,rule.outputTag,...rule.guards.map(g=>g.tagId)];
      if (refs.some(id=>!fresh(values,id,rule.maxAgeMs))) {fault(`规则“${rule.name}”数据失效，停止自动写入；当前设备输出需人工确认`,rule.id);return;}
      const output=Number(values[rule.outputTag].value),expected=record.phase==='on'?rule.onValue:rule.offValue;
      if (output!==expected) {fault(`规则“${rule.name}”输出被外部修改，已退出自动控制`,rule.id);return;}
      const input=Number(values[rule.inputTag].value),allowed=rule.guards.every(g=>compare(Number(values[g.tagId].value),g.op,g.value));
      let desired=record.phase;
      if(!allowed) desired='off';
      else if(rule.direction==='low'){if(input<=rule.onThreshold)desired='on';else if(input>=rule.offThreshold)desired='off';}
      else {if(input>=rule.onThreshold)desired='on';else if(input<=rule.offThreshold)desired='off';}
      if(desired===record.phase){record.pending=null;record.lastMessage=allowed?'回差区间保持当前输出':'允许条件不满足，保持关闭';continue;}
      if(record.pending!==desired){record.pending=desired;record.pendingSince=now();}
      // A fresh failed permissive removes the hold delay but still obeys output rate limits.
      if((allowed&&now()-record.pendingSince<rule.holdMs)||(record.lastWriteAt&&now()-record.lastWriteAt<rule.minIntervalMs)){record.lastMessage='等待条件稳定或最小写入间隔';continue;}
      const value=desired==='on'?rule.onValue:rule.offValue;
      audit({event:'write-requested',ruleId:rule.id,tagId:rule.outputTag,value,input,allowed});
      record.lastWriteAt=now();
      try {
        const result=await writeValue(rule.outputTag,value);
        if(!result?.verified)throw Error('写入未通过回读验证');
        audit({event:'write-verified',ruleId:rule.id,tagId:rule.outputTag,value:result.value});
        if(generation!==token)return;
        record.phase=desired;record.pending=null;record.writes++;record.lastMessage=allowed?'阈值触发，写入与回读一致':'允许条件不满足，关闭写入已回读';
      } catch(e) {if(generation===token)fault(`规则“${rule.name}”写入失败：${e.message}；当前设备输出需人工确认`,rule.id);return;}
    }
  }
  return {arm,pause,takeover,tick,status,events,summary:()=>({state,reason})};
}
module.exports={validateControl,controlSignature,createControl};
