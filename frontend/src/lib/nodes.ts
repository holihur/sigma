import type { Bounds, NodeType, Page, Paint, Point, SceneNode, Shadow, SigmaDoc } from "./types";
import { hexToRgba, uid } from "./utils";

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const hex = (c: string) => c;

export function createNode(type: NodeType, overrides: Partial<SceneNode> = {}): SceneNode {
  const base: SceneNode = {
    id: uid(type.slice(0, 2)),
    type,
    name: labelFor(type),
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { type: "solid", color: "#0ea5e9" },
    stroke: null,
    strokeWidth: 1,
    radius: 0,
    shadow: null,
    blur: 0,
    children: [],
    parentId: null,
    clip: false,
    text: "",
    fontSize: 16,
    fontFamily: "Inter Variable",
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
    textAlign: "left",
    verticalAlign: "top",
    src: "",
    objectFit: "cover",
    link: null,
    points: [],
    closed: false,
    component: false,
    componentId: null,
    ts: Date.now(),
  };
  switch (type) {
    case "frame":
      base.fill = { type: "solid", color: "#ffffff" };
      base.clip = true;
      base.width = 390;
      base.height = 844;
      break;
    case "group":
      base.fill = null;
      base.x = 0;
      base.y = 0;
      base.width = 0;
      base.height = 0;
      break;
    case "ellipse":
      base.fill = { type: "solid", color: "#f97316" };
      base.radius = 9999;
      break;
    case "text":
      base.fill = { type: "solid", color: "#111827" };
      base.text = "Text";
      base.fontSize = 24;
      base.width = 220;
      base.height = 36;
      break;
    case "image":
      base.fill = { type: "solid", color: "#e5e7eb" };
      base.width = 320;
      base.height = 220;
      break;
    case "line":
      base.fill = null;
      base.stroke = { type: "solid", color: "#111827" };
      base.strokeWidth = 2;
      base.height = 0;
      break;
    case "vector":
      base.fill = null;
      base.stroke = { type: "solid", color: "#0ea5e9" };
      base.strokeWidth = 2;
      base.width = 1;
      base.height = 1;
      break;
    case "rect":
      break;
  }
  return { ...base, ...overrides, ts: overrides.ts ?? Date.now() };
}

export function labelFor(type: NodeType): string {
  switch (type) {
    case "frame":
      return "Frame";
    case "group":
      return "Group";
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "line":
      return "Line";
    case "vector":
      return "Vector";
    case "text":
      return "Text";
    case "image":
      return "Image";
  }
}

export function paintToCss(paint: Paint | null | undefined, fallback = "transparent"): string {
  if (!paint) return fallback;
  if (paint.type === "solid") {
    return paint.opacity !== undefined && paint.opacity < 1
      ? hexToRgba(paint.color, paint.opacity)
      : paint.color;
  }
  const stops = [...paint.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${Math.round(s.position * 100)}%`)
    .join(", ");
  return `linear-gradient(${paint.angle}deg, ${stops})`;
}

export function shadowToCss(shadow: Shadow | null | undefined): string | undefined {
  if (!shadow) return undefined;
  return `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`;
}

export function getPage(doc: SigmaDoc, pageId: string): Page {
  return doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];
}

export function getNode(page: Page | undefined, id: string | null | undefined): SceneNode | null {
  if (!page || !id) return null;
  return page.nodes[id] ?? null;
}

export function ancestorsOf(page: Page, id: string): SceneNode[] {
  const out: SceneNode[] = [];
  let current = page.nodes[id];
  let guard = 0;
  while (current?.parentId && guard++ < 100) {
    const parent = page.nodes[current.parentId];
    if (!parent) break;
    out.push(parent);
    current = parent;
  }
  return out.reverse();
}

export function descendantsOf(page: Page, id: string, includeSelf = false): SceneNode[] {
  const out: SceneNode[] = [];
  const node = page.nodes[id];
  if (!node) return out;
  if (includeSelf) out.push(node);
  const walk = (n: SceneNode) => {
    for (const childId of n.children) {
      const child = page.nodes[childId];
      if (!child) continue;
      out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

export function isAncestorOf(page: Page, ancestorId: string, nodeId: string): boolean {
  let current = page.nodes[nodeId];
  let guard = 0;
  while (current?.parentId && guard++ < 100) {
    if (current.parentId === ancestorId) return true;
    current = page.nodes[current.parentId];
  }
  return false;
}

/** Filters out nodes whose ancestor is also selected, so dragging a group does not double-move. */
export function topLevelSelection(page: Page, ids: string[]): string[] {
  return ids.filter((id) => {
    if (!page.nodes[id]) return false;
    return !ids.some((other) => other !== id && isAncestorOf(page, other, id));
  });
}

// ---------- matrices ----------

export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function rotate(deg: number): Matrix {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return IDENTITY;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function matrixToCss(m: Matrix): string {
  return `matrix(${m.map((n) => Number(n.toFixed(6))).join(",")})`;
}

export function matrixAngle(m: Matrix): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI;
}

export function nodeMatrix(page: Page, id: string): Matrix {
  const node = page.nodes[id];
  if (!node) return IDENTITY;
  const parentMatrix = node.parentId ? nodeMatrix(page, node.parentId) : IDENTITY;
  const cx = node.width / 2;
  const cy = node.height / 2;
  const local = multiply(
    multiply(translate(node.x, node.y), translate(cx, cy)),
    multiply(rotate(node.rotation), translate(-cx, -cy)),
  );
  return multiply(parentMatrix, local);
}

export function nodeCorners(page: Page, node: SceneNode): Point[] {
  const m = nodeMatrix(page, node.id);
  return [
    applyMatrix(m, { x: 0, y: 0 }),
    applyMatrix(m, { x: node.width, y: 0 }),
    applyMatrix(m, { x: node.width, y: node.height }),
    applyMatrix(m, { x: 0, y: node.height }),
  ];
}

export function aabb(points: Point[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function nodeAABB(page: Page, node: SceneNode): Bounds {
  if (node.type === "group") {
    const kids = descendantsOf(page, node.id);
    if (kids.length === 0) {
      const m = nodeMatrix(page, node.id);
      const p = applyMatrix(m, { x: 0, y: 0 });
      return { x: p.x, y: p.y, width: 0, height: 0 };
    }
    return boundsOf(page, kids.map((k) => k.id));
  }
  return aabb(nodeCorners(page, node));
}

export function boundsOf(page: Page, ids: string[]): Bounds {
  const points: Point[] = [];
  for (const id of ids) {
    const node = page.nodes[id];
    if (!node) continue;
    const b = nodeAABB(page, node);
    points.push({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height });
  }
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return aabb(points);
}

/** Absolute bounds of a node's local rect (rotation ignored). Used for alignment + snapping. */
export function rectAABB(page: Page, node: SceneNode): Bounds {
  const m = nodeMatrix(page, node.id);
  return aabb([
    applyMatrix(m, { x: 0, y: 0 }),
    applyMatrix(m, { x: node.width, y: 0 }),
    applyMatrix(m, { x: node.width, y: node.height }),
    applyMatrix(m, { x: 0, y: node.height }),
  ]);
}

export function screenToWorld(vp: { x: number; y: number; zoom: number }, p: Point): Point {
  return { x: (p.x - vp.x) / vp.zoom, y: (p.y - vp.y) / vp.zoom };
}

export function worldToScreen(vp: { x: number; y: number; zoom: number }, p: Point): Point {
  return { x: p.x * vp.zoom + vp.x, y: p.y * vp.zoom + vp.y };
}

export function parentLocalPoint(page: Page, parentId: string | null, world: Point): Point {
  if (!parentId) return world;
  const m = nodeMatrix(page, parentId);
  return applyMatrix(invert(m), world);
}

/** Find the deepest frame under a world point (used when drawing/creating). */
export function frameAt(page: Page, world: Point, exclude: Set<string> = new Set()): SceneNode | null {
  let found: SceneNode | null = null;
  const walk = (id: string) => {
    const node = page.nodes[id];
    if (!node || !node.visible || exclude.has(id)) return;
    if (node.type === "frame") {
      const b = rectAABB(page, node);
      if (world.x >= b.x && world.x <= b.x + b.width && world.y >= b.y && world.y <= b.y + b.height) {
        found = node;
        for (const childId of node.children) walk(childId);
      }
    } else if (node.type === "group") {
      for (const childId of node.children) walk(childId);
    }
  };
  for (const id of page.rootIds) walk(id);
  return found;
}

export function hitTest(page: Page, world: Point): SceneNode | null {
  let found: SceneNode | null = null;
  const walk = (id: string) => {
    const node = page.nodes[id];
    if (!node || !node.visible || node.locked) return;
    const b = rectAABB(page, node);
    if (world.x < b.x || world.x > b.x + b.width || world.y < b.y || world.y > b.y + b.height) return;
    if (node.type === "group") {
      for (const childId of node.children) walk(childId);
      if (!found) found = node;
      return;
    }
    found = node;
    for (const childId of node.children) walk(childId);
  };
  for (const id of page.rootIds) walk(id);
  return found;
}

export function nodeLabel(node: SceneNode): string {
  if (node.type === "text" && node.text.trim()) return node.text.trim().slice(0, 24);
  return node.name;
}

export const FONT_FAMILIES = [
  "Inter Variable",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "system-ui",
];

export const FONT_WEIGHTS = [
  { label: "Thin", value: 100 },
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "Semibold", value: 600 },
  { label: "Bold", value: 700 },
  { label: "Black", value: 900 },
];

export function defaultGradient(): Paint {
  return {
    type: "linear",
    angle: 135,
    stops: [
      { color: "#0ea5e9", position: 0 },
      { color: "#f472b6", position: 1 },
    ],
  };
}

export function clonePaint(paint: Paint | null): Paint | null {
  if (!paint) return null;
  return JSON.parse(JSON.stringify(paint)) as Paint;
}

export const COLORS = ["#111827", "#ffffff", "#7c5cff", "#3b82f6", "#06b6d4", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899"];

export { hex };
