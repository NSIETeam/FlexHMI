// Pure geometry shared by the editor and its regression tests.
export function bounds(items) {
  return {
    x: Math.min(...items.map((c) => c.x)),
    y: Math.min(...items.map((c) => c.y)),
    right: Math.max(...items.map((c) => c.x + c.w)),
    bottom: Math.max(...items.map((c) => c.y + c.h)),
  };
}
export function arrange(items, mode, page) {
  const out = items.map((c) => ({ ...c }));
  if (!out.length) return out;
  const b =
    out.length === 1
      ? { x: 0, y: 0, right: page.width, bottom: page.height }
      : bounds(out);
  if (mode === "distribute-x" || mode === "distribute-y") {
    if (out.length < 3) return out;
    const horizontal = mode.endsWith("x"),
      p = horizontal ? "x" : "y",
      s = horizontal ? "w" : "h";
    out.sort((a, b) => a[p] - b[p]);
    const span = out.at(-1)[p] + out.at(-1)[s] - out[0][p],
      gap = (span - out.reduce((n, c) => n + c[s], 0)) / (out.length - 1);
    if (gap < 0) throw Error("可用空间不足，请先拉开首尾组件");
    let pos = out[0][p];
    for (const c of out) {
      c[p] = Math.round(pos);
      pos += c[s] + gap;
    }
    return out;
  }
  for (const c of out) {
    if (mode === "left") c.x = b.x;
    if (mode === "center") c.x = (b.x + b.right - c.w) / 2;
    if (mode === "right") c.x = b.right - c.w;
    if (mode === "top") c.y = b.y;
    if (mode === "middle") c.y = (b.y + b.bottom - c.h) / 2;
    if (mode === "bottom") c.y = b.bottom - c.h;
    c.x = Math.round(c.x);
    c.y = Math.round(c.y);
  }
  return out;
}
export function snapMove(
  items,
  others,
  dx,
  dy,
  page,
  { enabled = true, grid = 8, threshold = 6 } = {},
) {
  const b = bounds(items),
    w = b.right - b.x,
    h = b.bottom - b.y;
  let x = b.x + dx,
    y = b.y + dy,
    guides = [];
  if (enabled) {
    x = Math.round(x / grid) * grid;
    y = Math.round(y / grid) * grid;
    const targetsX = [0, page.width / 2, page.width],
      targetsY = [0, page.height / 2, page.height];
    for (const c of others) {
      targetsX.push(c.x, c.x + c.w / 2, c.x + c.w);
      targetsY.push(c.y, c.y + c.h / 2, c.y + c.h);
    }
    for (const [axis, targets, size] of [
      ["x", targetsX, w],
      ["y", targetsY, h],
    ]) {
      const pos = axis === "x" ? b.x + dx : b.y + dy;
      let best = null;
      for (const t of targets)
        for (const offset of [0, size / 2, size]) {
          const delta = t - (pos + offset);
          if (
            Math.abs(delta) <= threshold &&
            (!best || Math.abs(delta) < Math.abs(best.delta))
          )
            best = { delta, t };
        }
      if (best) {
        if (axis === "x") x = pos + best.delta;
        else y = pos + best.delta;
        guides.push({ axis, position: best.t });
      }
    }
  }
  const cx = Math.max(0, Math.min(page.width - w, x)),
    cy = Math.max(0, Math.min(page.height - h, y));
  if (cx !== x) guides = guides.filter((g) => g.axis !== "x");
  if (cy !== y) guides = guides.filter((g) => g.axis !== "y");
  return { dx: cx - b.x, dy: cy - b.y, guides };
}
