// Sigma → Figma importer. Run as a Figma development plugin.
figma.showUI(__html__, { width: 430, height: 600, title: "Sigma Import" });

figma.ui.onmessage = async (msg) => {
  if (!msg || msg.type !== "import") return;
  try {
    const result = await importSigma(msg.data, msg.pageFilter || "");
    figma.ui.postMessage({ type: "done", message: result });
  } catch (e) {
    figma.ui.postMessage({ type: "error", message: String(e && e.message ? e.message : e) });
  }
};

function parseColor(hex) {
  let h = String(hex || "#000000").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  if (h.length !== 8) h = "000000ff";
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: parseInt(h.slice(6, 8), 16) / 255,
  };
}

function solidPaint(paint) {
  const c = parseColor(paint && paint.color);
  return {
    type: "SOLID",
    color: { r: c.r, g: c.g, b: c.b },
    opacity: (paint && typeof paint.opacity === "number" ? paint.opacity : 1) * (c.a || 1),
  };
}

function gradientPaint(paint) {
  const stops = (paint.stops || []).slice().sort((a, b) => a.position - b.position).map((s) => {
    const c = parseColor(s.color);
    return { position: Math.max(0, Math.min(1, s.position)), color: { r: c.r, g: c.g, b: c.b, a: c.a } };
  });
  const rad = ((paint.angle || 90) - 90) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    type: "GRADIENT_LINEAR",
    gradientTransform: [
      [cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin],
      [sin, cos, 0.5 - 0.5 * sin - 0.5 * cos],
    ],
    gradientStops: stops.length ? stops : [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } }],
    opacity: typeof paint.opacity === "number" ? paint.opacity : 1,
  };
}

function paintOf(paint) {
  if (!paint) return [];
  if (paint.type === "solid") return [solidPaint(paint)];
  return [gradientPaint(paint)];
}

function effectsOf(node) {
  const out = [];
  if (node.shadow) {
    const c = parseColor(node.shadow.color);
    out.push({
      type: "DROP_SHADOW", color: { r: c.r, g: c.g, b: c.b, a: c.a },
      offset: { x: node.shadow.x || 0, y: node.shadow.y || 0 },
      radius: node.shadow.blur || 0, spread: node.shadow.spread || 0,
      visible: true, blendMode: "NORMAL",
    });
  }
  if (node.blur) out.push({ type: "LAYER_BLUR", radius: node.blur, visible: true });
  return out;
}

const fontCache = new Map();
async function loadFont(family, weight) {
  const style = weight >= 700 ? "Bold" : weight >= 600 ? "Semi Bold" : weight >= 500 ? "Medium" : "Regular";
  const key = family + "|" + style;
  if (fontCache.has(key)) return fontCache.get(key);
  let result;
  try {
    result = { family: family || "Inter", style };
    await figma.loadFontAsync(result);
  } catch (_) {
    try {
      result = { family: "Inter", style };
      await figma.loadFontAsync(result);
    } catch (_) {
      result = { family: "Inter", style: "Regular" };
      await figma.loadFontAsync(result);
    }
  }
  fontCache.set(key, result);
  return result;
}

function append(parent, node) {
  if (parent.type === "PAGE") parent.appendChild(node);
  else parent.appendChild(node);
}

async function importNode(page, n, parent, offsetX, offsetY, pageFilter) {
  if (!n) return null;
  if (n.type === "group") {
    const children = n.children || [];
    for (const id of children) {
      await importNode(page, page.nodes[id], parent, offsetX + (n.x || 0), offsetY + (n.y || 0), pageFilter);
    }
    return null;
  }
  let node;
  if (n.type === "frame") {
    node = figma.createFrame();
    node.fills = paintOf(n.fill);
    node.clipsContent = !!n.clip;
  } else if (n.type === "ellipse") {
    node = figma.createEllipse();
    node.fills = paintOf(n.fill);
  } else if (n.type === "text") {
    node = figma.createText();
    node.fontName = await loadFont(n.fontFamily, n.fontWeight || 400);
    node.fontSize = n.fontSize || 16;
    node.textAlignHorizontal = (n.textAlign || "left").toUpperCase();
    node.textAlignVertical = n.verticalAlign === "middle" ? "CENTER" : n.verticalAlign === "bottom" ? "BOTTOM" : "TOP";
    node.lineHeight = { unit: "PERCENT", value: Math.max(10, (n.lineHeight || 1.4) * 100) };
    node.letterSpacing = { unit: "PIXELS", value: n.letterSpacing || 0 };
    node.textAutoResize = "NONE";
    node.resize(Math.max(1, n.width || 320), Math.max(1, n.height || 40));
    node.characters = n.text || " ";
    node.fills = paintOf(n.fill);
  } else if (n.type === "line") {
    node = figma.createLine();
    node.resize(Math.max(1, n.width || 1), 0);
    node.strokes = paintOf(n.stroke);
    node.strokeWeight = Math.max(1, n.strokeWidth || 1);
  } else if (n.type === "image") {
    node = figma.createRectangle();
    node.fills = paintOf(n.fill);
  } else {
    node = figma.createRectangle();
    node.fills = paintOf(n.fill);
    if (n.radius) node.cornerRadius = n.radius;
  }
  node.name = n.name || n.type || "Layer";
  append(parent, node);
  node.x = (n.x || 0) + offsetX;
  node.y = (n.y || 0) + offsetY;
  if (n.type !== "line") node.resize(Math.max(1, n.width || 1), Math.max(0, n.height || 0));
  if (n.type !== "text" && n.type !== "line" && n.stroke) {
    node.strokes = paintOf(n.stroke);
    node.strokeWeight = Math.max(0, n.strokeWidth || 1);
  }
  if (typeof n.opacity === "number") node.opacity = Math.max(0, Math.min(1, n.opacity));
  if (n.visible === false) node.visible = false;
  if (n.rotation) node.rotation = n.rotation;
  const fx = effectsOf(n);
  if (fx.length) node.effects = fx;
  if (n.type === "image" && n.src) {
    try {
      const image = await figma.createImageAsync(n.src);
      node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: n.objectFit === "contain" ? "FIT" : "FILL" }];
    } catch (_) {}
  }
  for (const id of n.children || []) {
    await importNode(page, page.nodes[id], node, 0, 0, pageFilter);
  }
  return node;
}

async function importSigma(data, pageFilter) {
  const doc = data.doc || data;
  if (!doc.pages || !Array.isArray(doc.pages)) throw new Error("No pages[] found. Use a Sigma JSON export, not a .fig file.");
  let pages = doc.pages;
  if (pageFilter) pages = pages.filter((p) => String(p.name || "").toLowerCase().includes(pageFilter.toLowerCase()));
  if (!pages.length) throw new Error("No pages matched “" + pageFilter + "”.");
  let created = 0, nodes = 0;
  const roots = [];
  for (const p of pages) {
    const page = figma.createPage();
    page.name = p.name || "Sigma page";
    if (typeof figma.setCurrentPageAsync === "function") await figma.setCurrentPageAsync(page);
    else figma.currentPage = page;
    for (const id of p.rootIds || []) {
      const n = await importNode(page, p.nodes[id], page, 0, 0, pageFilter);
      if (n) roots.push(n);
      nodes++;
    }
    created++;
  }
  if (roots.length) figma.viewport.scrollAndZoomIntoView(roots);
  figma.notify("Sigma import complete");
  return "Imported " + created + " page(s), " + nodes + " root layer(s).";
}
