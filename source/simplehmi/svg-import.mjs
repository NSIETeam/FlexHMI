// Imported graphics are restricted to inert SVG geometry, embedded as an image.
export function sanitizeSvg(source, Parser = DOMParser) {
  if (source.length > 131072) throw Error("SVG 最大 128 KB");
  const doc = new Parser().parseFromString(source, "image/svg+xml"),
    root = doc.documentElement;
  if (root.localName !== "svg" || doc.querySelector("parsererror"))
    throw Error("请选择有效的 SVG 图形");
  const allowed = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "defs",
    "linearGradient",
    "radialGradient",
    "stop",
    "clipPath",
  ]);
  const attrs = new Set([
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "d",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "points",
    "transform",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "opacity",
    "id",
    "clip-path",
    "offset",
    "stop-color",
    "stop-opacity",
    "gradientUnits",
    "gradientTransform",
    "fx",
    "fy",
    "font-size",
    "font-family",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "xmlns",
  ]);
  let removed = 0;
  for (const el of [...root.querySelectorAll("*")])
    if (!allowed.has(el.localName)) {
      el.remove();
      removed++;
    }
  for (const el of [root, ...root.querySelectorAll("*")])
    for (const a of [...el.attributes]) {
      if (a.name === "style") {
        for (const pair of a.value.split(";")) {
          const [k, ...v] = pair.split(":");
          if (attrs.has(k.trim()))
            el.setAttribute(k.trim(), v.join(":").trim());
        }
        el.removeAttribute("style");
      }
    }
  for (const el of [root, ...root.querySelectorAll("*")])
    for (const a of [...el.attributes])
      if (
        !attrs.has(a.name) ||
        /javascript:|data:|https?:|file:|@import|expression|\/\//i.test(
          a.value,
        ) ||
        (/url\(/i.test(a.value) && !/^url\(#[a-zA-Z0-9_-]+\)$/.test(a.value))
      ) {
        el.removeAttribute(a.name);
        removed++;
      }
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!root.hasAttribute("viewBox")) {
    const w = parseFloat(root.getAttribute("width")),
      h = parseFloat(root.getAttribute("height"));
    if (!(w > 0 && h > 0)) throw Error("SVG 需要有效 viewBox 或宽高");
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  const box = root
    .getAttribute("viewBox")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    box.length !== 4 ||
    box.some((x) => !Number.isFinite(x)) ||
    box[2] <= 0 ||
    box[3] <= 0
  )
    throw Error("SVG 画布范围无效");
  return { svg: new XMLSerializer().serializeToString(root), removed };
}
