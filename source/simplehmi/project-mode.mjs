const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const projectModes = [
  {id:'visualization', name:'数据可视化', description:'显示实时值与趋势，保留手动操作，不运行自动控制。', next:'添加设备和变量，再拖入组件并绑定数据。'},
  {id:'intelligent-control', name:'智能控制', description:'在可视化基础上，配置自动控制规则与步骤流程。', next:'搭建画面后，在控制面板配置、检查并启动规则或步骤流程。'},
  {id:'industry-ai', name:'行业 AI 系统', description:'结合行业资料与实时观测，让 AI 评估并生成可应用的工程与控制计划。', next:'在 AI 工作台添加行业资料、配置模型，再评估并预览修改计划。'},
];
export const projectMode = project => projectModes.find(m => m.id === project.system?.mode) || projectModes[0];
export function modeChoices(mode = 'visualization') {
  return `<fieldset class="project-mode-choices"><legend>系统类型</legend>${projectModes.map(m => `<label class="project-mode-choice"><input type="radio" name="project-mode" value="${m.id}" ${m.id === mode ? 'checked' : ''} required><span><strong>${m.name}</strong><span>${m.description}</span></span></label>`).join('')}</fieldset>`;
}
export function styleModeDialog(d) {
  d.classList.add('project-mode-dialog');
  d.querySelector('.dialog-body').after(d.querySelector('.dialog-actions'));
  d.addEventListener('close', () => d.classList.remove('project-mode-dialog'), {once:true});
}

export async function openProjectMode({api, dialog, save, accept, toast}) {
  try {
    await save();
    let current = await api('/agent/state'), preview = null, busy = false;
    const projectId = current.project.id;
    const d = dialog('系统类型', `<p id="mode-current"></p><form id="mode-form">${modeChoices(projectMode(current.project).id)}</form><div id="mode-result" role="status" aria-live="polite"></div><div class="dialog-actions"><button id="mode-preview" type="submit" form="mode-form">预览转换</button><button id="mode-apply" type="button" class="primary" disabled>应用转换</button></div>`);
    styleModeDialog(d);
    const $ = s => d.querySelector(s), form = $('#mode-form');
    const selected = () => form.querySelector('input:checked').value;
    const present = () => d.open && d.contains(form);
    function update() {
      if (!present()) return;
      $('#mode-current').textContent = `${current.project.name} · 当前类型：${projectMode(current.project).name}`;
      $('#mode-preview').disabled = busy || selected() === projectMode(current.project).id;
      $('#mode-apply').disabled = busy || !preview || preview.blocked;
      form.querySelector('fieldset').disabled = busy;
    }
    form.onchange = () => {preview = null; $('#mode-result').textContent = ''; update();};
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy || selected() === projectMode(current.project).id) return;
      busy = true; preview = null; update(); $('#mode-result').textContent = '正在检查类型转换与关联影响…';
      try {
        const fresh = await api('/agent/state');
        if (fresh.project.id !== projectId) throw Error('当前工程已切换，请重新打开系统类型。');
        current = fresh;
        if (projectMode(current.project).id === selected()) {$('#mode-result').textContent = '当前工程已经是该类型，无需转换。'; return;}
        const result = await api('/agent/plans', {expectedRevision:current.revision, actor:'project-mode', summary:`切换为${projectModes.find(m => m.id === selected()).name}`, operations:[{op:'project.configure',mode:selected()}]});
        if (!present()) return;
        preview = result;
        const p = preview.project, rules = p.control?.rules || [], machines = p.control?.machines || [];
        $('#mode-result').innerHTML = `<h3>${projectMode(current.project).name} → ${projectMode(p).name}</h3><p>转换后的工程：${p.pages.length} 张画面 · ${p.devices.length} 台设备 · ${p.devices.reduce((n,d) => n+d.tags.length,0)} 个变量</p><p>保留 ${rules.length} 条控制规则、${machines.length} 个步骤流程和 ${(p.knowledge || []).length} 条行业资料。</p><ul>${preview.impacts.map(i => `<li>${esc(i.message)}</li>`).join('')}${preview.diagnostics.map(i => `<li>${esc(i.message)}</li>`).join('')}</ul>${preview.blocked ? '<p>存在未解决的画面连接问题，请修复后重新预览。</p>' : ''}`;
        $('#mode-result').scrollIntoView({block:'nearest'});
      } catch (e) {if (present()) $('#mode-result').textContent = e.message;}
      finally {busy = false; update();}
    };
    $('#mode-apply').onclick = async () => {
      if (busy || !preview || preview.blocked) return;
      busy = true; update();
      try {
        await api(`/agent/plans/${preview.id}/apply`, {});
        await accept(await api('/project'));
        if (present()) d.close();
        toast('系统类型已更新，自动控制保持暂停');
      } catch (e) {preview = null; if (present()) $('#mode-result').textContent = `${e.message} 请重新预览后再应用。`;}
      finally {busy = false; update();}
    };
    update();
  } catch (e) {toast('无法打开系统类型：' + e.message);}
}
