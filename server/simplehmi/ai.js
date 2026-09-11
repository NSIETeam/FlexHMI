'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {planSchema, systemPrompt} = require('./ai-contract');
const {evaluationContext,verifyAssessment,assertAssessmentFresh,prepareAssessmentOperations,assessmentPrompt}=require('./knowledge');

function normalizeConfig(input) {
  if (!['openai-compatible', 'ollama'].includes(input.provider)) throw Error('请选择模型服务类型');
  let url;
  try { url = new URL(input.baseUrl); } catch { throw Error('模型服务地址无效'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !local)) throw Error('远程模型服务必须使用 HTTPS；地址不能包含密码、查询参数或片段');
  if (input.provider === 'ollama' && !local) throw Error('Ollama 入口仅用于本机服务');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 160) throw Error('请填写模型名称');
  return {provider: input.provider, baseUrl: url.href.replace(/\/+$/, ''), model: input.model.trim(), jsonMode: input.jsonMode !== false};
}

function parsePlan(text, allowEmpty = false) {
  if (typeof text !== 'string' || text.length > 1500000) throw Error('模型输出为空或超过限制');
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data;
  try { data = JSON.parse(clean); } catch { throw Error('模型未返回完整 JSON 操作计划'); }
  if (!data || !Array.isArray(data.operations) || (!allowEmpty && !data.operations.length) || data.operations.length > 500) throw Error('模型计划需要 1–500 个操作');
  if (typeof data.summary !== 'string' || !data.summary.trim()) throw Error('模型计划缺少修改说明');
  // Identity, revision, URLs and execution privileges never come from model output.
  return {summary: data.summary.slice(0, 500), operations: data.operations,...(allowEmpty?{assessment:data.assessment}:{})};
}

async function completion(config, key, messages, signal) {
  const ollama = config.provider === 'ollama';
  const url = config.baseUrl + (ollama ? '/api/chat' : '/chat/completions');
  const body = {model: config.model, messages, stream: false};
  if (ollama) { body.format = 'json'; body.options = {num_predict: 12000}; }
  else { if (config.jsonMode) body.response_format = {type: 'json_object'}; body.store = false; }
  let response;
  try {
    response = await fetch(url, {method: 'POST', redirect: 'error', signal,
      headers: {'Content-Type': 'application/json', ...(key ? {Authorization: 'Bearer ' + key} : {})}, body: JSON.stringify(body)});
  } catch (e) { if (signal.aborted) throw e; throw Error('无法连接模型服务，请检查地址、网络和证书（重定向不被接受）'); }
  if (!response.ok) { await response.body?.cancel(); throw Error(`模型服务返回 HTTP ${response.status}；请检查模型名、凭据或额度`); }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 2000000) { await reader.cancel(); throw Error('模型响应超过 2 MB 限制'); } chunks.push(Buffer.from(value)); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('模型服务返回了无效响应'); }
  if (ollama) {
    if (data.done_reason === 'length') throw Error('模型输出被截断，请减少单次生成范围');
    return data.message?.content;
  }
  if (data.choices?.[0]?.message?.refusal) throw Error('模型拒绝了此请求，请调整需求');
  if (data.choices?.[0]?.finish_reason === 'length') throw Error('模型输出被截断，请减少单次生成范围');
  return data.choices?.[0]?.message?.content;
}

function createAi({dir, getProject, getValues=()=>({}), digest, previewPlan, validatePlan, audit, complete = completion, timeoutMs = 120000}) {
  const folder = path.join(dir, 'ai'); fs.mkdirSync(folder, {recursive: true, mode: 0o700});
  const configFile = path.join(folder, 'config.json');
  let config = null, key = '';
  if (fs.existsSync(configFile)) config = normalizeConfig(JSON.parse(fs.readFileSync(configFile, 'utf8')));
  const jobs = new Map();
  const status = () => ({configured: !!config, ...(config || {}), hasSessionKey: !!key, keyStorage: 'memory-only'});
  function configure(input) {
    const next = normalizeConfig(input);
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey))) throw Error('API 密钥格式无效');
    // Moving a credential to another destination always requires explicit re-entry.
    const changed = !config || next.baseUrl !== config.baseUrl || next.provider !== config.provider;
    const nextKey = input.apiKey !== undefined ? input.apiKey.trim() : changed ? '' : key;
    const temp = configFile + '.tmp'; fs.writeFileSync(temp, JSON.stringify(next, null, 2), {mode: 0o600}); fs.renameSync(temp, configFile);
    config = next; key = nextKey;
    audit({event: 'ai-configured', provider: config.provider});
    return status();
  }
  const view = job => ({id: job.id, status: job.status, stage: job.stage, attempt: job.attempt, createdAt: job.createdAt, ...(job.plan ? {plan: job.plan} : {}), ...(job.report ? {report: job.report} : {}), ...(job.error ? {error: job.error} : {})});
  function get(id) { const job = jobs.get(id); if (!job) throw Error('找不到生成任务；重启后请重新生成'); return view(job); }
  function cancel(id) {
    const job = jobs.get(id); if (!job) throw Error('找不到生成任务');
    if (job.status === 'running') { job.status = 'cancelled'; job.stage = '已取消，未修改工程'; job.controller.abort(); audit({event: 'ai-cancelled', jobId: id}); }
    return view(job);
  }
  function start(input) {
    if (!config) throw Error('请先配置模型服务');
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 12000) throw Error('需求长度应为 1–12000 字');
    if (input.expectedRevision !== digest(getProject())) { const e = Error('工程版本已变化，请重新打开 AI 工作台'); e.status = 409; throw e; }
    if (!['visualization', 'intelligent-control', 'industry-ai'].includes(input.mode)) throw Error('系统模式无效');
    if ([...jobs.values()].some(j => j.status === 'running')) throw Error('已有生成任务，请等待或取消后重试');
    for (const [id, j] of jobs) if (Date.now() - j.createdAt > 1800000) jobs.delete(id);
    if (jobs.size >= 30) jobs.delete(jobs.keys().next().value);
    const snapshot = structuredClone(getProject()), selected = {...config}, secret = key;
    // Exclude binary SVG assets; no process values, history or local credentials are sent.
    const isAssessment=input.task==='assess';
    const evidence=isAssessment?evaluationContext(snapshot,input,getValues()):null;
    const context = structuredClone(snapshot);
    delete context.knowledge;
    for (const asset of context.customSymbols || []) delete asset.svgData;
    for (const pg of context.pages) for (const edge of pg.connections || []) { delete edge.points; delete edge.routeInfo; }
    if (JSON.stringify(context).length > 350000) throw Error('工程上下文过大，请先拆分工程');
    const job = {id: 'gen_' + crypto.randomUUID().replaceAll('-', ''), status: 'running', stage: '模型正在生成工程计划', attempt: 1, createdAt: Date.now(), controller: new AbortController()};
    jobs.set(job.id, job); audit({event: 'ai-started', jobId: job.id, provider: selected.provider});
    const messages = [{role: 'system', content: systemPrompt+(isAssessment?'\n'+assessmentPrompt:'')}, {role: 'user', content: JSON.stringify({request: input.prompt, mode: input.mode, currentProject: context,...(evidence?{evidenceContext:evidence}:{})})}];
    const timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, timeoutMs); timer.unref?.();
    job.done = (async () => {
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          job.attempt = attempt;
          const output = await complete(selected, secret, messages, job.controller.signal);
          if (job.controller.signal.aborted) throw Error('生成已停止');
          try {
            const request = parsePlan(output,isAssessment);
            const assessment=isAssessment?verifyAssessment(request,evidence):null;
            if(assessment)request.operations=prepareAssessmentOperations(request.operations,assessment);
            if(isAssessment&&!request.operations.length){if(digest(snapshot)!==digest(getProject())){const e=Error('工程已变化，请重新评估');e.status=409;throw e;}assertAssessmentFresh(assessment,getProject(),getValues());job.report=assessment;job.status='ready';job.stage='评估完成，未提出工程修改';audit({event:'ai-assessed',jobId:job.id});return;}
            const candidate = await validatePlan(snapshot, request);
            if (candidate.blocked) throw Error(candidate.diagnostics.map(x => x.message).join('；'));
            if (job.controller.signal.aborted) throw Error('生成已停止');
            // This checks the original revision again and only stores a preview.
            job.plan = await previewPlan({...request, expectedRevision: input.expectedRevision, actor: 'model'}, job.controller.signal,assessment);
            if (job.controller.signal.aborted) { job.plan = null; throw Error('生成已停止'); }
            job.status = 'ready'; job.stage = '计划已检查，请预览关联影响'; audit({event: 'ai-ready', jobId: job.id, planId: job.plan.id}); return;
          } catch (e) {
            if (e.status === 409 || job.controller.signal.aborted || attempt === 2) throw e;
            job.stage = '正在修复工程格式或布线问题';
            messages.push({role: 'assistant', content: String(output).slice(0, 1000000)}, {role: 'user', content: JSON.stringify({validationError: e.message, instruction: '修复错误后重新返回完整 JSON 计划，不要声称已执行。'})});
          }
        }
      } catch (e) {
        if (job.status !== 'cancelled') { job.status = 'failed'; job.error = job.timedOut ? '模型生成超时，工程未修改；请减少生成范围后重试' : String(e.message).split(secret || '\u0000').join(secret ? '[已隐藏]' : '\u0000').slice(0, 1000); job.stage = '生成未完成，工程未修改'; audit({event: 'ai-failed', jobId: job.id}); }
      } finally { clearTimeout(timer); }
    })();
    return view(job);
  }
  return {status, configure, start, get, cancel, clearKey: () => { key = ''; return status(); }, wait: id => jobs.get(id)?.done};
}

function mountAi(router, deps) {
  const service = createAi(deps);
  const endpoint = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(e.status || 400).json({error: e.message}); } };
  router.get('/agent/schema', endpoint(() => planSchema));
  router.get('/ai/config', endpoint(() => service.status()));
  router.post('/ai/config', endpoint(req => service.configure(req.body)));
  router.post('/ai/clear-key', endpoint(() => service.clearKey()));
  router.post('/ai/generate', endpoint(req => service.start(req.body)));
  router.get('/ai/jobs/:id', endpoint(req => service.get(req.params.id)));
  router.post('/ai/jobs/:id/cancel', endpoint(req => service.cancel(req.params.id)));
  return service;
}
module.exports = {normalizeConfig, parsePlan, completion, createAi, mountAi};
