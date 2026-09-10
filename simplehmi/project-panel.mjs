const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses={preview:'待应用',applying:'应用中',applied:'已应用',interrupted:'中断待检查',failed:'失败',cancelled:'已取消',unreadable:'记录损坏，需检查'};
export function connectProjectPanel({d,api,plan,renderPlan,onError}){
 const area=d.querySelector('#agent-projects');
 d.querySelector('#agent-manage').onclick=async()=>{
  area.hidden=false;area.textContent='正在读取工程和操作记录…';
  try{
   const [inventory,history]=await Promise.all([api('/agent/projects'),api('/agent/plans')]);
   const projects=inventory.projects.filter(p=>!p.unavailable),archives=inventory.archives.filter(p=>!p.unavailable);
   area.innerHTML=`<div class="agent-connection-card"><h3>工程与操作记录</h3><p>加载会切换运行工程并暂停自动控制。删除的工程保留在归档区，可随时恢复。其他窗口未保存的内容不会带入。</p><label>已保存工程<select id="agent-saved-project"><option value="">选择工程</option>${projects.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}${p.active?'（当前）':''}</option>`).join('')}</select></label><div class="agent-actions"><button id="agent-load-project">预览加载</button><button id="agent-delete-project">预览删除</button></div><label>可恢复工程<select id="agent-archived-project"><option value="">选择归档</option>${archives.map(p=>`<option value="${escape(p.archiveId)}">${escape(p.name)} · ${escape(new Date(p.updatedAt).toLocaleString())}</option>`).join('')}</select></label><button id="agent-restore-project">预览恢复</button><h4>最近操作</h4><p>中断记录会核对保存结果；未确认完成的操作不会自动重放。</p><div class="agent-plan-history">${history.slice(0,20).map(p=>`<button data-plan-id="${escape(p.id)}"><span>${escape(p.summary)}</span><small>${escape(statuses[p.status]||p.status)} · ${escape(new Date(p.createdAt).toLocaleString())}</small></button>`).join('')||'<p>尚无操作记录。</p>'}</div>${[...inventory.projects,...inventory.archives].filter(p=>p.unavailable).map(p=>`<p class="agent-error">${escape(p.id)} 无法读取：${escape(p.error)}</p>`).join('')}</div>`;
   const chosen=()=>{const id=area.querySelector('#agent-saved-project').value,p=projects.find(p=>p.id===id);if(!p)throw Error('请先选择保存工程');return p;};
   const preview=async(action)=>{try{const p=chosen();if(action==='delete'&&p.active)throw Error('当前工程不能删除，请先加载其他工程');await plan({summary:`${action==='load'?'加载':'归档删除'}工程：${p.name}`,operations:[{op:'project.'+action,id:p.id,expectedSavedRevision:p.revision}]});}catch(e){onError(e)}};
   area.querySelector('#agent-load-project').onclick=()=>preview('load');area.querySelector('#agent-delete-project').onclick=()=>preview('delete');
   area.querySelector('#agent-restore-project').onclick=async()=>{try{const p=archives.find(p=>p.archiveId===area.querySelector('#agent-archived-project').value);if(!p)throw Error('请先选择归档工程');await plan({summary:'恢复工程：'+p.name,operations:[{op:'project.restore',archiveId:p.archiveId,expectedSavedRevision:p.revision}]});}catch(e){onError(e)}};
   for(const button of area.querySelectorAll('[data-plan-id]'))button.onclick=async()=>{try{renderPlan(await api('/agent/plans/'+button.dataset.planId));}catch(e){onError(e)}};
   area.scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){area.textContent=e.message}
 };
}
