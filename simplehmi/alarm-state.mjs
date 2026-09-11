// Display-only alarm evaluation. A card never authorizes a control action.
export function alarmState(component, point, sample, now = Date.now()) {
  if (component.threshold == null) return {state:'unconfigured', message:'请设置报警上限'};
  if (!Number.isFinite(component.threshold)) return {state:'unconfigured', message:'报警上限无效，请重新设置'};
  if (!point) return {state:'unbound', message:'请绑定监测变量'};
  if (!sample || sample.quality !== 'good' || !Number.isFinite(sample.ts) || sample.ts <= 0 || now - sample.ts > Math.max((point.polling || 1000) * 3, 3500) || sample.ts > now + 1000) return {state:'waiting', message:'等待有效数据 · 无法判断报警'};
  const raw = sample.value;
  if (raw == null || !['number','boolean','string'].includes(typeof raw) || (typeof raw === 'string' && !raw.trim()) || !Number.isFinite(Number(raw))) return {state:'invalid', message:'数据无效 · 无法判断报警'};
  const value = Number(raw), active = value >= component.threshold;
  return {state:active ? 'active' : 'normal', message:active ? '达到或超过上限' : '未触发上限报警', value};
}
