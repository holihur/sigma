import paper from "paper";
import ImageTracer from "imagetracerjs";
import ClipperLib from "clipper-lib";
import type { Page, Paint, SceneNode, VectorHandle, VectorPoint, VectorSubpath } from "./types";
import { createNode, nodeMatrix } from "./nodes";
import { shapeToVector, subpathPatch, vectorSubpaths } from "./vector";

export type PathfinderKind = "union" | "subtract" | "intersect" | "exclude";

let paperReady = false;
function ensurePaper() {
  if (!paperReady) {
    paper.setup(new paper.Size(1, 1));
    paperReady = true;
  }
  return paper;
}

function hex(color: any): string | null {
  if (!color) return null;
  const c = color.toCSS ? color.toCSS(true) : String(color);
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (!m) return c;
  return "#" + m[1] + (m[2] && m[2] !== "ff" ? m[2] : "");
}

function paintFromPaper(path: any): Paint | null {
  const color = path.fillColor;
  if (!color) return null;
  const alpha = typeof path.opacity === "number" ? path.opacity : 1;
  return { type: "solid", color: hex(color) ?? "#0ea5e9", opacity: alpha < 1 ? alpha : undefined };
}

function paperMatrix(m: number[]) {
  return new paper.Matrix(m[0], m[1], m[2], m[3], m[4], m[5]);
}

function nodeSubpaths(node: SceneNode): VectorSubpath[] {
  if (node.type === "vector") return vectorSubpaths(node);
  if (node.type === "rect" || node.type === "ellipse" || node.type === "line") {
    const converted = shapeToVector(node);
    return [{ points: converted.points, closed: converted.closed }];
  }
  return [];
}

function subpathToPaper(sub: VectorSubpath, node: SceneNode): any {
  const w = Math.max(node.width, 1);
  const h = Math.max(node.height, 1);
  const segments = sub.points.map((p) => {
    const point = new paper.Point(p.x * w, p.y * h);
    const handleIn = p.in ? new paper.Point((p.in.x - p.x) * w, (p.in.y - p.y) * h) : new paper.Point(0, 0);
    const handleOut = p.out ? new paper.Point((p.out.x - p.x) * w, (p.out.y - p.y) * h) : new paper.Point(0, 0);
    return new paper.Segment(point, handleIn, handleOut);
  });
  return new paper.Path({ segments, closed: sub.closed, insert: false });
}

export function nodeToPaper(page: Page, node: SceneNode): any {
  ensurePaper();
  const paths = nodeSubpaths(node).filter((s) => s.points.length > 0).map((s) => subpathToPaper(s, node));
  if (paths.length === 0) return null;
  let item: any;
  if (paths.length === 1) {
    item = paths[0];
  } else {
    item = new paper.CompoundPath({ children: paths, insert: false });
    item.fillRule = node.fillRule ?? "nonzero";
  }
  item.transform(paperMatrix(nodeMatrix(page, node.id)));
  return item;
}

function collectPaths(item: any): any[] {
  if (!item) return [];
  if (item.className === "CompoundPath") return (item.children ?? []).filter((c: any) => c.className === "Path");
  if (item.className === "Path") return [item];
  const out: any[] = [];
  for (const child of item.children ?? []) out.push(...collectPaths(child));
  return out;
}

function normalizeHandles(p: VectorPoint, w: number, h: number, minX: number, minY: number): VectorPoint {
  const point: VectorPoint = { x: (p.x - minX) / w, y: (p.y - minY) / h };
  if (Math.abs(p.x) > 0.00001 || Math.abs(p.y) > 0.00001) {
    // handled below with explicit handles
  }
  return point;
}

function itemToSubpaths(item: any, simplifyTolerance = 0): { subpaths: VectorSubpath[]; bounds: { x: number; y: number; width: number; height: number } } {
  const paths = collectPaths(item);
  for (const path of paths) {
    if (simplifyTolerance > 0) path.simplify(simplifyTolerance);
  }
  const bounds = item.bounds ?? new paper.Rectangle(0, 0, 1, 1);
  const w = Math.max(bounds.width, 1);
  const h = Math.max(bounds.height, 1);
  const subpaths: VectorSubpath[] = [];
  for (const path of paths) {
    const points: VectorPoint[] = [];
    for (const seg of path.segments ?? []) {
      const p: VectorPoint = {
        x: (seg.point.x - bounds.x) / w,
        y: (seg.point.y - bounds.y) / h,
      };
      if (seg.handleIn && (seg.handleIn.x !== 0 || seg.handleIn.y !== 0)) {
        p.in = { x: (seg.point.x + seg.handleIn.x - bounds.x) / w, y: (seg.point.y + seg.handleIn.y - bounds.y) / h };
      }
      if (seg.handleOut && (seg.handleOut.x !== 0 || seg.handleOut.y !== 0)) {
        p.out = { x: (seg.point.x + seg.handleOut.x - bounds.x) / w, y: (seg.point.y + seg.handleOut.y - bounds.y) / h };
      }
      points.push(p);
    }
    if (points.length > 0) subpaths.push({ points, closed: !!path.closed });
  }
  return { subpaths, bounds: { x: bounds.x, y: bounds.y, width: w, height: h } };
}

function fillRuleOf(item: any): "nonzero" | "evenodd" {
  return item?.fillRule === "evenodd" ? "evenodd" : "nonzero";
}

export function pathfinder(page: Page, nodes: SceneNode[], kind: PathfinderKind): SceneNode | null {
  ensurePaper();
  const items = nodes.map((n) => nodeToPaper(page, n)).filter(Boolean);
  if (items.length === 0) return null;
  const baseNode = nodes[0];
  let result = items[0];
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    if (kind === "union") result = result.unite(item);
    else if (kind === "subtract") result = result.subtract(item);
    else if (kind === "intersect") result = result.intersect(item);
    else result = result.exclude(item);
    if (!result) return null;
  }
  result.fillRule = baseNode.fillRule ?? "nonzero";
  result.reorient?.(true, true);
  const parentId = nodes.every((n) => n.parentId === baseNode.parentId) ? baseNode.parentId : null;
  if (parentId) {
    const parent = page.nodes[parentId];
    if (parent) {
      const m = paperMatrix(nodeMatrix(page, parent.id)).invert();
      result.transform(m);
    }
  }
  const { subpaths, bounds } = itemToSubpaths(result, 0.15);
  if (subpaths.length === 0) return null;
  const node = createNode("vector", {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    name: kind[0].toUpperCase() + kind.slice(1),
    fill: baseNode.fill,
    stroke: baseNode.stroke,
    strokeWidth: baseNode.strokeWidth,
    fillRule: baseNode.fillRule ?? "nonzero",
    parentId,
  });
  Object.assign(node, subpathPatch(subpaths));
  return node;
}

export function combineVectors(page: Page, nodes: SceneNode[]): SceneNode | null {
  ensurePaper();
  const items = nodes.map((n) => nodeToPaper(page, n)).filter(Boolean);
  if (items.length === 0) return null;
  const paths: any[] = [];
  for (const item of items) paths.push(...collectPaths(item));
  if (paths.length === 0) return null;
  const compound = new paper.CompoundPath({ children: paths, insert: false });
  compound.fillRule = nodes[0].fillRule ?? "nonzero";
  const base = nodes[0];
  const parentId = nodes.every((n) => n.parentId === base.parentId) ? base.parentId : null;
  if (parentId) {
    const parent = page.nodes[parentId];
    if (parent) compound.transform(paperMatrix(nodeMatrix(page, parent.id)).invert());
  }
  const { subpaths, bounds } = itemToSubpaths(compound);
  const node = createNode("vector", {
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    name: "Combined path", fill: base.fill, stroke: base.stroke, strokeWidth: base.strokeWidth,
    fillRule: base.fillRule ?? "nonzero", parentId,
  });
  Object.assign(node, subpathPatch(subpaths));
  return node;
}

export function splitCompound(node: SceneNode): SceneNode[] {
  return vectorSubpaths(node).map((sub, index) => {
    const next = createNode("vector", {
      x: node.x, y: node.y, width: node.width, height: node.height,
      name: `${node.name} ${index + 1}`, fill: node.fill, stroke: node.stroke,
      strokeWidth: node.strokeWidth, fillRule: node.fillRule ?? "nonzero",
      parentId: node.parentId,
    });
    Object.assign(next, subpathPatch([sub]));
    return next;
  });
}

function flattenSubpath(sub: VectorSubpath, node: SceneNode): { pts: { x: number; y: number }[]; closed: boolean } {
  const path = subpathToPaper(sub, node);
  path.flatten(0.5);
  const pts = path.segments.map((s: any) => ({ x: s.point.x, y: s.point.y }));
  if (sub.closed && pts.length > 1) pts.pop();
  return { pts, closed: sub.closed };
}

function clipperOffset(subpaths: VectorSubpath[], node: SceneNode, delta: number): { subpaths: VectorSubpath[]; minX: number; minY: number; width: number; height: number } | null {
  ensurePaper();
  const scale = 100;
  const co = new ClipperLib.ClipperOffset(2, 0.25);
  for (const sub of subpaths) {
    const flat = flattenSubpath(sub, node);
    if (flat.pts.length < 2) continue;
    const path = flat.pts.map((p) => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) }));
    co.AddPath(path, ClipperLib.JoinType.jtRound, flat.closed ? ClipperLib.EndType.etClosedPolygon : ClipperLib.EndType.etOpenRound);
  }
  const solution: any[] = [];
  co.Execute(solution, delta * scale);
  if (!solution.length) return null;
  const all = solution.map((path: any[]) => path.map((p: any) => ({ x: p.X / scale, y: p.Y / scale })));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of all) for (const p of path) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  return {
    subpaths: all.map((path) => ({
      closed: true,
      points: path.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h })),
    })),
    minX, minY, width: w, height: h,
  };
}

export function offsetVector(node: SceneNode, delta: number): SceneNode | null {
  ensurePaper();
  const result = clipperOffset(vectorSubpaths(node), node, delta);
  if (!result?.subpaths.length) return null;
  const next = createNode("vector", {
    x: node.x + result.minX, y: node.y + result.minY, width: result.width, height: result.height,
    name: `${node.name} offset`, fill: node.fill, stroke: node.stroke, strokeWidth: node.strokeWidth,
    fillRule: "nonzero", parentId: node.parentId,
  });
  // clipper output is in the node's local pixel space.
  Object.assign(next, subpathPatch(result.subpaths));
  return next;
}

export function outlineStroke(node: SceneNode): SceneNode | null {
  const width = Math.max(node.strokeWidth, 0.1);
  const expanded = clipperOffset(vectorSubpaths(node), node, width / 2);
  if (!expanded?.subpaths.length) return null;
  const next = createNode("vector", {
    x: node.x + expanded.minX, y: node.y + expanded.minY, width: expanded.width, height: expanded.height,
    name: `${node.name} outline`, fill: node.stroke ?? node.fill ?? { type: "solid", color: "#0ea5e9" },
    stroke: null, strokeWidth: 0, fillRule: "nonzero", parentId: node.parentId,
  });
  Object.assign(next, subpathPatch(expanded.subpaths));
  return next;
}

export function simplifyVector(node: SceneNode, tolerance = 0.5): SceneNode | null {
  ensurePaper();
  const item = nodeToPaperWithOwnParent(node);
  if (!item) return null;
  const { subpaths, bounds } = itemToSubpaths(item, tolerance);
  if (!subpaths.length) return null;
  const next = createNode("vector", {
    x: node.x + bounds.x, y: node.y + bounds.y, width: bounds.width, height: bounds.height,
    name: `${node.name} simplified`, fill: node.fill, stroke: node.stroke, strokeWidth: node.strokeWidth,
    fillRule: node.fillRule ?? "nonzero", parentId: node.parentId,
  });
  Object.assign(next, subpathPatch(subpaths));
  return next;
}

function nodeToPaperWithOwnParent(node: SceneNode): any {
  ensurePaper();
  const paths = vectorSubpaths(node).map((s) => subpathToPaper(s, node));
  if (!paths.length) return null;
  if (paths.length === 1) return paths[0];
  const cp = new paper.CompoundPath({ children: paths, insert: false });
  cp.fillRule = node.fillRule ?? "nonzero";
  return cp;
}

export async function svgToNodes(svg: string, name = "SVG"): Promise<SceneNode[]> {
  ensurePaper();
  const imported = paper.project.importSVG(svg, { expandShapes: true, insert: false });
  const leaves: any[] = [];
  const walk = (item: any) => {
    if (!item) return;
    if (item.className === "Path" || item.className === "CompoundPath") leaves.push(item);
    else for (const child of item.children ?? []) walk(child);
  };
  walk(imported);
  const out: SceneNode[] = [];
  for (const leaf of leaves) {
    const { subpaths, bounds } = itemToSubpaths(leaf);
    if (!subpaths.length) continue;
    const fill = paintFromPaper(leaf);
    const stroke = leaf.strokeColor ? { type: "solid" as const, color: hex(leaf.strokeColor) ?? "#111827" } : null;
    const node = createNode("vector", {
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      name: leaf.name || name,
      fill,
      stroke,
      strokeWidth: leaf.strokeWidth || 1,
      fillRule: fillRuleOf(leaf),
      opacity: typeof leaf.opacity === "number" ? leaf.opacity : 1,
    });
    Object.assign(node, subpathPatch(subpaths));
    out.push(node);
  }
  imported.remove();
  return out;
}

export async function traceImage(src: string, target: SceneNode, name = "Traced image"): Promise<SceneNode[]> {
  const svg = await new Promise<string>((resolve, reject) => {
    try {
      ImageTracer.imageToSVG(src, (result: string) => resolve(result), {
        numberofcolors: 8,
        pathomit: 12,
        ltres: 1,
        qtres: 1,
        rightangleenhance: false,
      });
    } catch (e) {
      reject(e);
    }
  });
  const nodes = await svgToNodes(svg, name);
  const img = await loadImage(src);
  const sx = target.width / Math.max(img.naturalWidth || img.width, 1);
  const sy = target.height / Math.max(img.naturalHeight || img.height, 1);
  for (const node of nodes) {
    node.x = target.x + node.x * sx;
    node.y = target.y + node.y * sy;
    node.width *= sx;
    node.height *= sy;
    node.name = `${name} ${node.name}`.trim();
  }
  return nodes;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for tracing"));
    img.src = src;
  });
}
