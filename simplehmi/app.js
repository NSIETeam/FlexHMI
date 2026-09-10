import {openKnowledgePanel} from './knowledge-panel.mjs';
import {openControlPanel} from './control-panel.mjs';
import { openAgentStudio, connectionMarkup } from "./agent-studio.mjs";
import { routePage } from "./topology.mjs";
import { sanitizeSvg } from "./svg-import.mjs";
import { arrange, snapMove, bounds } from "./layout.mjs";
import { equipmentContent, flowContent, processStatus } from "./process.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const copy = (x) => JSON.parse(JSON.stringify(x));
const icons = {
  logo: "M3 19V5h6v9h6V5h6v14",
  folder: "M3 7V5h6l2 2h10v13H3Z",
  device: "M4 4h16v13H4ZM8 21h8M12 17v4M7 8h3M14 8h3M7 12h3",
  screen: "M3 4h18v14H3ZM8 22h8M12 18v4",
  play: "m8 4 12 8-12 8Z",
  stop: "M6 6h12v12H6Z",
  pause: "M8 5v14M16 5v14",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  undo: "M9 5 4 10l5 5M4 10h11a5 5 0 0 1 0 10",
  redo: "m15 5 5 5-5 5M20 10H9a5 5 0 0 0 0 10",
  save: "M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  cursor: "M5 3v17l5-5 4 6 3-2-4-6h7Z",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  copy: "M8 8h13v13H8ZM16 8V3H3v13h5",
  trash: "M3 6h18M9 3h6M6 6l1 15h10l1-15M10 10v7M14 10v7",
  text: "M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3",
  number: "M5 5h5v14M4 19h8M15 6c6-4 8 3 3 6l-3 3v4h7",
  button: "M3 6h18v12H3ZM8 12h8",
  switch:
    "M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6ZM8 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  lamp: "M9 20h6M10 23h4M8 16c-7-7-1-16 5-13 6 2 7 8 3 13Z",
  motor: "M5 7h14v12H5ZM8 3v4M12 3v4M16 3v4M1 10h4M19 10h4M3 22h18",
  pump: "M12 3a8 8 0 1 0 8 8H12ZM12 3h9v8M6 20h12M5 23h14",
  valve: "M3 7v12l18-12v12ZM12 13V3M8 3h8",
  tank: "M5 5c0-4 14-4 14 0v14c0 4-14 4-14 0ZM5 5c0 4 14 4 14 0M5 15h14",
  pipe: "M3 4v13h18M7 4v9h14M1 4h8M21 11v8",
  chart: "M3 3v18h18M6 15l4-5 4 3 6-8",
  history: "M3 3v18h18M6 15l4-5 4 3 6-8M17 2v4h4",
  alarm: "M12 3 2 21h20ZM12 9v5M12 17v1",
  gauge: "M3 19a10 10 0 1 1 18 0M12 14l6-6M6 18h12",
  link: "m9 15 6-6M7 17l-1 1a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M17 7l1-1a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0",
  check: "m5 12 4 4L20 5",
  fullscreen: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  back: "M19 12H4m6-6-6 6 6 6",
  refresh: "M20 10A8 8 0 1 0 19 18M20 3v7h-7",
};
Object.assign(icons, {
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4",
  unlock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0",
  left: "M4 3v18M8 6h12v4H8ZM8 14h8v4H8Z",
  center: "M12 2v20M4 6h16v4H4ZM7 14h10v4H7Z",
  right: "M20 3v18M4 6h12v4H4ZM8 14h8v4H8Z",
  top: "M3 4h18M6 8h4v12H6ZM14 8h4v8h-4Z",
  middle: "M2 12h20M6 4h4v16H6ZM14 7h4v10h-4Z",
  bottom: "M3 20h18M6 4h4v12H6ZM14 8h4v8h-4Z",
  "distribute-x": "M3 3v18M21 3v18M7 7h3v10H7ZM14 7h3v10h-3Z",
  "distribute-y": "M3 3h18M3 21h18M7 7h10v3H7ZM7 14h10v3H7Z",
});
function icon(n) {
  if(n === "logo") return '<img class="brand-image" src="./assets/brand/app-icon-mono.png" alt="FlexHMI">';
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[n] || icons.screen}"/></svg>`;
}
const names = {
  text: "文字",
  number: "数值",
  button: "按钮",
  switch: "开关",
  lamp: "指示灯",
  motor: "电机",
  pump: "水泵",
  valve: "阀门",
  tank: "水箱",
  pipe: "管道",
  chart: "实时曲线",
  history: "历史曲线",
  alarm: "报警",
  gauge: "仪表",
  symbol: "设备图形",
  equipment: "工艺设备",
  flow: "工艺管线",
  "process-status": "流程状态",
};
const groups = [
  ["基础组件", ["text", "number", "button", "switch", "lamp"]],
  ["工业组件", ["motor", "pump", "valve", "tank", "pipe"]],
  ["数据组件", ["chart", "history", "alarm"]],
];
const state = {
  project: null,
  selected: null,
  selection: [],
  snap: true,
  tab: "components",
  prop: "appearance",
  values: {},
  devices: {},
  history: {},
  runtime: new URLSearchParams(location.search).has("runtime"),
  kiosk: new URLSearchParams(location.search).has("kiosk"),
  scale: 1,
  zoom: 1,
  grid: true,
  undo: [],
  redo: [],
  saved: true,
  revision: 0,
  polling: false,
  dragging: false,
};
let catalog = [],
  libraryGroup = "全部",
  libraryQuery = "",
  favorites = (() => {
    try {
      const v = JSON.parse(localStorage.getItem("simplehmi-favorites") || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })();
let saveTimer,
  saveChain = Promise.resolve(),
  toastTimer,
  dirtyVersion = 0;
const page = () =>
  state.project.pages.find((p) => p.id === state.project.activePageId) ||
  state.project.pages[0];
const selectedItems = () =>
  page().components.filter(
    (c) =>
      !c.locked &&
      c.kind !== "flow" &&
      (state.selection.length
        ? state.selection.includes(c.id)
        : c.id === state.selected),
  );
const selectOnly = (id) => {
  state.selected = id;
  state.selection = id ? [id] : [];
};
const selected = () => page().components.find((c) => c.id === state.selected);
const tags = () =>
  state.project.devices.flatMap((d) =>
    d.tags.map((t) => ({ ...t, device: d.name, protocol: d.protocol })),
  );
const tag = (id) => tags().find((t) => t.id === id);
const val = (c) =>
  state.values[c.tagId]?.quality === "good"
    ? state.values[c.tagId].value
    : null;
const processValue = (id) =>
  state.values[id]?.quality === "good" ? state.values[id].value : null;
const unit = (c) => c.unit || tag(c.tagId)?.unit || "";
const fmt = (v) =>
  v == null
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "1"
        : "0"
      : Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
let serverRevision = null;
async function api(url, body) {
  const r = await fetch("./api" + url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(url === "/project" && body && serverRevision ? {"If-Match":serverRevision} : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if(r.ok && r.headers.get("X-Project-Revision")) serverRevision=r.headers.get("X-Project-Revision");
  if (!r.ok) throw Error(data.error || "服务暂不可用");
  return data;
}
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3600);
}
function snapshot() {
  state.undo.push(copy(state.project));
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
}
function changed() {
  let linkedChanges=0;const validTags=new Set(state.project.devices.flatMap(d=>d.tags.map(t=>t.id)));
  for(const pg of state.project.pages){const componentIds=new Set(pg.components.map(c=>c.id));if(pg.connections)pg.connections=pg.connections.filter(e=>{const keep=componentIds.has(e.from)&&componentIds.has(e.to);if(!keep)linkedChanges++;return keep});
    for(const c of [...pg.components,...(pg.connections||[])]){for(const k of ['tagId','valueTag'])if(c[k]&&!validTags.has(c[k])){delete c[k];linkedChanges++}if(Array.isArray(c.details))c.details=c.details.filter(d=>{const keep=!(d.tagId||d.tag)||validTags.has(d.tagId||d.tag);if(!keep)linkedChanges++;return keep})}
  }
  if(linkedChanges)toast(`已同步清理 ${linkedChanges} 项关联管线或变量绑定`);
  state.project.pages=state.project.pages.map(p=>p.connections?.length?routePage(p).page:p);
  state.saved = false;
  dirtyVersion++;
  updateSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => save().catch((e) => toast("保存失败：" + e.message)),
    750,
  );
}
function updateSave() {
  if ($("#undo")) $("#undo").disabled = !state.undo.length;
  if ($("#redo")) $("#redo").disabled = !state.redo.length;
  const e = $("#save-state");
  if (e)
    e.innerHTML = `<span class="dot" style="background:${state.saved ? "#28b58a" : "#eda345"}"></span>${state.saved ? "已保存" : "保存中…"}`;
}
async function save() {
  clearTimeout(saveTimer);
  const snapshot = copy(state.project),
    v = dirtyVersion;
  saveChain = saveChain.catch(() => {}).then(() => api("/project", snapshot));
  await saveChain;
  if (v === dirtyVersion) {
    state.saved = true;
    updateSave();
  }
}
function undo(redo = false) {
  const from = redo ? state.redo : state.undo,
    to = redo ? state.undo : state.redo;
  if (!from.length) return;
  to.push(copy(state.project));
  state.project = from.pop();
  selectOnly(null);
  changed();
  render();
}
function dialog(title, body) {
  const d = $("#dialog");
  d.innerHTML = `<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" data-close aria-label="关闭">${icon("close")}</button></div><div class="dialog-body">${body}</div>`;
  d.querySelector("[data-close]").onclick = () => d.close();
  if (!d.open) d.showModal();
  return d;
}
function field(label, id, value, type = "text", extra = "") {
  return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function options(items, value) {
  return items
    .map(
      ([v, l]) =>
        `<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${l}</option>`,
    )
    .join("");
}
function selectField(label, id, items, value) {
  return `<label class="field"><span>${label}</span><select id="${id}">${options(items, value)}</select></label>`;
}
function render() {
  if (state.runtime) {
    renderRuntime();
    return;
  }
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="brand-mark">${icon("logo")}</span><span class="brand-wordmark">Flex<b>HMI</b></span></div><nav class="nav" aria-label="主导航"><button id="nav-project">项目</button><button id="nav-devices">设备</button><button id="nav-screen" class="active">画面</button></nav><div class="top-name">${esc(state.project.name)}</div><span id="save-state" class="save-status"></span><button class="primary top-run" id="run">${icon("play")}运行</button></header>
 <div class="subbar"><div class="breadcrumb">${icon("folder")}<span>${esc(state.project.name)}</span>${icon("chevron")}<strong>${esc(page().name)}</strong></div><button id="undo" title="撤销 ⌘Z" aria-label="撤销" ${!state.undo.length ? "disabled" : ""}>${icon("undo")}</button><button id="redo" title="重做 ⌘⇧Z" aria-label="重做" ${!state.redo.length ? "disabled" : ""}>${icon("redo")}</button><span class="divider"></span><button id="duplicate" title="复制组件 ⌘D" aria-label="复制组件">${icon("copy")}</button><button id="remove" title="删除组件" aria-label="删除组件">${icon("trash")}</button><span class="divider"></span><button id="arrange-tools" title="对齐与分布">${icon("grid")}<span>对齐</span></button><button id="snap-toggle" aria-pressed="${state.snap}" title="拖动时吸附网格和参考线">${icon("link")}<span>吸附</span></button><button id="control-panel" title="控制规则与人工接管">${icon("switch")}控制</button><button id="ai-studio">${icon("screen")}<span>AI 工作台</span></button><button id="engineer" aria-label="工程师模式" title="工程师模式">${icon("settings")}<span style="font-size:12px">工程师模式</span></button></div>
 <main class="workspace"><aside class="left-panel"><div class="panel-tabs"><button data-tab="components" class="${state.tab === "components" ? "active" : ""}">组件</button><button data-tab="devices" class="${state.tab === "devices" ? "active" : ""}">设备变量</button><button data-tab="layers" class="${state.tab === "layers" ? "active" : ""}">图层</button></div><div id="left-content"></div></aside><section class="center"><div class="stage-area" id="stage"><div class="canvas-wrap" id="canvas-wrap"><div class="canvas" id="canvas" aria-label="HMI 画布"></div></div></div><div class="page-bar" id="pages"></div></section><aside class="right-panel" id="properties"></aside></main>
 <footer class="footer"><span class="dot" id="connection-dot"></span><span id="connection-text">正在连接 Runtime</span><span class="spacer"></span><span id="object-count"></span><span style="margin:0 10px;color:#d7dfeb">|</span><span>${page().width} × ${page().height}</span><button id="zoom-minus" aria-label="缩小">−</button><button id="zoom-fit" style="min-width:47px">适应</button><button id="zoom-plus" aria-label="放大">＋</button></footer>`;
  $("#nav-project").onclick = projectDialog;
  $("#nav-devices").onclick = devicesDialog;
  $("#nav-screen").onclick = () => {
    selectOnly(null);
    renderProperties();
  };
  $("#run").onclick = () => setRuntime(true);
  $("#undo").onclick = () => undo();
  $("#redo").onclick = () => undo(true);
  $("#duplicate").onclick = duplicate;
  $("#remove").onclick = removeSelected;
  $("#engineer").onclick = engineerDialog;
  $("#arrange-tools").onclick = arrangeDialog;
  $("#control-panel").onclick=controlDialog;
  $("#ai-studio").onclick=()=>openAgentStudio({api,dialog,save,openKnowledge:knowledgeDialog,project:state.project,pageId:page().id,toast,accept:async p=>{snapshot();state.project=p;selectOnly(null);state.saved=true;render();}});
  $("#snap-toggle").onclick = () => {
    state.snap = !state.snap;
    $("#snap-toggle").setAttribute("aria-pressed", state.snap);
    toast(
      state.snap
        ? "已开启：8 px 网格与智能参考线"
        : "吸附已关闭；也可按住 Alt 临时关闭",
    );
  };
  $$("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        state.tab = b.dataset.tab;
        render();
      }),
  );
  $("#zoom-minus").onclick = () => {
    state.zoom = Math.max(0.35, state.zoom - 0.1);
    fit();
  };
  $("#zoom-plus").onclick = () => {
    state.zoom = Math.min(2, state.zoom + 0.1);
    fit();
  };
  $("#zoom-fit").onclick = () => {
    state.zoom = 1;
    fit();
  };
  renderLeft();
  renderPages();
  renderCanvas();
  renderProperties();
  updateSave();
  updateStatus();
  requestAnimationFrame(fit);
}
function renderLeft() {
  const target = $("#left-content");
  if (!target) return;
  if (state.tab === "components")
    target.innerHTML = `<div class="panel-content"><button class="primary full" id="open-library">${icon("device")}设备图形库</button><p class="hint library-intro">112 种工艺符号 · 搜索与自定义</p>${groups.map(([title, ks]) => `<div class="section-label">${title}</div><div class="palette">${ks.map((k) => `<button draggable="true" data-component="${k}" aria-label="添加${names[k]}">${icon(k)}${names[k]}</button>`).join("")}</div>`).join("")}</div><div class="side-tip">拖入画布，开始设计。<br>也可以双击组件快速添加。</div>`;
  else if (state.tab === "layers") {
    target.innerHTML = `<div class="layer-list"><p class="hint">Shift 多选 · 锁定对象不会被误拖</p>${[
      ...page().components,
    ]
      .reverse()
      .map(
        (c) =>
          `<div class="layer-row ${state.selection.includes(c.id) ? "active" : ""}"><button data-layer="${c.id}" ${c.kind === "flow" ? "disabled" : ""}>${icon(c.kind)}<span>${esc(c.label || names[c.kind])}</span></button><button data-lock="${c.id}" aria-label="${c.locked ? "解锁" : "锁定"} ${esc(c.label || names[c.kind])}">${icon(c.locked || c.kind === "flow" ? "lock" : "unlock")}</button></div>`,
      )
      .join("")}</div>`;
    $$("[data-layer]").forEach(
      (b) =>
        (b.onclick = (e) => {
          const c = page().components.find((c) => c.id === b.dataset.layer);
          if (c.locked) {
            toast("请先解除图层锁定");
            return;
          }
          toggleSelection(c.id, e.shiftKey);
          renderCanvas();
          renderProperties();
          renderLeft();
        }),
    );
    $$("[data-lock]").forEach(
      (b) =>
        (b.onclick = () => {
          const c = page().components.find((c) => c.id === b.dataset.lock);
          if (c.kind === "flow") {
            toast("工艺管线保持锁定，路径可在工程 JSON 中修改");
            return;
          }
          snapshot();
          c.locked = !c.locked;
          selectOnly(null);
          changed();
          renderCanvas();
          renderProperties();
          renderLeft();
        }),
    );
  } else
    target.innerHTML = `<div class="panel-content"><button id="add-device-side" class="secondary full">${icon("plus")}添加设备</button>${state.project.devices.map((d) => `<div class="device-header"><span class="dot"></span>${esc(d.name)}<span style="margin-left:auto;font-size:10px;color:#9aa9bb">${d.protocol === "sim" ? "模拟" : "TCP"}</span></div>${d.tags.map((t) => `<button draggable="true" class="tag-item" data-tag="${t.id}">${icon("link")}<span>${esc(t.name)}<small>${d.protocol === "sim" ? "模拟变量" : "寄存器 " + t.address}</small></span><b data-value="${t.id}">—</b></button>`).join("")}<button class="full" style="font-size:12px;color:#7491bb;padding:8px" data-manage-tags="${d.id}">${icon("plus")}管理变量</button>`).join("")}</div><div class="side-tip">把变量拖到画布，选择显示方式，即可完成绑定。</div>`;
  $("#open-library")?.addEventListener("click", libraryDialog);
  $$("[data-component]").forEach((b) => {
    b.ondragstart = (e) => {
      e.dataTransfer.setData(
        "application/simplehmi",
        JSON.stringify({ kind: b.dataset.component }),
      );
      e.dataTransfer.effectAllowed = "copy";
    };
    b.ondblclick = () => addComponent(b.dataset.component, 100, 100);
  });
  $$("[data-tag]").forEach((b) => {
    b.ondragstart = (e) => {
      e.dataTransfer.setData(
        "application/simplehmi",
        JSON.stringify({ tagId: b.dataset.tag }),
      );
      e.dataTransfer.effectAllowed = "copy";
    };
    b.ondblclick = () => chooseDisplay(b.dataset.tag, 100, 100);
  });
  $("#add-device-side")?.addEventListener("click", () => deviceDialog());
  $$("[data-manage-tags]").forEach(
    (b) => (b.onclick = () => tagsDialog(b.dataset.manageTags)),
  );
}
function renderPages() {
  const e = $("#pages");
  if (!e) return;
  e.innerHTML =
    state.project.pages
      .map(
        (p, i) =>
          `<button data-page="${p.id}" class="${p.id === page().id ? "active" : ""}"><span class="page-number">${String(i + 1).padStart(2, "0")}</span>${esc(p.name)}</button>`,
      )
      .join("") +
    (!state.runtime
      ? `<button id="add-page" aria-label="新建画面">${icon("plus")}</button>`
      : "");
  $$("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        state.project.activePageId = b.dataset.page;
        selectOnly(null);
        changed();
        render();
      }),
  );
  $("#add-page")?.addEventListener("click", () => {
    snapshot();
    const p = {
      id: uid(),
      name: "画面 " + (state.project.pages.length + 1),
      width: 1024,
      height: 640,
      background: "#ffffff",
      components: [],
    };
    state.project.pages.push(p);
    state.project.activePageId = p.id;
    selectOnly(null);
    changed();
    render();
  });
}
function addComponent(kind, x, y, tagId = "") {
  snapshot();
  const sizes = {
    text: [240, 45],
    number: [190, 112],
    button: [140, 48],
    switch: [165, 56],
    lamp: [180, 105],
    motor: [120, 110],
    pump: [120, 110],
    valve: [108, 100],
    tank: [150, 225],
    pipe: [160, 24],
    chart: [330, 210],
    history: [350, 220],
    alarm: [260, 120],
    gauge: [210, 160],
  };
  const [w, h] = sizes[kind];
  const c = {
    id: uid(),
    kind,
    x: Math.max(0, Math.min(page().width - w, Math.round(x / 8) * 8)),
    y: Math.max(0, Math.min(page().height - h, Math.round(y / 8) * 8)),
    w,
    h,
    label: tagId ? tag(tagId)?.name || names[kind] : names[kind],
    tagId,
    color: "#343c43",
    fontSize: 28,
    unit: "",
    min: 0,
    max: 100,
    threshold: 80,
    action: "toggle",
    writeValue: 1,
  };
  page().components.push(c);
  selectOnly(c.id);
  state.prop = tagId ? "data" : "appearance";
  changed();
  renderCanvas();
  renderProperties();
  updateCount();
}
function chooseDisplay(tagId, x, y) {
  const d = dialog(
    "如何显示这个变量？",
    `<p>${esc(tag(tagId)?.device)} / ${esc(tag(tagId)?.name)}</p><div class="choice-row">${["number", "gauge", "chart"].map((k) => `<button data-choice="${k}">${icon(k)}${names[k]}</button>`).join("")}</div>`,
  );
  d.querySelectorAll("[data-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        d.close();
        addComponent(b.dataset.choice, x, y, tagId);
      }),
  );
}
function fit() {
  const area = $("#stage") || $(".runtime-stage");
  if (!area) return;
  const p = page();
  const pad = state.kiosk ? 0 : state.runtime ? 48 : 60;
  const scale =
    Math.min(
      (area.clientWidth - pad) / p.width,
      (area.clientHeight - pad) / p.height,
    ) * (state.runtime ? 1 : state.zoom);
  state.scale = Math.max(0.1, scale);
  const wrap = $("#canvas-wrap"),
    canvas = $("#canvas");
  if (wrap) {
    wrap.style.width = p.width * state.scale + "px";
    wrap.style.height = p.height * state.scale + "px";
    canvas.style.width = p.width + "px";
    canvas.style.height = p.height + "px";
    canvas.style.transform = `scale(${state.scale})`;
  }
  if ($("#zoom-fit"))
    $("#zoom-fit").textContent = Math.round(state.scale * 100) + "%";
}
function renderCanvas() {
  const canvas = $("#canvas");
  if (!canvas) return;
  canvas.style.backgroundColor = page().background;
  canvas.classList.toggle(
    "process-sheet",
    state.project.simulation === "waste-to-energy",
  );
  canvas.classList.toggle("grid-on", state.grid && !state.runtime);
  canvas.innerHTML = connectionMarkup(page()) +
    (page().components.length
      ? ""
      : `<div class="canvas-empty">${icon("screen")}<strong>你的第一张工控画面</strong><span>从左侧拖入组件，或切换到设备变量直接拖入</span></div>`) +
    page()
      .components.map(
        (c) =>
          `<div class="component ${state.selection.includes(c.id) && !state.runtime ? "selected" : ""} ${state.runtime ? "runtime" : ""}" data-id="${c.id}" data-kind="${c.kind}" data-locked="${!!c.locked}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px" ${state.runtime && ["button", "switch", "equipment"].includes(c.kind) ? 'role="button" tabindex="0" aria-label="' + esc(c.label) + '"' : ""}><div class="component-content">${componentContent(c)}</div>${state.selection.length === 1 && state.selected === c.id && !state.runtime && !c.locked ? `<span class="resize-handle"></span>${c.tagId ? `<span class="tag-badge">${esc(tag(c.tagId)?.name)}</span>` : ""}` : ""}</div>`,
      )
      .join("");
  canvas.ondragover = (e) => {
    if (!state.runtime) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  canvas.ondrop = (e) => {
    e.preventDefault();
    if (state.runtime) return;
    try {
      const payload = JSON.parse(
        e.dataTransfer.getData("application/simplehmi"),
      );
      const r = canvas.getBoundingClientRect(),
        x = (e.clientX - r.left) / state.scale,
        y = (e.clientY - r.top) / state.scale;
      if (payload.assetId) addLibraryComponent(payload.assetId, x, y);
      else if (payload.tagId) chooseDisplay(payload.tagId, x, y);
      else if (names[payload.kind]) addComponent(payload.kind, x, y);
    } catch {
      toast("请从组件库或设备变量拖入");
    }
  };
  canvas.onpointerdown = (e) => {
    if (!state.runtime && e.target === canvas) marqueeStart(e);
  };
  $$(".component").forEach((el) => {
    if (state.runtime) {
      el.onclick = () => performAction(el.dataset.id);
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          performAction(el.dataset.id);
        }
      };
    } else el.onpointerdown = (e) => dragStart(e, el);
  });
  updateCount();
  requestAnimationFrame(fit);
}
function toggleSelection(id, add = false) {
  if (!add) {
    selectOnly(id);
    return;
  }
  const ids = new Set(state.selection);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  state.selection = [...ids];
  state.selected = state.selection.at(-1) || null;
}
function dragStart(e, el) {
  if (e.button !== 0) return;
  const c = page().components.find((c) => c.id === el.dataset.id);
  if (c.locked || c.kind === "flow") return;
  e.preventDefault();
  const resize = e.target.classList.contains("resize-handle");
  if (e.shiftKey && !resize) {
    toggleSelection(c.id, true);
    renderCanvas();
    renderProperties();
    return;
  }
  if (!state.selection.includes(c.id)) selectOnly(c.id);
  renderCanvas();
  renderProperties();
  const originals = selectedItems().map(copy),
    sx = e.clientX,
    sy = e.clientY;
  let moved = false;
  state.dragging = true;
  const move = (ev) => {
    const dx = (ev.clientX - sx) / state.scale,
      dy = (ev.clientY - sy) / state.scale;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !moved) return;
    if (!moved) {
      snapshot();
      moved = true;
    }
    if (resize) {
      const o = originals[0];
      c.w = Math.max(
        32,
        Math.min(page().width - c.x, Math.round((o.w + dx) / 8) * 8),
      );
      c.h = Math.max(
        24,
        Math.min(page().height - c.y, Math.round((o.h + dy) / 8) * 8),
      );
    } else {
      const other = page().components.filter(
        (x) =>
          !state.selection.includes(x.id) &&
          x.kind !== "flow" &&
          x.kind !== "text",
      );
      const r = snapMove(originals, other, dx, dy, page(), {
        enabled: state.snap && !ev.altKey,
        threshold: 6 / state.scale,
      });
      for (const o of originals) {
        const item = page().components.find((x) => x.id === o.id);
        item.x = Math.round(o.x + r.dx);
        item.y = Math.round(o.y + r.dy);
      }
      showGuides(r.guides);
    }
    for (const item of selectedItems()) {
      const t = $(`[data-id="${item.id}"]`);
      Object.assign(t.style, {
        left: item.x + "px",
        top: item.y + "px",
        width: item.w + "px",
        height: item.h + "px",
      });
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    state.dragging = false;
    showGuides([]);
    if (moved) changed();
    renderCanvas();
    renderProperties();
    if (state.tab === "layers") renderLeft();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", up, { once: true });
}
function showGuides(guides) {
  $$(".snap-guide").forEach((e) => e.remove());
  for (const g of guides) {
    const e = document.createElement("div");
    e.className = "snap-guide " + g.axis;
    e.style[g.axis === "x" ? "left" : "top"] = g.position + "px";
    $("#canvas").append(e);
  }
}
function marqueeStart(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const canvas = $("#canvas"),
    r = canvas.getBoundingClientRect(),
    sx = (e.clientX - r.left) / state.scale,
    sy = (e.clientY - r.top) / state.scale,
    base = e.shiftKey ? [...state.selection] : [];
  if (!e.shiftKey) selectOnly(null);
  const box = document.createElement("div");
  box.className = "selection-box";
  canvas.append(box);
  state.dragging = true;
  const move = (ev) => {
    const x = (ev.clientX - r.left) / state.scale,
      y = (ev.clientY - r.top) / state.scale;
    const a = {
      x: Math.min(sx, x),
      y: Math.min(sy, y),
      right: Math.max(sx, x),
      bottom: Math.max(sy, y),
    };
    Object.assign(box.style, {
      left: a.x + "px",
      top: a.y + "px",
      width: a.right - a.x + "px",
      height: a.bottom - a.y + "px",
    });
    state.selection = [
      ...new Set([
        ...base,
        ...page()
          .components.filter(
            (c) =>
              !c.locked &&
              c.kind !== "flow" &&
              c.x >= a.x &&
              c.y >= a.y &&
              c.x + c.w <= a.right &&
              c.y + c.h <= a.bottom,
          )
          .map((c) => c.id),
      ]),
    ];
    state.selected = state.selection.at(-1) || null;
    $$(".component").forEach((el) =>
      el.classList.toggle("selected", state.selection.includes(el.dataset.id)),
    );
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    state.dragging = false;
    box.remove();
    renderCanvas();
    renderProperties();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}
const arrangeModes = [
  ["left", "左对齐"],
  ["center", "水平居中"],
  ["right", "右对齐"],
  ["top", "顶对齐"],
  ["middle", "垂直居中"],
  ["bottom", "底对齐"],
  ["distribute-x", "水平等距"],
  ["distribute-y", "垂直等距"],
];
function arrangeMarkup() {
  return `<div class="arrange-grid">${arrangeModes.map(([v, l]) => `<button class="secondary" data-arrange="${v}" ${v.startsWith("distribute") && selectedItems().length < 3 ? "disabled" : ""}>${icon(v)}${l}</button>`).join("")}</div>`;
}
function bindArrange() {
  $$("[data-arrange]").forEach(
    (b) =>
      (b.onclick = () => {
        const items = selectedItems();
        if (!items.length) return;
        try {
          const next = arrange(items, b.dataset.arrange, page());
          snapshot();
          for (const c of next)
            Object.assign(
              page().components.find((x) => x.id === c.id),
              { x: c.x, y: c.y },
            );
          changed();
          renderCanvas();
          renderProperties();
          toast("已" + b.textContent.trim());
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
function arrangeDialog() {
  const n = selectedItems().length;
  if (!n) {
    toast("先选中组件；Shift 点击或框选可多选");
    return;
  }
  dialog(
    "对齐与分布",
    `<p>已选择 ${n} 个组件。${n === 1 ? "相对于画布对齐。" : "相对于所选组件边界对齐。"} 等距分布需要至少 3 个组件。</p>${arrangeMarkup()}<p class="hint">拖动时自动显示参考线；按住 Alt 临时关闭吸附。</p>`,
  );
  bindArrange();
}
function updateCount() {
  if ($("#object-count"))
    $("#object-count").textContent = page().components.length + " 个组件";
}
function duplicate() {
  const items = selectedItems();
  if (!items.length) return;
  snapshot();
  const b = bounds(items),
    dx = Math.min(24, page().width - b.right),
    dy = Math.min(24, page().height - b.bottom),
    copies = items.map((c) => ({
      ...copy(c),
      id: uid(),
      x: c.x + dx,
      y: c.y + dy,
    }));
  page().components.push(...copies);
  state.selection = copies.map((c) => c.id);
  state.selected = state.selection.at(-1);
  changed();
  renderCanvas();
  renderProperties();
  if (state.tab === "layers") renderLeft();
}
function removeSelected() {
  const ids = new Set(selectedItems().map((c) => c.id));
  if (!ids.size) return;
  snapshot();
  page().components = page().components.filter((c) => !ids.has(c.id));
  selectOnly(null);
  changed();
  renderCanvas();
  renderProperties();
  if (state.tab === "layers") renderLeft();
}
function componentContent(c) {
  if (c.kind === "symbol") return symbolContent(c);
  if (c.kind === "equipment") return equipmentContent(c, val(c), processValue);
  if (c.kind === "flow") return flowContent(c, val(c));
  if (c.kind === "process-status") return processStatus(processValue);
  const v = val(c),
    on = Number(v) > 0,
    color = /^#[a-f0-9]{6}$/i.test(c.color) ? c.color : "#2563eb";
  const label = esc(c.label),
    u = esc(unit(c));
  if (c.kind === "text")
    return `<div class="comp-text" style="font-size:${c.fontSmall ? 16 : c.fontSize || 28}px;color:${c.color === "#2563eb" ? "#283d5a" : color};font-weight:${c.fontWeight || (c.fontSmall ? 400 : 600)};justify-content:${c.textAlign === "center" ? "center" : c.textAlign === "right" ? "flex-end" : "flex-start"};text-align:${c.textAlign || "left"}">${label}</div>`;
  if (c.kind === "number")
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value" style="font-size:${c.fontSize || 34}px">${fmt(v)}<small>${u}</small></div></div>`;
  if (c.kind === "lamp")
    return `<div class="metric"><div class="metric-label">${label}</div><div class="lamp-line ${on ? "" : "off"}"><span class="lamp-light"></span>${v == null ? "未连接" : on ? "运行中" : "已停止"}</div></div>`;
  if (c.kind === "button")
    return `<div class="control-button" style="background:${color}">${c.controlIcon ? icon(c.controlIcon) : ""}${label}</div>`;
  if (c.kind === "switch")
    return `<div class="switch-control"><span>${label}</span><span class="switch-track ${on ? "on" : ""}"><span></span></span></div>`;
  if (c.kind === "pipe")
    return `<svg viewBox="0 0 160 24" preserveAspectRatio="none" style="width:100%;height:100%"><path d="M0 12H160" stroke="#dce5f1" stroke-width="14"/><path d="M0 12H160" stroke="${on ? color : "#bccadb"}" stroke-width="5" stroke-dasharray="9 6"/>${on ? '<path d="M0 12H160" stroke="#fff6" stroke-width="2" stroke-dasharray="9 6"><animate attributeName="stroke-dashoffset" from="15" to="0" dur="1s" repeatCount="indefinite"/></path>' : ""}</svg>`;
  if (c.kind === "tank") {
    const fill =
      v == null
        ? 0
        : Math.max(
            0,
            Math.min(100, ((v - (c.min ?? 0)) / ((c.max ?? 100) - (c.min ?? 0) || 100)) * 100),
          );
    return `<div class="industrial"><svg viewBox="0 0 160 200"><defs><clipPath id="clip-${c.id}"><rect x="27" y="21" width="106" height="148" rx="11"/></clipPath></defs><rect x="27" y="21" width="106" height="148" rx="11" fill="#f9fafb" stroke="#aeb6bd" stroke-width="2"/><g clip-path="url(#clip-${c.id})"><rect x="28" y="${168 - fill * 1.38}" width="104" height="${fill * 1.38}" fill="${color}22"/><path d="M28 ${168 - fill * 1.38}h104" stroke="${color}" stroke-width="2"/></g><ellipse cx="80" cy="21" rx="53" ry="12" fill="#f9fafb" stroke="#aeb6bd" stroke-width="2"/><path d="M37 171v16M123 171v16M28 187h22M111 187h22" stroke="#b4bdc5" stroke-width="3"/><path d="M141 39h7M141 65h7M141 91h7M141 117h7M141 143h7" stroke="#bec5cc"/><text x="80" y="108" text-anchor="middle" fill="#343c43" font-size="22" font-family="sans-serif">${fmt(v)}${u}</text></svg><span class="industrial-label">${label}</span></div>`;
  }
  if (["pump", "motor", "valve"].includes(c.kind)) {
    const stroke = on ? color : "#9ba4ad";
    let shape = "";
    if (c.kind === "pump")
      shape = `<path d="M8 53h19M83 53h21" fill="none" stroke="${stroke}" stroke-width="3"/><circle cx="55" cy="53" r="28" fill="${on ? "#f2f4f5" : "#f4f5f6"}" stroke="${stroke}" stroke-width="2"/><path d="m45 38 25 15-25 15Z" fill="${stroke}"/><path d="M30 85h52M36 79v6M73 79v6" stroke="#b4bec7" stroke-width="3"/>`;
    if (c.kind === "motor")
      shape = `<rect x="23" y="26" width="65" height="52" rx="7" fill="${on ? "#f2f4f5" : "#f4f5f6"}" stroke="${stroke}" stroke-width="2"/><path d="M34 32v40M45 32v40M56 32v40M67 32v40M88 48h14v12H88M23 45H10v16h13M28 86h57" stroke="${stroke}" stroke-width="2"/><rect x="41" y="15" width="27" height="11" rx="2" fill="#e3e7eb" stroke="${stroke}"/>`;
    if (c.kind === "valve")
      shape = `<path d="M20 36v39l71-39v39Z" fill="${on ? "#f2f4f5" : "#f4f5f6"}" stroke="${stroke}" stroke-width="2"/><path d="M55 53V20M36 20h39M13 34v43M98 34v43" stroke="${stroke}" stroke-width="3"/>`;
    return `<div class="industrial"><svg viewBox="0 0 112 94">${shape}</svg><span class="industrial-label">${label}</span></div>`;
  }
  if (c.kind === "chart" || c.kind === "history") {
    const points = (state.history[c.tagId] || []).slice(
        c.kind === "chart" ? -60 : -1800,
      ),
      values = points.map((p) => p.value),
      min = values.length ? Math.min(...values) - 1 : 0,
      max = values.length ? Math.max(...values) + 1 : 100;
    const line = points
      .map(
        (p, i) =>
          `${(i / Math.max(points.length - 1, 1)) * 260},${100 - ((p.value - min) / (max - min)) * 88}`,
      )
      .join(" ");
    return `<div class="chart-card"><div class="chart-head">${label}<small>${fmt(v)} ${u}</small></div><div class="chart-plot"><svg viewBox="0 0 260 110" preserveAspectRatio="none">${line ? `<polygon points="0,110 ${line} 260,110" fill="${color}0d"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>` : '<text x="130" y="60" text-anchor="middle" fill="#9aa8ba" font-size="12">等待采样</text>'}</svg></div><div class="chart-foot"><span>${points.length ? new Date(points[0].time).toLocaleTimeString("zh-CN", { hour12: false }) : "--:--:--"}</span><span>${c.kind === "history" ? "本次运行 · 最多 30 分钟" : "最近 60 秒"}</span></div></div>`;
  }
  if (c.kind === "alarm") {
    const alarm = v != null && Number(v) >= Number(c.threshold);
    return `<div class="alarm-card ${alarm ? "alert" : ""}"><div class="chart-head">${label}<small style="font-size:10px;color:#9cabba">阈值 ${esc(c.threshold)}</small></div><div class="alarm-status">${icon(v == null ? "alarm" : alarm ? "alarm" : "check")}${v == null ? "等待有效数据" : alarm ? "超过上限 · " + fmt(v) + " " + u : "运行正常 · 无报警"}</div><span style="font-size:10px;color:#9aa8b8">${esc(tag(c.tagId)?.name || "请绑定监测变量")}</span></div>`;
  }
  if (c.kind === "gauge") {
    const ratio =
      v == null
        ? 0
        : Math.max(0, Math.min(1, (v - (c.min ?? 0)) / ((c.max ?? 100) - (c.min ?? 0) || 100)));
    return `<div class="industrial"><svg viewBox="0 0 210 140"><path d="M30 110A75 75 0 0 1 180 110" fill="none" stroke="#e7eaed" stroke-width="13" stroke-linecap="round"/><path d="M30 110A75 75 0 0 1 180 110" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${ratio * 236} 236"/><text x="105" y="104" text-anchor="middle" font-size="29" fill="#343c43">${fmt(v)}${u}</text><text x="27" y="135" font-size="11" fill="#959da5">${c.min}</text><text x="167" y="135" font-size="11" fill="#959da5">${c.max}</text></svg><span class="industrial-label">${label}</span></div>`;
  }
  return "";
}
function renderProperties() {
  const el = $("#properties");
  if (!el) return;
  const c = selected();
  if (selectedItems().length > 1) {
    el.innerHTML = `<div class="right-heading">${icon("grid")}已选 ${selectedItems().length} 个组件</div><div class="property-body"><p class="hint">拖动整组移动。Shift 点击增减选择。对齐操作支持撤销。</p>${arrangeMarkup()}<div class="property-separator"></div><button class="secondary full" id="multi-duplicate">${icon("copy")}复制所选组件</button><button class="secondary full danger-text" id="multi-delete" style="margin-top:10px">${icon("trash")}删除所选组件</button></div>`;
    bindArrange();
    $("#multi-duplicate").onclick = duplicate;
    $("#multi-delete").onclick = removeSelected;
    return;
  }
  if (!c) {
    el.innerHTML = `<div class="right-heading">${icon("screen")}画面设置</div><div class="property-body">${field("画面名称", "page-name", page().name)}<div class="field-row">${field("宽度", "page-width", page().width, "number", 'min="320" max="4096"')}${field("高度", "page-height", page().height, "number", 'min="240" max="2160"')}</div>${field("背景色", "page-bg", page().background, "color")}<div class="property-separator"></div><div class="empty-property">${icon("cursor")}选择一个组件<br>在这里修改外观、绑定数据</div><div class="hint"><span class="keyboard">Ctrl / ⌘ Z</span> 撤销操作<br><span class="keyboard">Ctrl / ⌘ D</span> 复制组件<br><span class="keyboard">Delete</span> 删除组件</div></div>`;
    for (const [id, key] of [
      ["page-name", "name"],
      ["page-width", "width"],
      ["page-height", "height"],
      ["page-bg", "background"],
    ])
      $("#" + id).onchange = (e) => {
        if (!e.target.checkValidity()) return;
        snapshot();
        page()[key] =
          e.target.type === "number" ? Number(e.target.value) : e.target.value;
        for (const c of page().components) {
          c.w = Math.min(c.w, page().width);
          c.h = Math.min(c.h, page().height);
          c.x = Math.max(0, Math.min(c.x, page().width - c.w));
          c.y = Math.max(0, Math.min(c.y, page().height - c.h));
        }
        changed();
        render();
      };
    return;
  }
  el.innerHTML = `<div class="right-heading">${icon(c.kind)}${names[c.kind]}</div><div class="panel-tabs">${[
    ["appearance", "外观"],
    ["data", "数据"],
    ["action", "动作"],
  ]
    .map(
      ([v, l]) =>
        `<button data-prop="${v}" class="${state.prop === v ? "active" : ""}">${l}</button>`,
    )
    .join("")}</div><div class="property-body" id="property-body"></div>`;
  $$("[data-prop]").forEach(
    (b) =>
      (b.onclick = () => {
        state.prop = b.dataset.prop;
        renderProperties();
      }),
  );
  const body = $("#property-body");
  if (state.prop === "appearance") {
    body.innerHTML = `${field("名称 / 显示文字", "c-label", c.label)}<div class="section-label">位置与尺寸</div><div class="field-row">${field("X", "c-x", c.x, "number", 'min="0"')}${field("Y", "c-y", c.y, "number", 'min="0"')}${field("宽度", "c-w", c.w, "number", 'min="32"')}${field("高度", "c-h", c.h, "number", 'min="24"')}</div><div class="property-separator"></div>${field("主题颜色", "c-color", c.color, "color")}${["text", "number"].includes(c.kind) ? field("字号", "c-fontSize", c.fontSize || 28, "number", 'min="12" max="120"') : ""}${
      c.kind === "text"
        ? selectField(
            "文字对齐",
            "c-textAlign",
            [
              ["left", "左对齐"],
              ["center", "居中"],
              ["right", "右对齐"],
            ],
            c.textAlign || "left",
          )
        : ""
    }${["gauge", "tank"].includes(c.kind) ? `<div class="field-row">${field("最小值", "c-min", c.min, "number")}${field("最大值", "c-max", c.max, "number")}</div>` : ""}${c.kind === "alarm" ? field("报警上限", "c-threshold", c.threshold, "number") : ""}`;
    $$("#property-body input,#property-body select").forEach(i=>{
      let recorded=false;
      const commit=()=>{
        if(!i.checkValidity()||i.value==='')return;
        const key=i.id.slice(2),value=i.type==='number'?Number(i.value):i.value;
        if(c[key]===value)return;
        if(!recorded){snapshot();recorded=true;}
        c[key]=value;c.w=Math.min(c.w,page().width);c.h=Math.min(c.h,page().height);
        c.x=Math.max(0,Math.min(c.x,page().width-c.w));c.y=Math.max(0,Math.min(c.y,page().height-c.h));
        changed();renderCanvas();
      };
      i.oninput=commit;i.onchange=commit;i.onblur=()=>{commit();i.value=c[i.id.slice(2)]??'';recorded=false;};
    });
  }
  if (state.prop === "data") {
    body.innerHTML = `${c.tagId ? `<div class="bound-tag">${esc(tag(c.tagId)?.device)} / ${esc(tag(c.tagId)?.name)}</div>` : ""}<label class="field"><span>绑定变量</span><select id="c-tag"><option value="">不绑定</option>${state.project.devices.map((d) => `<optgroup label="${esc(d.name)}">${d.tags.map((t) => `<option value="${t.id}" ${c.tagId === t.id ? "selected" : ""}>${esc(t.name)} · ${esc(t.address)}</option>`).join("")}</optgroup>`).join("")}</select></label>${field("显示单位（空白时跟随变量）", "c-unit", c.unit || "")}<div class="metric" style="height:102px;margin:25px 0"><div class="metric-label">当前值</div><div id="property-live-value" class="metric-value" style="font-size:25px">${fmt(val(c))}<small>${esc(unit(c))}</small></div></div><button class="secondary full" id="test-read">${icon("refresh")}测试读取</button><p class="hint">数值由后台实时采集。离线或数据过期时显示“—”。</p>`;
    $("#c-tag").onchange = (e) => {
      snapshot();
      c.tagId = e.target.value;
      changed();
      renderCanvas();
      renderProperties();
    };
    $("#c-unit").onchange = (e) => {
      snapshot();
      c.unit = e.target.value;
      changed();
      renderCanvas();
    };
    $("#test-read").onclick = async () => {
      await poll();
      toast(
        val(c) == null
          ? "尚未读到有效数据，请检查设备和点位"
          : "当前值：" + fmt(val(c)) + " " + unit(c),
      );
    };
  }
  if (state.prop === "action") {
    const t = tag(c.tagId),
      supported = ["button", "switch"].includes(c.kind);
    body.innerHTML = supported
      ? `${selectField(
          "点击时",
          "c-action",
          [
            ["toggle", "切换 0 / 1"],
            ["write", "写入指定数值"],
          ],
          c.action,
        )}${field("写入值", "c-write", c.writeValue ?? 1, "number", 'step="any"')}<div class="property-separator"></div><p class="hint">${t ? "目标变量：" + esc(t.name) : "先在“数据”中绑定一个变量。"}<br>${t?.writable ? "此变量允许写入。" : "此变量尚未开放写入，请到设备变量设置。"}<br>进入运行模式后点击组件触发。写入后会回读核对。</p>`
      : `<div class="hint">${names[c.kind]}为显示组件。<br>使用“按钮”或“开关”控制设备。</div>`;
    if (supported) {
      $("#c-action").onchange = (e) => {
        snapshot();
        c.action = e.target.value;
        changed();
      };
      $("#c-write").onchange = (e) => {
        snapshot();
        c.writeValue = Number(e.target.value);
        changed();
      };
    }
  }
}
async function performAction(id) {
  const c = page().components.find((c) => c.id === id);
  if (c?.kind === "equipment") {
    equipmentDialog(c);
    return;
  }
  if (!c || !["button", "switch"].includes(c.kind)) return;
  const t = tag(c.tagId);
  if (!t) {
    toast("此组件未绑定变量");
    return;
  }
  if (!t.writable) {
    toast("该变量为只读，请在设备变量设置中开启写入");
    return;
  }
  if (val(c) == null) {
    toast("数据未连接，暂不能控制设备");
    return;
  }
  if (
    c.tagId === "temperature_fault" &&
    Number(c.writeValue) === 1 &&
    !Number(processValue("plant_run"))
  ) {
    toast("请先启动流程，再触发模拟报警");
    return;
  }
  const value =
    c.action === "write" ? Number(c.writeValue) : Number(val(c)) ? 0 : 1;
  try {
    const r = await api("/write", { tagId: c.tagId, value });
    await poll();
    toast("写入成功，已回读核对：" + fmt(r.value));
  } catch (e) {
    toast(e.message);
  }
}
async function setRuntime(on) {
  try {
    await save();
  } catch (e) {
    toast(e.message);
    return;
  }
  state.runtime = on;
  selectOnly(null);
  const url = new URL(location);
  if (on) url.searchParams.set("runtime", "1");
  else {
    url.searchParams.delete("runtime");
    url.searchParams.delete("kiosk");
    state.kiosk = false;
  }
  history.replaceState(null, "", url);
  render();
}
function knowledgeDialog(){return openKnowledgePanel({api,dialog,save,toast,accept:async p=>{snapshot();state.project=p;state.saved=true;render();}})}
function controlDialog(){return openControlPanel({api,dialog,save,toast,accept:async p=>{snapshot();state.project=p;state.saved=true;render();}})}
function renderRuntime() {
  $("#app").innerHTML =
    `<main class="runtime-shell ${state.kiosk ? "kiosk" : ""}"><div class="runtime-top"><span class="brand-mark" style="width:29px;height:29px">${icon("logo")}</span><strong>${esc(state.project.name)}</strong><small><span class="dot"></span> <span id="runtime-connection">${state.project.devices.every((d) => d.protocol === "sim") ? "模拟运行 · 未连接真实设备" : "正在连接设备"}</span></small><button id="runtime-control">自动控制</button><button id="fullscreen">${icon("fullscreen")}全屏</button><button class="secondary" id="back-editor">${icon("back")}返回编辑</button></div><div class="runtime-stage"><div class="canvas-wrap" id="canvas-wrap"><div class="canvas" id="canvas"></div></div></div><div class="page-bar" id="pages"></div></main>`;
  $("#runtime-control").onclick=controlDialog;
  $("#back-editor").onclick = () => setRuntime(false);
  $("#fullscreen").onclick = async () => {
    try {
      state.kiosk = true;
      $(".runtime-shell").classList.add("kiosk");
      await document.documentElement.requestFullscreen();
      fit();
    } catch {
      toast("浏览器未允许全屏；按 Esc 返回");
      fit();
    }
  };
  renderPages();
  renderCanvas();
  requestAnimationFrame(fit);
}
async function projectDialog() {
  const d = dialog(
    "项目",
    `<div class="field-row"><button class="primary" id="new-project">${icon("plus")}新建工程</button><button class="secondary" id="import-project">${icon("upload")}导入工程</button></div><div class="field-row" style="margin-top:10px"><button class="secondary" id="export-project">${icon("download")}导出当前工程</button><button class="secondary" id="open-demo">${icon("screen")}打开演示工程</button></div><button class="secondary full" id="open-waste" style="margin-top:10px">垃圾焚烧发电 · 流程演示</button><div class="section-label" style="margin-top:25px">本地工程</div><div id="project-list">正在加载…</div>`,
  );
  $("#open-waste").onclick = async () => {
    try {
      await save();
      const p = await (await fetch("./waste-to-energy.json")).json();
      p.id = "waste_" + uid();
      await useProject(p);
      d.close();
      toast("垃圾焚烧发电流程已打开");
    } catch (e) {
      toast(e.message);
    }
  };
  $("#new-project").onclick = () => newProjectDialog();
  $("#import-project").onclick = () => $("#import-file").click();
  $("#export-project").onclick = () => {
    const blob = new Blob([JSON.stringify(state.project, null, 2)], {
        type: "application/json",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = state.project.name + ".simplehmi.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("工程已导出");
  };
  $("#open-demo").onclick = async () => {
    try {
      await save();
      const p = await (await fetch("./demo.json")).json();
      p.id = "demo_" + uid();
      await useProject(p);
      d.close();
      toast("演示工程已打开");
    } catch (e) {
      toast(e.message);
    }
  };
  try {
    const list = await api("/projects");
    if (!$("#project-list")) return;
    $("#project-list").innerHTML = list
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(
        (p) =>
          `<div class="project-row">${icon("folder")}<div>${esc(p.name)}<small>${new Date(p.updatedAt).toLocaleString("zh-CN")}</small></div><button data-load="${p.id}">${p.id === state.project.id ? "当前" : "打开"}</button></div>`,
      )
      .join("");
    $$("[data-load]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await save();
            const p = await api("/load/" + b.dataset.load, {});
            state.project = p;
            resetProjectState();
            d.close();
            render();
            await poll();
          } catch (e) {
            toast(e.message);
            b.disabled = false;
          }
        }),
    );
  } catch (e) {
    if ($("#project-list")) $("#project-list").textContent = e.message;
  }
}
function resetProjectState() {
  selectOnly(null);
  state.undo = [];
  state.redo = [];
  state.values = {};
  state.history = {};
  state.devices = {};
  state.saved = true;
  state.revision++;
}
async function useProject(p) {
  await api("/project", p);
  state.project = p;
  resetProjectState();
  render();
  await poll();
}
function newProjectDialog() {
  const d = dialog(
    "新建工程",
    `<p>从一张空白画面开始，添加设备和变量。</p><form id="new-form">${field("工程名称", "new-name", "未命名工程", "text", 'required maxlength="100"')}<div class="dialog-actions"><button type="submit" class="primary">创建工程</button></div></form>`,
  );
  $("#new-name").select();
  $("#new-form").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#new-name").value.trim();
    if (!name) return;
    const button = e.submitter;
    button.disabled = true;
    try {
      await save();
      const p = {
        schemaVersion: 1,
        id: uid(),
        name,
        devices: [],
        activePageId: uid(),
        pages: [],
      };
      p.pages = [
        {
          id: p.activePageId,
          name: "画面 1",
          width: 1024,
          height: 640,
          background: "#ffffff",
          components: [],
        },
      ];
      await useProject(p);
      d.close();
      toast("工程已创建，先添加一台设备");
    } catch (err) {
      toast(err.message);
      button.disabled = false;
    }
  };
}
function devicesDialog() {
  const d = dialog(
    "设备",
    `<p>连接设备，添加变量，再拖到画布。</p><button class="primary full" id="new-device">${icon("plus")}添加设备</button>${state.project.devices.map((v) => `<div class="project-row">${icon("device")}<div>${esc(v.name)}<small>${v.protocol === "sim" ? "模拟数据 · 无需外部设备" : esc(v.host) + ":" + v.port + " · Modbus TCP"} · ${v.tags.length} 个变量</small></div><button data-tags="${v.id}">变量</button><button data-edit-device="${v.id}" aria-label="编辑${esc(v.name)}">${icon("settings")}</button></div>`).join("")}`,
  );
  $("#new-device").onclick = () => deviceDialog();
  $$("[data-tags]").forEach(
    (b) => (b.onclick = () => tagsDialog(b.dataset.tags)),
  );
  $$("[data-edit-device]").forEach(
    (b) => (b.onclick = () => deviceDialog(b.dataset.editDevice)),
  );
}
function deviceDialog(id) {
  const original = state.project.devices.find((d) => d.id === id);
  let draft = original
    ? copy(original)
    : {
        id: uid(),
        name: "1号设备",
        protocol: "ModbusTCP",
        host: "127.0.0.1",
        port: 502,
        unitId: 1,
        polling: 1000,
        timeout: 2000,
        tags: [],
      };
  const show = () => {
    const d = dialog(
      original ? "编辑设备" : "添加设备",
      `<div class="protocol-grid">${[
        ["ModbusTCP", "Modbus TCP"],
        ["sim", "模拟设备"],
        ["ModbusRTU", "Modbus RTU ↗"],
        ["SiemensS7", "西门子 S7 ↗"],
        ["OPCUA", "OPC UA ↗"],
      ]
        .map(
          ([v, l]) =>
            `<button class="protocol ${draft.protocol === v ? "selected" : ""}" data-protocol="${v}">${icon(v === "sim" ? "chart" : "device")}${l}</button>`,
        )
        .join(
          "",
        )}</div><form id="device-form">${field("设备名称", "device-name", draft.name, "text", 'required maxlength="80"')}${draft.protocol === "ModbusTCP" ? `<div class="tag-form-grid">${field("IP 地址", "device-host", draft.host, "text", 'required pattern="[a-zA-Z0-9.\\-]+"')}${field("端口", "device-port", draft.port, "number", 'required min="1" max="65535"')}</div>` : "<p>由内置模拟变量驱动，适合先搭画面、演示和验证控制。</p>"}<details><summary>高级设置</summary><div class="field-row">${field("Unit ID", "device-unit", draft.unitId, "number", 'min="0" max="247"')}${field("轮询周期（毫秒）", "device-polling", draft.polling, "number", 'min="250" max="60000"')}${field("超时（毫秒）", "device-timeout", draft.timeout, "number", 'min="500" max="10000"')}</div><p class="hint">MVP 使用 1 起始寄存器地址。默认大端；其他字节序请在工程师模式配置。</p></details><div id="test-result"></div><div class="dialog-actions">${original ? '<button type="button" class="danger-text" id="delete-device">删除设备</button>' : ""}<button type="button" id="test-device" class="secondary">测试连接</button><button type="submit" class="primary">${original ? "保存设备" : "添加并配置变量"}</button></div></form>`,
    );
    const gather = () => {
      draft.name = $("#device-name").value.trim();
      draft.host = $("#device-host")?.value.trim() || draft.host;
      draft.port = Number($("#device-port")?.value || draft.port);
      draft.unitId = Number($("#device-unit").value);
      draft.polling = Number($("#device-polling").value);
      draft.timeout = Number($("#device-timeout").value);
      return draft;
    };
    $$("[data-protocol]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!["sim", "ModbusTCP"].includes(b.dataset.protocol)) {
            dialog(
              "使用工程师模式配置",
              `<p>${esc(b.textContent.trim())} 使用高级驱动与配置界面。在工程师设备页面启用对应协议插件后配置。</p><div class="engineer-links"><a href="../device" target="_blank" rel="noopener">${icon("device")}打开设备配置</a><a href="../plugins" target="_blank" rel="noopener">${icon("settings")}协议插件</a></div><div class="dialog-actions"><button id="back-wizard" class="secondary">返回添加设备</button></div>`,
            );
            $("#back-wizard").onclick = show;
            return;
          }
          gather();
          draft.protocol = b.dataset.protocol;
          show();
        }),
    );
    $("#test-device").onclick = async () => {
      if (!$("#device-form").reportValidity()) return;
      const b = $("#test-device");
      b.disabled = true;
      b.textContent = "测试中…";
      try {
        const result = await api("/test", gather());
        $("#test-result").innerHTML =
          `<div class="success-inline">${esc(result.message)}</div>`;
      } catch (e) {
        $("#test-result").innerHTML =
          `<div class="error-inline">${esc(e.message)}</div>`;
      } finally {
        b.disabled = false;
        b.textContent = "测试连接";
      }
    };
    $("#device-form").onsubmit = async (e) => {
      e.preventDefault();
      gather();
      if (!draft.name) return;
      const b = e.submitter;
      b.disabled = true;
      const prev = copy(state.project);
      snapshot();
      if (original)
        state.project.devices = state.project.devices.map((v) =>
          v.id === id ? draft : v,
        );
      else state.project.devices.push(draft);
      try {
        await save();
        state.values = {};
        state.history = {};
        state.tab = "devices";
        render();
        tagsDialog(draft.id);
        toast("设备已保存");
      } catch (err) {
        state.project = prev;
        toast(err.message);
        b.disabled = false;
      }
    };
    $("#delete-device")?.addEventListener("click", async () => {
      snapshot();
      const removed = new Set(draft.tags.map((t) => t.id));
      state.project.devices = state.project.devices.filter(
        (v) => v.id !== draft.id,
      );
      state.project.pages.forEach((p) =>
        p.components.forEach((c) => {
          if (removed.has(c.tagId)) c.tagId = "";
        }),
      );
      try {
        await save();
        d.close();
        render();
        toast("设备已删除，相关组件已解除绑定");
      } catch (e) {
        toast(e.message);
      }
    });
  };
  show();
}
function tagsDialog(deviceId) {
  const device = state.project.devices.find((d) => d.id === deviceId);
  if (!device) return;
  const d = dialog(
    device.name + " · 变量",
    `<p>${device.protocol === "sim" ? "添加模拟变量，选择波动数据或可写的手动值。" : "填写寄存器地址。地址从 1 开始，例如 PLC 偏移 0 对应这里的 1。"}</p>${device.tags.length ? `<table class="tag-table"><thead><tr><th>变量名称</th><th>地址 / 类型</th><th>读写</th><th></th></tr></thead><tbody>${device.tags.map((t) => `<tr><td>${esc(t.name)}<small style="color:#9ca9bb"> ${esc(t.unit)}</small></td><td>${t.address} · ${t.type}</td><td>${t.writable ? "可写" : "只读"}</td><td><button data-edit-tag="${t.id}" aria-label="编辑变量${esc(t.name)}">${icon("settings")}</button><button data-delete-tag="${t.id}" aria-label="删除变量${esc(t.name)}">${icon("trash")}</button></td></tr>`).join("")}</tbody></table>` : ""}<div id="tag-editor"></div><div class="dialog-actions"><button class="secondary" id="tags-done">完成</button></div>`,
  );
  function form(editId) {
    const t = device.tags.find((t) => t.id === editId) || {
      id: uid(),
      name: "变量 " + (device.tags.length + 1),
      address: device.tags.length + 1,
      type: "UInt16",
      memory: "400000",
      divisor: 1,
      unit: "",
      initial: 50,
      sim: "wave",
      writable: false,
    };
    $("#tag-editor").innerHTML =
      `<form id="tag-form"><div class="section-label">${editId ? "编辑变量" : "添加变量"}</div><div class="tag-form-grid">${field("变量名称", "tag-name", t.name, "text", 'required maxlength="80"')}${field("地址（从 1 开始）", "tag-address", t.address, "number", 'min="1" max="65535" required')}${selectField(
        "数据类型",
        "tag-type",
        [
          ["UInt16", "无符号整数"],
          ["Int16", "有符号整数"],
          ["Float32", "浮点数"],
          ["Bool", "布尔值"],
        ],
        t.type,
      )}${field("单位", "tag-unit", t.unit || "")}</div>${
        device.protocol === "sim"
          ? `<div class="field-row">${selectField(
              "模拟方式",
              "tag-sim",
              [
                ["wave", "自动波动"],
                ["manual", "手动值（可读写）"],
              ],
              t.sim,
            )}${field("初始值", "tag-initial", t.initial, "number", 'step="any"')}</div>`
          : `<details><summary>高级点位设置</summary>${selectField(
              "寄存器区域",
              "tag-memory",
              [
                ["400000", "保持寄存器（读写）"],
                ["300000", "输入寄存器（只读）"],
                ["0", "线圈（读写）"],
                ["100000", "离散输入（只读）"],
              ],
              t.memory,
            )}${field("显示值 = 原始值 ÷ 倍率", "tag-divisor", t.divisor, "number", 'min="0.0001" step="any"')}</details>`
      }<label style="display:flex;align-items:center;gap:9px;font-size:13px;margin:16px 0"><input type="checkbox" id="tag-writable" ${t.writable ? "checked" : ""}>允许按钮 / 开关写入这个变量</label><div class="dialog-actions"><button type="submit" class="primary">${editId ? "保存修改" : "添加变量"}</button></div><div id="tag-error"></div></form>`;
    $("#tag-form").onsubmit = async (e) => {
      e.preventDefault();
      const nt = {
        ...t,
        name: $("#tag-name").value.trim(),
        address: Number($("#tag-address").value),
        type: $("#tag-type").value,
        unit: $("#tag-unit").value,
        initial: Number($("#tag-initial")?.value || 0),
        sim: $("#tag-sim")?.value || "manual",
        memory: $("#tag-memory")?.value || "400000",
        divisor: Number($("#tag-divisor")?.value || 1),
        writable: $("#tag-writable").checked,
      };
      if (!nt.name) return;
      if (nt.writable && ["300000", "100000"].includes(nt.memory)) {
        toast("输入寄存器和离散输入不能写入");
        return;
      }
      if (
        nt.type === "Bool" &&
        device.protocol === "ModbusTCP" &&
        !["0", "100000"].includes(nt.memory)
      ) {
        toast("Bool 请选择线圈或离散输入区域");
        return;
      }
      if (nt.writable && device.protocol === "sim") nt.sim = "manual";
      snapshot();
      const previous = copy(device.tags);
      if (editId)
        device.tags = device.tags.map((x) => (x.id === editId ? nt : x));
      else device.tags.push(nt);
      e.submitter.disabled = true;
      try {
        await save();
        state.history = {};
        render();
        tagsDialog(deviceId);
        toast(editId ? "变量已更新" : "变量已添加，可从左侧拖入画布");
      } catch (err) {
        device.tags = previous;
        $("#tag-error").innerHTML =
          `<div class="error-inline">${esc(err.message)}</div>`;
        e.submitter.disabled = false;
      }
    };
  }
  form();
  $$("[data-edit-tag]").forEach(
    (b) => (b.onclick = () => form(b.dataset.editTag)),
  );
  $$("[data-delete-tag]").forEach(
    (b) =>
      (b.onclick = async () => {
        snapshot();
        device.tags = device.tags.filter((t) => t.id !== b.dataset.deleteTag);
        state.project.pages.forEach((p) =>
          p.components.forEach((c) => {
            if (c.tagId === b.dataset.deleteTag) c.tagId = "";
          }),
        );
        try {
          await save();
          render();
          tagsDialog(deviceId);
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  $("#tags-done").onclick = () => {
    d.close();
    state.tab = "devices";
    render();
  };
}
async function engineerDialog() {
  try {
    await save();
  } catch (e) {
    toast(e.message);
    return;
  }
  dialog(
    "工程师模式",
    `<p>打开完整工程工作区，使用高级驱动、脚本、历史归档与安全配置。</p><div class="engineer-links">${[
      ["editor", "screen", "完整编辑器"],
      ["device", "device", "设备与点位"],
      ["plugins", "settings", "协议插件"],
      ["view", "play", "运行引擎"],
    ]
      .map(
        ([href, i, l]) =>
          `<a href="../${href}" target="_blank" rel="noopener">${icon(i)}${l} ↗</a>`,
      )
      .join(
        "",
      )}</div><p class="hint">设备与变量使用同一个运行引擎。极简画面单独保存，暂不与原编辑器的 SVG 画面双向转换。由极简模式管理的设备，请在本界面修改，以免下次同步覆盖高级配置。</p>`,
  );
}
function updateStatus() {
  if($("#runtime-control")){const c=state.control;$("#runtime-control").textContent=c?.state==='automatic'?'自动：运行中':c?.state==='fault'?'自动：已中止':c?.state==='unknown'?'控制状态未知':'自动控制';$("#runtime-control").title=c?.reason||'控制规则与人工接管';}
  const connected = Object.values(state.devices).filter(
      (d) => d.connected,
    ).length,
    total = state.project.devices.length,
    sim = state.project.devices.some((d) => d.protocol === "sim");
  if ($("#runtime-connection"))
    $("#runtime-connection").textContent =
      connected < total
        ? "设备离线 · 数据不可用"
        : state.project.devices.every((d) => d.protocol === "sim")
          ? "模拟运行 · 未连接真实设备"
          : `实时连接 ${connected} / ${total} 台设备`;
  if ($("#connection-text"))
    $("#connection-text").textContent = total
      ? `${connected} / ${total} 台设备在线${sim ? " · 含模拟数据" : ""}`
      : "尚未添加设备";
  if ($("#runtime-dot"))
    $("#runtime-dot").style.background =
      connected === total && total ? "#149780" : "#d97706";
  if ($("#connection-dot"))
    $("#connection-dot").style.background = connected ? "#28b58a" : "#b9c3d2";
  $$("[data-value]").forEach(
    (e) =>
      (e.textContent = fmt(
        state.values[e.dataset.value]?.quality === "good"
          ? state.values[e.dataset.value].value
          : null,
      )),
  );
}
async function poll() {
  if (state.polling || !state.project) return;
  state.polling = true;
  const rev = state.revision;
  try {
    const result = await api("/values");
    if (rev !== state.revision) return;
    state.values = result.values;
    state.devices = result.devices;
    state.control = result.control;
    for (const [id, v] of Object.entries(result.values)) {
      if (v.quality === "good") {
        const h = state.history[id] || (state.history[id] = []);
        h.push({ time: result.now, value: Number(v.value) });
        if (h.length > 1800) h.shift();
      }
    }
    if (!state.dragging)
      for (const c of page().components) {
        const e = $(`[data-id="${c.id}"] .component-content`);
        if (e) {
          const content = componentContent(c);
          if (e.__rendered !== content) {
            e.innerHTML = content;
            e.__rendered = content;
          }
        }
      }
    updateStatus();
    const c = selected();
    if (c && $("#property-live-value"))
      $("#property-live-value").innerHTML =
        `${fmt(val(c))}<small>${esc(unit(c))}</small>`;
  } catch (e) {
    for (const id in state.values) state.values[id].quality = "stale";
    state.devices = {};
    state.control={state:"unknown",reason:"Runtime 连接中断，不能确认控制状态"};
    updateStatus();
    if ($("#runtime-connection")) $("#runtime-connection").textContent = "Runtime 连接中断 · 数据不可用";
    if ($("#connection-text"))
      $("#connection-text").textContent = "Runtime 连接中断";
    if (!state.dragging)
      for (const c of page().components) {
        const e = $(`[data-id="${c.id}"] .component-content`);
        if (e) {
          const content = componentContent(c);
          if (e.__rendered !== content) {
            e.innerHTML = content;
            e.__rendered = content;
          }
        }
      }
  } finally {
    state.polling = false;
  }
}
async function hydrateHistory() {
  if (!state.project) return;
  const revision = state.revision;
  for (const t of tags()) {
    try {
      const rows = await api("/history/" + t.id);
      if (revision !== state.revision) return;
      if (rows.length) state.history[t.id] = rows;
    } catch {}
  }
}
$("#import-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 3 * 1024 * 1024) throw Error("工程文件超过 3 MB");
    const p = JSON.parse(await f.text());
    await save();
    p.id = uid();
    await useProject(p);
    $("#dialog").close();
    toast("工程已导入");
  } catch (err) {
    toast("导入失败：" + err.message);
  } finally {
    e.target.value = "";
  }
};
window.addEventListener("resize", fit);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.kiosk) {
    state.kiosk = false;
    $(".runtime-shell")?.classList.remove("kiosk");
    fit();
    return;
  }
  if (e.key === "Escape" && state.runtime && !$("#dialog").open) {
    setRuntime(false);
    return;
  }
  if (
    $("#dialog").open ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) ||
    state.runtime
  )
    return;
  const cmd = e.ctrlKey || e.metaKey;
  if (cmd && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo(e.shiftKey);
  }
  if (cmd && e.key.toLowerCase() === "a") {
    e.preventDefault();
    state.selection = page()
      .components.filter((c) => !c.locked && c.kind !== "flow")
      .map((c) => c.id);
    state.selected = state.selection.at(-1) || null;
    renderCanvas();
    renderProperties();
  }
  if (cmd && e.key.toLowerCase() === "d") {
    e.preventDefault();
    duplicate();
  }
  if (cmd && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save()
      .then(() => toast("已保存"))
      .catch((e) => toast(e.message));
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    removeSelected();
  }
  if (
    selectedItems().length &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    snapshot();
    const items = selectedItems(),
      b = bounds(items),
      step = e.shiftKey ? 8 : 1,
      dx = Math.max(
        -b.x,
        Math.min(
          page().width - b.right,
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
        ),
      ),
      dy = Math.max(
        -b.y,
        Math.min(
          page().height - b.bottom,
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        ),
      );
    for (const c of items) {
      c.x += dx;
      c.y += dy;
    }
    changed();
    renderCanvas();
    renderProperties();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (!state.saved) {
    e.preventDefault();
    e.returnValue = "工程正在保存";
  }
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    state.kiosk = false;
    $(".runtime-shell")?.classList.remove("kiosk");
    fit();
  }
});
async function boot() {
  try {
    catalog = await (await fetch("./catalog.json")).json();
    state.project = await api("/project");
    if (!state.project) throw Error("等待工程加载");
    render();
    await poll();
    await hydrateHistory();
    setInterval(poll, 1000);
    setInterval(hydrateHistory, 15000);
  } catch (e) {
    $("#app").innerHTML =
      `<div class="loading"><div><p>${esc(e.message)}</p><button class="secondary" id="retry">重新连接</button></div></div>`;
    $("#retry").onclick = boot;
    setTimeout(() => {
      if (!state.project) boot();
    }, 2000);
  }
}
boot();

function equipmentDialog(c) {
  const related = c.details || [];
  dialog(
    c.label + " · 设备信息",
    `<p>${esc(c.description || "设备状态由 运行引擎 变量驱动。")}</p><div class="plant-detail-grid">${related.map((r) => `<div class="plant-detail-item">${esc(r.label)}<b>${fmt(processValue(r.tag))} ${esc(r.unit || "")}</b></div>`).join("")}</div><p>当前状态：${val(c) == null ? "未连接" : Number(val(c)) ? "运行中" : "待机"}</p><p class="process-recording-note">模拟流程用于画面和交互演示，参数不是现场运行设定。</p>`,
  );
}

function libraryEntries() {
  return [...catalog, ...(state.project.customSymbols || [])];
}
function symbolSvg(asset) {
  if (asset.svgData)
    return `<img src="${esc(asset.svgData)}" alt="${esc(asset.name)}" draggable="false">`;
  return `<svg viewBox="${esc(asset.viewBox)}" fill="none" stroke="currentColor" stroke-width="${Number(asset.stroke) || 1.5}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${asset.body}</svg>`;
}
function symbolContent(c) {
  const asset = libraryEntries().find((a) => a.id === c.assetId);
  if (!asset) return '<div class="empty-property">图形资源缺失</div>';
  const v = val(c),
    active = v != null && Number(v) > 0;
  return `<div class="library-symbol ${active ? "is-active" : ""}" style="color:${active ? esc(c.color) : "#60758d"}"><div class="symbol-image">${symbolSvg(asset)}</div><div class="symbol-name">${esc(c.label)}</div><div class="symbol-value">${c.tagId ? (v == null ? "未连接" : fmt(v) + " " + esc(unit(c))) : "未绑定变量"}</div></div>`;
}
function addLibraryComponent(id, x = 100, y = 100) {
  const asset = libraryEntries().find((a) => a.id === id);
  if (!asset) return;
  snapshot();
  const c = {
    id: uid(),
    kind: "symbol",
    assetId: id,
    x: Math.max(0, Math.min(page().width - 152, x)),
    y: Math.max(0, Math.min(page().height - 156, y)),
    w: 152,
    h: 156,
    label: asset.name,
    tagId: "",
    color: "#247dab",
    unit: "",
  };
  page().components.push(c);
  selectOnly(c.id);
  state.prop = "data";
  changed();
  renderCanvas();
  renderProperties();
  if (state.tab === "layers") renderLeft();
}
function libraryDialog() {
  const entries = libraryEntries(),
    groups = ["全部", "常用", ...new Set(entries.map((a) => a.group))];
  const d = dialog(
    "设备图形库",
    `<div class="library-toolbar"><input id="library-search" aria-label="搜索设备图形" placeholder="搜索名称，如 离心泵、阀门、储罐…" value="${esc(libraryQuery)}"><button class="secondary" id="import-symbol">${icon("upload")}导入 SVG</button><input id="symbol-file" type="file" accept=".svg,image/svg+xml" hidden></div><div class="library-categories">${groups.map((g) => `<button data-category="${esc(g)}" class="${g === libraryGroup ? "active" : ""}">${esc(g)}</button>`).join("")}</div><p class="hint" id="library-count"></p><div class="library-results" id="library-results"></div><p class="hint">点击添加，再绑定设备变量。星标收藏常用图形。导入的 SVG 随工程保存；设备图形与通信驱动独立配置。</p>`,
  );
  d.classList.add("wide-dialog");
  d.addEventListener("close", () => d.classList.remove("wide-dialog"), {
    once: true,
  });
  const results = () => {
    const found = entries.filter(
      (a) =>
        (libraryGroup === "全部" ||
          (libraryGroup === "常用" && favorites.includes(a.id)) ||
          a.group === libraryGroup) &&
        (a.name + " " + a.keywords)
          .toLowerCase()
          .includes(libraryQuery.toLowerCase()),
    );
    $("#library-count").textContent =
      `共 ${entries.length} 种图形 · 当前显示 ${found.length} 种`;
    $("#library-results").innerHTML = found.length
      ? found
          .map(
            (a) =>
              `<div class="library-card"><button class="library-add" data-asset="${a.id}" aria-label="添加 ${esc(a.name)}"><div class="library-preview">${symbolSvg(a)}</div><span>${esc(a.name)}</span></button><button class="favorite ${favorites.includes(a.id) ? "active" : ""}" data-favorite="${a.id}" aria-label="收藏 ${esc(a.name)}" aria-pressed="${favorites.includes(a.id)}">${icon("star")}</button></div>`,
          )
          .join("")
      : '<div class="library-empty">没有找到匹配图形。试试其他关键词，或导入自定义 SVG。</div>';
    $$("[data-asset]").forEach(
      (b) =>
        (b.onclick = () => {
          addLibraryComponent(b.dataset.asset);
          d.close();
          toast("图形已添加，在右侧绑定变量");
        }),
    );
    $$("[data-favorite]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.favorite;
          favorites = favorites.includes(id)
            ? favorites.filter((x) => x !== id)
            : [...favorites, id];
          localStorage.setItem(
            "simplehmi-favorites",
            JSON.stringify(favorites),
          );
          results();
        }),
    );
  };
  $("#library-search").oninput = (e) => {
    libraryQuery = e.target.value;
    results();
  };
  $$("[data-category]").forEach(
    (b) =>
      (b.onclick = () => {
        libraryGroup = b.dataset.category;
        $$("[data-category]").forEach((b) =>
          b.classList.toggle("active", b.dataset.category === libraryGroup),
        );
        results();
      }),
  );
  $("#import-symbol").onclick = () => $("#symbol-file").click();
  $("#symbol-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 131072) throw Error("SVG 最大 128 KB");
      if ((state.project.customSymbols || []).length >= 16)
        throw Error("单工程最多 16 个自定义图形");
      const clean = sanitizeSvg(await file.text()),
        bytes = new TextEncoder().encode(clean.svg);
      const data =
        "data:image/svg+xml;base64," +
        btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
      const asset = {
        id: "custom_" + uid(),
        name: file.name.replace(/\.svg$/i, "").slice(0, 60),
        group: "自定义",
        keywords: "custom",
        svgData: data,
      };
      snapshot();
      (state.project.customSymbols ??= []).push(asset);
      changed();
      addLibraryComponent(asset.id);
      d.close();
      toast(
        clean.removed
          ? "图形已导入；已移除脚本或不支持的内容"
          : "自定义图形已添加，并随工程保存",
      );
    } catch (err) {
      toast(err.message);
    }
  };
  results();
}

window.simplehmiDesktop?.onClose(async () => {
  try {
    if (state.project) await save();
    window.simplehmiDesktop.closeReady();
  } catch (e) {
    toast("未能保存，窗口保持打开：" + e.message);
  }
});
