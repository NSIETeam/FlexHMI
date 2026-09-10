// Native editable process symbols. Paths are functional HMI diagrams, not raster overlays.
const E = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (v) =>
  v == null
    ? "—"
    : Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const symbols = {
  waste: `<path d="M17 90h48V63h59v68H17Z" fill="#e5edf6"/><path d="M22 79h39v15H22Z" fill="#c7dcf7"/><path d="M23 76 33 62h28v16M77 66h39v40H77Z" fill="#aec7e7"/><circle cx="39" cy="131" r="12"/><circle cx="106" cy="131" r="12"/><path d="M10 147h131" class="s-line"/><path d="m131 106 24 0" class="s-line"/>`,
  pit: `<path d="M16 37v107h170V37" fill="#f1f5fa" class="s-line"/><path d="M19 110 40 99 56 116 72 91 96 107 119 94 145 108 165 97 183 107v34H19Z" fill="#b7c5d6"/><path d="m31 124 11-11m19 12 10-12m40 16 10-10m23 13 11-12" stroke="#8195ad" stroke-width="3"/><path d="M12 29h180M51 29v35M134 29v25M30 22h146" class="s-line"/><rect x="100" y="17" width="39" height="18" rx="5" fill="#d9e7f6"/><g class="crane"><path d="M119 36v39m-14 2 14-9 14 9m-28 0v12l14 7 14-7V77" fill="none" stroke="#6c849f" stroke-width="3"/></g>`,
  furnace: `<path d="M27 28h87l44 31v91H27Z" fill="#f7f9fd" class="s-line"/><path d="M27 90H7V63h29M156 53h27v27h-27" fill="#dce7f3" class="s-line"/><path d="m27 130 28 9h90" stroke="#8093aa" stroke-width="9" fill="none"/><path d="M28 149h116v13H28Z" fill="#cfdae7"/><path d="M45 145v17m25-16v17m27-17v17m25-17v17" class="s-line"/><rect x="60" y="42" width="61" height="42" rx="7" fill="#e9eef6"/><g class="fire"><path d="M67 128C36 109 80 89 75 72c28 27 8 26 25 38 2-8 10-13 8-21 29 29 21 42-5 45Z" fill="#f6b154"/><path d="M79 130c-12-15 10-22 8-38 25 28 21 31 8 40Z" fill="#ffdc8b"/></g>`,
  boiler: `<path d="M22 36h126l24 24v63H22Z" fill="#f2f6fb" class="s-line"/><path d="m22 123 16 28h24l14-28m8 0 16 28h22l13-28m0 0 12 28h18l7-28" fill="#dce7f4" class="s-line"/><rect x="39" y="52" width="91" height="58" rx="5" fill="#fff8e9"/><path d="M48 61v41h14V61h14v41h14V61h14v41h14V61" stroke="#dd9e48" stroke-width="5" fill="none"/><path d="M89 35V9h36M17 77H3m169 0h24" class="s-line"/>`,
  reactor: `<ellipse cx="100" cy="31" rx="44" ry="12" fill="#e1ebf7" class="s-line"/><path d="M56 31v96l44 31 44-31V31" fill="#f4f8fd" class="s-line"/><path d="M100 6v39M77 58l23-13 23 13" stroke="#41a5c7" stroke-width="4" fill="none"/><path d="M69 67v49l31 24 31-24V67" fill="#e0f3fa"/><g class="spray" fill="#55b7d2"><circle cx="84" cy="77" r="3"/><circle cx="99" cy="91" r="3"/><circle cx="116" cy="76" r="3"/><circle cx="86" cy="106" r="3"/><circle cx="116" cy="112" r="3"/></g><path d="M56 93H24m120 0h35M100 158v13" class="s-line"/>`,
  filter: `<rect x="31" y="32" width="137" height="100" rx="8" fill="#f4f8fd" class="s-line"/><path d="m31 132 22 28h27l20-28 21 28h25l22-28" fill="#dce8f4" class="s-line"/><path d="M31 92H7m161 0h26M33 24h133" class="s-line"/><g stroke="#89b89c" stroke-width="9" stroke-linecap="round"><path d="M54 53v62M78 53v62M102 53v62M126 53v62M149 53v62"/></g><path d="M45 44h112" stroke="#5f8d72" stroke-width="4"/><g class="spray" fill="#abcdb8"><circle cx="61" cy="120" r="2"/><circle cx="114" cy="126" r="3"/></g>`,
  fan: `<path d="M98 30h67v39h-40" fill="#e1eaf7" class="s-line"/><circle cx="94" cy="89" r="52" fill="#f4f8fd" class="s-line"/><g class="rotor" transform-origin="94px 89px"><path d="M94 81C42 35 40 115 84 94 51 152 130 158 101 101c59 13 53-63 1-21Z" fill="#82a9d7"/></g><circle cx="94" cy="89" r="12" fill="#e6eef9" class="s-line"/><path d="M59 140v15m68-15v15M43 157h100" class="s-line"/>`,
  turbine: `<path d="M18 63 59 38h77l35 26v54l-35 19H59l-41-19Z" fill="#eaf1fa" class="s-line"/><path d="M53 43v91M136 43v91" class="s-line"/><path d="M171 85h24v19h-24M5 69h13M5 107h13" class="s-line"/><g stroke="#85a8d3" stroke-width="6"><path d="M66 54v67M81 54v67M96 54v67M111 54v67M124 54v67"/></g><path d="m96 58-20 31h24l-17 32 40-46H98Z" fill="#fff" stroke="none"/><path d="M38 147h131" class="s-line"/>`,
  stack: `<path d="m68 29-10 130h63L108 29Z" fill="#dce7f4" class="s-line"/><path d="M69 46h40M66 72h46M63 99h51M60 130h56" stroke="#f8fbff" stroke-width="9"/><path d="M51 162h79M57 127H24" class="s-line"/><g class="plume" fill="#dfe8f4"><circle cx="84" cy="15" r="10"/><circle cx="101" cy="2" r="12"/><circle cx="91" cy="-12" r="11"/></g>`,
  dosing: `<ellipse cx="93" cy="41" rx="49" ry="12" fill="#e6f3f8" class="s-line"/><path d="M44 42v75l49 30 49-30V42" fill="#eef8fa" class="s-line"/><path d="M69 146v19m48-19v19M93 149v25" class="s-line"/><path d="M58 66h70v44l-35 22-35-22Z" fill="currentColor" opacity=".22"/><path d="M92 72v39m-13-9 13 13 13-13" stroke="currentColor" stroke-width="4" fill="none"/>`,
  ash: `<path d="M24 84h99l42 29-35 29H33Z" fill="#e7edf5" class="s-line"/><path d="m45 70 22-21 24 17 23-13 15 29H42Z" fill="#adbccf"/><path d="M34 131h93l23-18" stroke="#8498b2" stroke-width="5" fill="none"/><circle cx="46" cy="143" r="8"/><circle cx="120" cy="143" r="8"/>`,
  preheater: `<rect x="24" y="42" width="151" height="89" rx="15" fill="#f3f7fc" class="s-line"/><path d="M48 60v52h20V60h20v52h20V60h20v52h20V60" stroke="#94b2d6" stroke-width="4" fill="none"/><path d="M24 80H2m173 0h24" class="s-line"/>`,
};
export function equipmentContent(c, v, read) {
  const active = v != null && Number(v) > 0;
  const color = /^#[a-f0-9]{6}$/i.test(c.color) ? c.color : "#3b82c4";
  const data = c.valueTag ? read(c.valueTag) : null;
  const status = v == null ? "数据未连接" : active ? "运行" : "待机";
  return `<div class="process-equipment ${c.compact ? "eq-compact" : ""} ${active ? "is-active" : ""}" style="color:${color}"><div class="eq-id">${E(c.code || "")}<i class="${active ? "on" : ""}"></i></div><svg viewBox="0 0 200 180" class="equipment-svg" aria-label="${E(c.label)}">${symbols[c.symbol] || symbols.fan}</svg><div class="eq-label">${E(c.label)}</div><div class="eq-sub">${c.valueTag ? number(data) + " " + E(c.valueUnit || "") : E(c.subtitle || status)}</div></div>`;
}
export function flowContent(c, v) {
  const on = v != null && Number(v) > 0;
  const color = /^#[a-f0-9]{6}$/i.test(c.color) ? c.color : "#548ac7";
  const path = /^[MmLlHhVvCcSsQqTtAaZz0-9,.\s-]+$/.test(c.path || "")
    ? c.path
    : "";
  return `<svg class="flow-svg ${on ? "flow-active" : ""}" viewBox="0 0 ${c.w} ${c.h}" preserveAspectRatio="none"><defs><marker id="arrow-${c.id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 8 4 0 8Z" fill="${on ? color : "#b4c3d2"}"/></marker></defs><path d="${path}" stroke="${color}1b" stroke-width="${c.thickness || 14}" fill="none" stroke-linejoin="round"/><path d="${path}" stroke="${on ? color : "#bec9d6"}" stroke-width="${c.lineWidth || 4}" fill="none" stroke-linejoin="round" marker-end="url(#arrow-${c.id})"/><path class="flow-particles" d="${path}" stroke="white" stroke-width="${c.lineWidth || 4}" stroke-dasharray="3 18" fill="none" stroke-linejoin="round"/></svg>`;
}
export function processStatus(read) {
  const run = read("plant_run"),
    alarm = read("temp_alarm"),
    load = read("load_pct");
  const title =
    run == null
      ? "正在连接 Runtime"
      : Number(alarm)
        ? "炉温高报警 · 请检查模拟工况"
        : Number(run)
          ? Number(load) < 95
            ? "启动中 · 流程依次投入"
            : "系统运行 · 工艺参数实时更新"
          : Number(load) > 1
            ? "停机中 · 负荷与参数逐步回落"
            : "系统待机 · 点击“启动流程”开始演示";
  return `<div class="process-status ${Number(alarm) ? "warning" : ""}"><span class="status-pulse ${Number(run) ? "running" : ""}"></span><strong>${title}</strong><span>${Number(alarm) ? "演示报警上限 950 °C" : "设备状态、参数和动画均绑定实时变量"}</span><b>SIMULATION</b></div>`;
}
