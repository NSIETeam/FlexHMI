const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function connectAssessmentHistory({d,api,projectId,openEvaluation,onError}){
 const area=d.querySelector('#agent-assessments-panel');let epoch=0;
 d.addEventListener('close',()=>{epoch++},{once:true});
 d.querySelector('#agent-assessments').onclick=async()=>{
  area.hidden=false;
  area.innerHTML=`<section class="agent-connection-card"><h3>评估记录</h3><p>报告和修改建议都会保存。历史观测仅代表评估当时，应用建议前会重新核验条件。</p><form id="assessment-search" class="agent-history-filters"><label>评估范围<select id="assessment-project"><option value="${esc(projectId)}">当前工程</option><option value="">全部工程</option></select></label><label>评估来源<select id="assessment-source"><option value="">全部来源</option><option value="model">内置 AI</option><option value="external">外部 Agent</option></select></label><label>搜索评估<input id="assessment-query" maxlength="500" placeholder="结论、摘要或资料来源"></label><button type="submit">搜索记录</button></form><p id="assessment-list-status" role="status"></p><div class="assessment-history-list"></div><button id="assessment-more" hidden>加载更早评估</button></section>`;
  let records=[],cursor=null;
  async function load(reset=false){
   const token=++epoch,more=area.querySelector('#assessment-more'),status=area.querySelector('#assessment-list-status');more.disabled=true;status.textContent='正在读取评估记录…';
   if(reset){records=[];cursor=null;area.querySelector('.assessment-history-list').replaceChildren();more.hidden=true;}
   const query=new URLSearchParams({limit:'20'});
   for(const [key,id] of [['projectId','assessment-project'],['source','assessment-source'],['q','assessment-query']]){const value=area.querySelector('#'+id).value.trim();if(value)query.set(key,value)}
   if(cursor)query.set('cursor',cursor);
   try{
    const data=await api('/industry/evaluations?'+query);if(token!==epoch)return;
    records.push(...data.records);cursor=data.nextCursor;
    area.querySelector('.assessment-history-list').innerHTML=records.map(r=>`<div class="agent-history-row"><button data-evaluation-id="${esc(r.id)}"><span>${esc(r.summary)}</span><small>${esc(r.projectName)} · ${r.source==='model'?'内置 AI':'外部 Agent'} · ${r.hasPlan?'含修改建议':'仅报告'} · ${esc(new Date(r.createdAt).toLocaleString())}${r.expired?' · 观测已过期':''}</small></button></div>`).join('');
    status.textContent=records.length?`已显示 ${records.length} 条评估`:'该筛选下暂无评估记录。';
    if(data.unreadable.length)status.textContent+=`；${data.unreadable.length} 条记录无法读取，请检查备份。`;
    more.hidden=!cursor;
    for(const button of area.querySelectorAll('[data-evaluation-id]'))button.onclick=async()=>{try{await openEvaluation(button.dataset.evaluationId)}catch(e){onError(e)}};
   }catch(e){if(token===epoch)status.textContent=e.message}finally{if(token===epoch)more.disabled=false}
  }
  area.querySelector('#assessment-search').onsubmit=e=>{e.preventDefault();load(true)};
  for(const id of ['assessment-project','assessment-source'])area.querySelector('#'+id).onchange=()=>load(true);
  area.querySelector('#assessment-more').onclick=()=>load();
  await load(true);area.scrollIntoView({block:'start',behavior:'smooth'});
 };
}
