import {routePage} from './topology.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function connectionDraft(page,input){
 const next=clone(page),nodes=new Set(next.components.filter(c=>c.kind!=='flow').map(c=>c.id));
 if(!nodes.has(input.from)||!nodes.has(input.to)||input.from===input.to)throw Error('请选择两个不同的起点和终点组件');
 if(!/^[a-zA-Z0-9_-]{1,90}$/.test(input.id)||['__proto__','constructor','prototype'].includes(input.id))throw Error('连接 ID 无效');
 const edges=next.connections||=[],existing=edges.find(e=>e.id===input.id);if(!existing&&edges.length>=300)throw Error('每页最多 300 条连接');
 const edge={...existing,id:input.id,from:input.from,to:input.to,label:String(input.label||'').trim().slice(0,80),routeMode:input.routeMode||'auto'};
 if(!['auto','return'].includes(edge.routeMode))throw Error('布线方式无效');
 for(const key of ['fromPort','toPort']){if(input[key]){if(!['left','right','top','bottom'].includes(input[key]))throw Error('端口方向无效');edge[key]=input[key]}else delete edge[key]}
 if(input.tagId)edge.tagId=input.tagId;else delete edge.tagId;
 if(edge.from!==existing?.from||edge.to!==existing?.to||edge.routeMode==='auto')delete edge.layoutRole;
 next.connections=existing?edges.map(e=>e.id===edge.id?edge:e):edges.concat(edge);return routePage(next);
}
export function openConnectionEditor({page,tags,selectedIds=[],edgeId,uid,dialog,apply,toast}){
 const original=clone(page),nodes=original.components.filter(c=>c.kind!=='flow');
 if(nodes.length<2){toast('先添加两个设备或组件，再连接它们');return}
 let currentId=edgeId||'',candidate=null;
 const d=dialog('连接与流向',`<p>选择起点和终点，箭头始终指向终点。先预览通道与影响，再保存；设备移动时管线会重新计算。管线用于画面表达，不会自动改变设备控制或仿真过程。</p><div class="connection-editor"><label>已有管线<select id="connection-existing"><option value="">＋ 新增管线</option>${(original.connections||[]).map(e=>`<option value="${esc(e.id)}">${esc(e.label||e.id)}${e.routeStatus==='blocked'?' · 需要调整':''}</option>`).join('')}</select></label><div id="connection-fields"></div><div id="connection-preview" aria-live="polite"></div></div><div class="dialog-actions"><button id="connection-delete" class="secondary">删除这条管线</button><button id="connection-save" class="primary" disabled>保存连接</button></div>`);
 d.classList.add('connection-dialog');d.addEventListener('close',()=>d.classList.remove('connection-dialog'),{once:true});
 const select=(label,id,items,value)=>`<label>${label}<select id="${id}" aria-label="${esc(label)}">${items.map(([v,n])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(n)}</option>`).join('')}</select></label>`;
 function form(){const edge=original.connections?.find(e=>e.id===currentId)||{id:uid(),from:selectedIds[0]||nodes[0].id,to:selectedIds[1]||nodes.find(n=>n.id!==(selectedIds[0]||nodes[0].id)).id},nodeOptions=nodes.map(n=>[n.id,n.label||n.id]),sides=[['','自动选择'],['left','左侧'],['right','右侧'],['top','顶部'],['bottom','底部']];
  d.querySelector('#connection-fields').innerHTML=`<label>管线名称<input id="connection-name" maxlength="80" value="${esc(edge.label||'')}" placeholder="例如：供水管线"></label><div class="connection-fields-grid">${select('从（起点）','connection-from',nodeOptions,edge.from)}${select('到（终点）','connection-to',nodeOptions,edge.to)}${select('起点端口','connection-from-port',sides,edge.fromPort||'')}${select('终点端口','connection-to-port',sides,edge.toPort||'')}</div>${select('布线方式','connection-mode',[['auto','自动 · 优先直接连接'],['return','回流 · 使用外侧通道']],edge.routeMode|| (edge.layoutRole==='return'?'return':'auto'))}${select('流动状态变量（Bool，可选）','connection-tag',[['','不关联变量'],...tags.filter(t=>t.type==='Bool'||t.id===edge.tagId).map(t=>[t.id,(t.device?t.device+' / ':'')+t.name+(t.type==='Bool'?'':'（保留旧绑定）')])],edge.tagId||'')}<button id="connection-reverse" class="secondary">交换起点和终点</button>`;
  d.querySelector('#connection-delete').disabled=!currentId;
  function update(){const value=id=>d.querySelector(id).value,result=d.querySelector('#connection-preview'),button=d.querySelector('#connection-save');button.disabled=true;candidate=null;
   try{const proposal=connectionDraft(original,{id:edge.id,label:value('#connection-name'),from:value('#connection-from'),to:value('#connection-to'),fromPort:value('#connection-from-port'),toPort:value('#connection-to-port'),routeMode:value('#connection-mode'),tagId:value('#connection-tag')});candidate=proposal.page;const line=candidate.connections.find(e=>e.id===edge.id),issues=proposal.diagnostics.filter(v=>v.connectionId===edge.id||v.connections?.includes(edge.id));const focus=nodes.filter(n=>n.id===line.from||n.id===line.to),pts=line.points||[],left=Math.max(0,Math.min(...focus.map(n=>n.x),...pts.map(p=>p.x))-32),top=Math.max(0,Math.min(...focus.map(n=>n.y),...pts.map(p=>p.y))-32),width=Math.max(240,Math.max(...focus.map(n=>n.x+n.w),...pts.map(p=>p.x))-left+32),height=Math.max(180,Math.max(...focus.map(n=>n.y+n.h),...pts.map(p=>p.y))-top+32);
    result.innerHTML=`<p class="connection-status">${esc(line.routeStatus==='ok'?`${line.routeInfo.bends} 个折角 · ${line.routeInfo.reason}`:line.routeError)}</p><svg class="connection-map" viewBox="${left} ${top} ${width} ${height}" role="img" aria-label="连接预览"><defs><marker id="connection-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L8 4L0 8Z" fill="#252b30"/></marker></defs>${nodes.map(n=>`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" fill="#f4f5f6" stroke="#aeb5ba"/><text x="${n.x+n.w/2}" y="${n.y+n.h-12}" text-anchor="middle" font-size="16" fill="#343c43">${esc(n.label||n.id)}</text>`).join('')}${candidate.connections.filter(e=>e.routeStatus==='ok').map(e=>`<polyline points="${e.points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${e.id===edge.id?'#252b30':'#c4c8cb'}" stroke-width="${e.id===edge.id?4:2}" marker-end="url(#connection-preview-arrow)"/>`).join('')}</svg><p>保存后更新这条管线；两个设备、点位和控制规则保持原状。可用撤销恢复。</p>${issues.map(v=>`<p class="${v.code==='route-blocked'?'agent-error':'hint'}">${esc(v.message)}</p>`).join('')}`;
    button.disabled=line.routeStatus!=='ok';
   }catch(e){result.textContent=e.message}
  }
  for(const input of d.querySelectorAll('#connection-fields input,#connection-fields select'))input.oninput=update;
  d.querySelector('#connection-reverse').onclick=()=>{for(const [a,b] of [['#connection-from','#connection-to'],['#connection-from-port','#connection-to-port']]){const x=d.querySelector(a),y=d.querySelector(b),v=x.value;x.value=y.value;y.value=v}update()};update();
 }
 const choices=d.querySelector('#connection-existing');choices.value=currentId;choices.onchange=()=>{currentId=choices.value;form()};form();
 d.querySelector('#connection-save').onclick=()=>{if(!candidate)return;apply(candidate);d.close();toast('连接已更新，移动设备时会自动重新布线')};
 d.querySelector('#connection-delete').onclick=()=>{if(!currentId)return;const p=clone(original);p.connections=p.connections.filter(e=>e.id!==currentId);apply(routePage(p).page);d.close();toast('仅删除管线，设备与点位保留；可撤销')};
}
