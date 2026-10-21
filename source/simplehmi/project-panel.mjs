const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sources={editor:'编辑保存',agent:'AI / Agent 计划',load:'打开工程'};
const statuses={preview:'待应用',applying:'应用中',applied:'已应用',interrupted:'中断待检查',failed:'失败',cancelled:'已取消',unreadable:'记录损坏，需检查'};
export function connectProjectPanel({d,api,plan,renderPlan,onError}){
 const area=d.querySelector('#agent-projects');
 d.querySelector('#agent-manage').onclick=async()=>{
  area.hidden=false;area.textContent='正在读取工程和操作记录…';
  try{
   const inventory=await api('/agent/projects');let history=[],cursor=null;const activeId=inventory.projects.find(p=>p.active)?.id;
   const projects=inventory.projects.filter(p=>!p.unavailable),archives=inventory.archives.filter(p=>!p.unavailable);
   area.innerHTML=`<div class="agent-connection-card"><h3>工程与操作记录</h3><p>加载会切换运行工程并暂停自动控制。删除的工程保留在归档区，可随时恢复。其他窗口未保存的内容不会带入。</p><label>已保存工程<select id="agent-saved-project"><option value="">选择工程</option>${projects.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}${p.active?'（当前）':''}</option>`).join('')}</select></label><div class="agent-actions"><button id="agent-load-project">预览加载</button><button id="agent-delete-project">预览删除</button></div><label>可恢复工程<select id="agent-archived-project"><option value="">选择归档</option>${archives.map(p=>`<option value="${escape(p.archiveId)}">${escape(p.name)} · ${escape(new Date(p.updatedAt).toLocaleString())}</option>`).join('')}</select></label><button id="agent-restore-project">预览恢复</button><h4>修改记录</h4><p>编辑保存和 AI 计划都可查看差异。恢复修改前版本会覆盖之后的工程修改，先预览差异；恢复后自动控制暂停，设备输出不会回到历史值。中断记录需核对，不会自动重放。</p><div class="agent-history-filters"><label>记录范围<select id="history-project"><option value="${escape(activeId||'')}">当前工程</option><option value="">全部工程</option></select></label><label>修改来源<select id="history-source"><option value="">全部来源</option><option value="editor">编辑保存</option><option value="agent">AI / Agent 计划</option><option value="load">打开工程</option></select></label></div><div class="agent-plan-history"></div><button id="history-more" hidden>加载更早记录</button>${[...inventory.projects,...inventory.archives].filter(p=>p.unavailable).map(p=>`<p class="agent-error">${escape(p.id)} 无法读取：${escape(p.error)}</p>`).join('')}</div>`;
   const chosen=()=>{const id=area.querySelector('#agent-saved-project').value,p=projects.find(p=>p.id===id);if(!p)throw Error('请先选择保存工程');return p;};
   const preview=async(action)=>{try{const p=chosen();if(action==='delete'&&p.active)throw Error('当前工程不能删除，请先加载其他工程');await plan({summary:`${action==='load'?'加载':'归档删除'}工程：${p.name}`,operations:[{op:'project.'+action,id:p.id,expectedSavedRevision:p.revision}]});}catch(e){onError(e)}};
   area.querySelector('#agent-load-project').onclick=()=>preview('load');area.querySelector('#agent-delete-project').onclick=()=>preview('delete');
   area.querySelector('#agent-restore-project').onclick=async()=>{try{const p=archives.find(p=>p.archiveId===area.querySelector('#agent-archived-project').value);if(!p)throw Error('请先选择归档工程');await plan({summary:'恢复工程：'+p.name,operations:[{op:'project.restore',archiveId:p.archiveId,expectedSavedRevision:p.revision}]});}catch(e){onError(e)}};
   let epoch=0;
   async function loadHistory(reset=false){
    const token=++epoch,more=area.querySelector('#history-more');more.disabled=true;
    if(reset){history=[];cursor=null;area.querySelector('.agent-plan-history').textContent='正在读取修改记录…';}
    const query=new URLSearchParams({limit:'20'}),projectId=area.querySelector('#history-project').value,source=area.querySelector('#history-source').value;if(projectId)query.set('projectId',projectId);if(source)query.set('source',source);if(cursor)query.set('cursor',cursor);
    try{const rows=await api('/agent/plans?'+query);if(token!==epoch)return;history.push(...rows);cursor=rows.at(-1)?.id||cursor;
     area.querySelector('.agent-plan-history').innerHTML=history.map(p=>`<div class="agent-history-row"><button data-plan-id="${escape(p.id)}"><span>${escape(p.summary)}</span><small>${escape(sources[p.source]||'记录')} · ${escape(statuses[p.status]||p.status)} · ${p.createdAt?escape(new Date(p.createdAt).toLocaleString()):'时间不可用'}</small></button>${p.canRevert?`<button class="agent-revert" data-revert-plan="${escape(p.id)}" aria-label="预览恢复：${escape(p.summary)}">恢复修改前版本</button>`:''}</div>`).join('')||'<p>该筛选下尚无修改记录。</p>';
     more.hidden=rows.length<20;
     for(const button of area.querySelectorAll('[data-plan-id]'))button.onclick=async()=>{try{renderPlan(await api('/agent/plans/'+button.dataset.planId));}catch(e){onError(e)}};
     for(const button of area.querySelectorAll('[data-revert-plan]'))button.onclick=()=>plan({summary:'恢复修改前版本：'+history.find(p=>p.id===button.dataset.revertPlan).summary,operations:[{op:'project.revert',planId:button.dataset.revertPlan}]});
    }catch(e){if(token===epoch)onError(e)}finally{if(token===epoch)more.disabled=false}
   }
   area.querySelector('#history-source').onchange=()=>loadHistory(true);area.querySelector('#history-project').onchange=()=>loadHistory(true);area.querySelector('#history-more').onclick=()=>loadHistory();await loadHistory(true);
   area.scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){area.textContent=e.message}
 };
}
