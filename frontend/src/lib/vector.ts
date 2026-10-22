import type { SceneNode, VectorHandle, VectorPoint, VectorSubpath } from "./types";

export const vectorPoint = (x: number, y: number): VectorPoint => ({ x, y });

export function hasHandles(p: VectorPoint): boolean {
  return !!(p.in || p.out);
}

export function vectorSubpaths(node: SceneNode): VectorSubpath[] {
  if (node.subpaths && node.subpaths.length > 0) return node.subpaths;
  return [{ points: node.points ?? [], closed: !!node.closed }];
}

export function subpathPatch(subpaths: VectorSubpath[]): Partial<SceneNode> {
  const first = subpaths[0] ?? { points: [], closed: false };
  return { subpaths, points: first.points, closed: first.closed };
}

export function allVectorPoints(node: SceneNode): { path: number; index: number; point: VectorPoint }[] {
  const out: { path: number; index: number; point: VectorPoint }[] = [];
  vectorSubpaths(node).forEach((sub, path) => sub.points.forEach((point, index) => out.push({ path, index, point })));
  return out;
}

export function vectorPathData(node: SceneNode, scale = 1000): string {
  const X = (v: number) => (v * scale).toFixed(3);
  const Y = (v: number) => (v * scale).toFixed(3);
  const point = (p: VectorPoint) => `${X(p.x)} ${Y(p.y)}`;
  let d = "";
  for (const sub of vectorSubpaths(node)) {
    const pts = sub.points;
    if (pts.length === 0) continue;
    d += `M ${point(pts[0])}`;
    const count = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a.out || b.in) {
        const c1 = a.out ?? a;
        const c2 = b.in ?? b;
        d += ` C ${X(c1.x)} ${Y(c1.y)}, ${X(c2.x)} ${Y(c2.y)}, ${point(b)}`;
      } else {
        d += ` L ${point(b)}`;
      }
    }
    if (sub.closed) d += " Z";
  }
  return d;
}

export function vectorPathD(points: VectorPoint[], closed: boolean, width: number, height: number): string {
  if (points.length === 0) return "";
  const point = (p: VectorPoint) => `${(p.x * width).toFixed(2)} ${(p.y * height).toFixed(2)}`;
  let d = `M ${point(points[0])}`;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a.out || b.in) {
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      d += ` C ${point(c1)}, ${point(c2)}, ${point(b)}`;
    } else {
      d += ` L ${point(b)}`;
    }
  }
  if (closed) d += " Z";
  return d;
}

export function movePoint(p: VectorPoint, x: number, y: number): VectorPoint {
  const dx = x - p.x;
  const dy = y - p.y;
  return {
    ...p,
    x,
    y,
    in: p.in ? { x: p.in.x + dx, y: p.in.y + dy } : undefined,
    out: p.out ? { x: p.out.x + dx, y: p.out.y + dy } : undefined,
  };
}

export function mirrorHandle(p: VectorPoint, moved: "in" | "out", handle: VectorHandle): VectorPoint {
  const other = moved === "in" ? "out" : "in";
  const dx = handle.x - p.x;
  const dy = handle.y - p.y;
  return { ...p, [moved]: handle, [other]: { x: p.x - dx, y: p.y - dy } };
}

/** Create a smooth tangent through the previous/next anchor. */
export function smoothPoint(points: VectorPoint[], index: number, closed: boolean): VectorPoint[] {
  if (points.length < 2) return points;
  const p = points[index];
  const prevIndex = index === 0 ? (closed ? points.length - 1 : 0) : index - 1;
  const nextIndex = index === points.length - 1 ? (closed ? 0 : points.length - 1) : index + 1;
  const prev = points[prevIndex];
  const next = points[nextIndex];
  let tx = next.x - prev.x;
  let ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  const dist = Math.min(Math.hypot(p.x - prev.x, p.y - prev.y), Math.hypot(next.x - p.x, next.y - p.y));
  const h = Math.max(dist * 0.33, 0.015);
  const out = { x: clamp01(p.x + tx * h), y: clamp01(p.y + ty * h) };
  const inHandle = { x: clamp01(p.x - tx * h), y: clamp01(p.y - ty * h) };
  const nextPoints = [...points];
  nextPoints[index] = { ...p, in: inHandle, out };
  return nextPoints;
}

export function cornerPoint(points: VectorPoint[], index: number): VectorPoint[] {
  const next = [...points];
  const p = next[index];
  next[index] = { x: p.x, y: p.y };
  return next;
}

function lerp(a: VectorHandle, b: VectorHandle, t: number): VectorHandle {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function insertPointOnVector(points: VectorPoint[], index: number, x: number, y: number, closed: boolean): { points: VectorPoint[]; index: number } {
  const nextIndex = index === points.length - 1 && !closed ? index : (index + 1) % points.length;
  if (nextIndex === index) {
    const out = [...points, { x: clamp01(x), y: clamp01(y) }];
    return { points: out, index: out.length - 1 };
  }
  const a = points[index];
  const b = points[nextIndex];
  const p0 = { x: a.x, y: a.y };
  const c1 = a.out ?? p0;
  const c2 = b.in ?? { x: b.x, y: b.y };
  const p1 = { x: b.x, y: b.y };
  const cubicAt = (t: number): VectorHandle => {
    const ab = lerp(p0, c1, t);
    const bc = lerp(c1, c2, t);
    const cd = lerp(c2, p1, t);
    const de = lerp(ab, bc, t);
    const ef = lerp(bc, cd, t);
    return lerp(de, ef, t);
  };
  let bestT = 0.5;
  let bestDist = Infinity;
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const sample = cubicAt(t);
    const d = Math.hypot(sample.x - x, sample.y - y);
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  const t = bestT;
  const ab = lerp(p0, c1, t);
  const bc = lerp(c1, c2, t);
  const cd = lerp(c2, p1, t);
  const de = lerp(ab, bc, t);
  const ef = lerp(bc, cd, t);
  const mid = lerp(de, ef, t);
  const a0 = { ...a, out: ab };
  const newPoint: VectorPoint = {
    x: clamp01(mid.x), y: clamp01(mid.y),
    in: de,
    out: ef,
  };
  const b1 = { ...b, in: cd };
  const out = [...points];
  out[index] = a0;
  out[nextIndex] = b1;
  out.splice(index + 1, 0, newPoint);
  return { points: out, index: index + 1 };
}

export function removePoint(points: VectorPoint[], index: number): VectorPoint[] {
  return points.filter((_, i) => i !== index);
}

export function canConvertToVector(node: SceneNode): boolean {
  return (node.type === "rect" || node.type === "ellipse" || node.type === "line") && node.children.length === 0;
}

const K = 0.2761423749153967;

export function shapeToVector(node: SceneNode): { points: VectorPoint[]; closed: boolean } {
  if (node.type === "ellipse") {
    return {
      closed: true,
      points: [
        { x: 0.5, y: 0, in: { x: 0.5 - K, y: 0 }, out: { x: 0.5 + K, y: 0 } },
        { x: 1, y: 0.5, in: { x: 1, y: 0.5 - K }, out: { x: 1, y: 0.5 + K } },
        { x: 0.5, y: 1, in: { x: 0.5 + K, y: 1 }, out: { x: 0.5 - K, y: 1 } },
        { x: 0, y: 0.5, in: { x: 0, y: 0.5 + K }, out: { x: 0, y: 0.5 - K } },
      ],
    };
  }
  if (node.type === "line") {
    return { closed: false, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] };
  }
  return {
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
