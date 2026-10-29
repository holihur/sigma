import React from "react";
import type { Bounds, Guide, Page, PresenceUser, SceneNode, Tool, Viewport } from "@/lib/types";
import {
  applyMatrix,
  boundsOf,
  nodeAABB,
  nodeMatrix,
  worldToScreen,
} from "@/lib/nodes";
import type { Point } from "@/lib/types";
import { vectorSubpaths } from "@/lib/vector";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  page: Page;
  pageId: string;
  viewport: Viewport;
  selection: string[];
  hoveredId: string | null;
  readOnly?: boolean;
  editing: boolean;
  tool?: Tool;
  guides?: Guide[];
  marquee?: Bounds | null;
  collaborators?: PresenceUser[];
  selfUserId?: string;
  onResizeStart?: (handle: ResizeHandle, event: React.PointerEvent) => void;
  onRotateStart?: (event: React.PointerEvent) => void;
  onVectorAnchorStart?: (event: React.PointerEvent, nodeId: string, index: number) => void;
  onVectorHandleStart?: (event: React.PointerEvent, nodeId: string, index: number, which: "in" | "out") => void;
  selectedPoint?: number | null;
}

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

function cornersFor(page: Page, node: SceneNode): Point[] {
  const m = nodeMatrix(page, node.id);
  return [
    applyMatrix(m, { x: 0, y: 0 }),
    applyMatrix(m, { x: node.width, y: 0 }),
    applyMatrix(m, { x: node.width, y: node.height }),
    applyMatrix(m, { x: 0, y: node.height }),
  ].map((p) => worldToScreen({ x: 0, y: 0, zoom: 1 }, p));
}

export function SelectionOverlay({
  page,
  pageId,
  viewport,
  selection,
  hoveredId,
  readOnly,
  editing,
  tool = "select",
  guides = [],
  marquee,
  collaborators = [],
  selfUserId,
  onResizeStart,
  onRotateStart,
  onVectorAnchorStart,
  onVectorHandleStart,
  selectedPoint,
}: Props) {
  const toScreen = (p: Point) => ({
    x: p.x * viewport.zoom + viewport.x,
    y: p.y * viewport.zoom + viewport.y,
  });

  const selected = selection.map((id) => page.nodes[id]).filter(Boolean);
  const single = selected.length === 1 ? selected[0] : null;
  const selectionBounds = selected.length ? boundsOf(page, selection) : null;
  const hovered = hoveredId ? page.nodes[hoveredId] : null;

  const target = single && single.type !== "group" ? single : null;
  let corners: Point[] | null = null;
  if (target) {
    const m = nodeMatrix(page, target.id);
    corners = [
      applyMatrix(m, { x: 0, y: 0 }),
      applyMatrix(m, { x: target.width, y: 0 }),
      applyMatrix(m, { x: target.width, y: target.height }),
      applyMatrix(m, { x: 0, y: target.height }),
    ].map(toScreen);
  }

  const box = selectionBounds
    ? {
        x: selectionBounds.x * viewport.zoom + viewport.x,
        y: selectionBounds.y * viewport.zoom + viewport.y,
        width: selectionBounds.width * viewport.zoom,
        height: selectionBounds.height * viewport.zoom,
      }
    : null;

  const showHandles = !readOnly && !!target && !editing && tool === "select";
  const vectorAnchors: Point[] = [];
  const vectorHandles: { point: Point; which: "in" | "out"; anchor: Point }[] = [];
  let flatPoints: { x: number; y: number; in?: { x: number; y: number }; out?: { x: number; y: number } }[] = [];
  if (!readOnly && !editing && tool === "select" && target?.type === "vector") {
    const m = nodeMatrix(page, target.id);
    flatPoints = vectorSubpaths(target).flatMap((sub) => sub.points);
    for (const p of flatPoints) {
      vectorAnchors.push(toScreen(applyMatrix(m, { x: p.x * target.width, y: p.y * target.height })));
    }
    const p = selectedPoint != null ? flatPoints[selectedPoint] : null;
    if (p) {
      const anchor = toScreen(applyMatrix(m, { x: p.x * target.width, y: p.y * target.height }));
      for (const which of ["in", "out"] as const) {
        const h = p[which];
        if (h) vectorHandles.push({ which, anchor, point: toScreen(applyMatrix(m, { x: h.x * target.width, y: h.y * target.height })) });
      }
    }
  }
  const handlePoints: { key: ResizeHandle; x: number; y: number }[] = [];
  if (corners) {
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    handlePoints.push(
      { key: "nw", ...corners[0] },
      { key: "n", ...mid(corners[0], corners[1]) },
      { key: "ne", ...corners[1] },
      { key: "e", ...mid(corners[1], corners[2]) },
      { key: "se", ...corners[2] },
      { key: "s", ...mid(corners[2], corners[3]) },
      { key: "sw", ...corners[3] },
      { key: "w", ...mid(corners[3], corners[0]) },
    );
  }

  // Rotation handle sits above the top edge, along the outward normal.
  let rotateHandle: Point | null = null;
  if (corners) {
    const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    const center = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
    const dx = topMid.x - center.x;
    const dy = topMid.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    rotateHandle = { x: topMid.x + (dx / len) * 22, y: topMid.y + (dy / len) * 22 };
  }

  const remote = collaborators.filter((c) => c.userId !== selfUserId && c.selection?.length);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {!editing && hovered && selection.length === 0 && (
          <HoverOutline page={page} node={hovered} toScreen={toScreen} />
        )}

        {corners && !editing && tool === "select" && (
          <polygon
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={readOnly ? "var(--muted-foreground)" : "var(--selection)"}
            strokeWidth={1.25}
          />
        )}

        {!corners && box && !editing && tool === "select" && (
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="none"
            stroke="var(--selection)"
            strokeWidth={1.25}
            strokeDasharray={selected.length > 1 ? "4 3" : undefined}
          />
        )}

        {showHandles &&
          handlePoints.map((h) => (
            <g
              key={h.key}
              style={{ pointerEvents: "auto", cursor: HANDLE_CURSORS[h.key] }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onResizeStart?.(h.key, e);
              }}
            >
              <rect x={h.x - 12} y={h.y - 12} width={24} height={24} fill="transparent" />
              <rect
                x={h.x - 4}
                y={h.y - 4}
                width={8}
                height={8}
                rx={1.5}
                fill="var(--card)"
                stroke="var(--selection)"
                strokeWidth={1.25}
                style={{ pointerEvents: "none" }}
              />
            </g>
          ))}

        {showHandles && rotateHandle && corners && (
          <>
            <line
              x1={(corners[0].x + corners[1].x) / 2}
              y1={(corners[0].y + corners[1].y) / 2}
              x2={rotateHandle.x}
              y2={rotateHandle.y}
              stroke="var(--selection)"
              strokeWidth={1}
            />
            <g
              style={{ pointerEvents: "auto", cursor: "grab" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onRotateStart?.(e);
              }}
            >
              <circle cx={rotateHandle.x} cy={rotateHandle.y} r={16} fill="transparent" />
              <circle cx={rotateHandle.x} cy={rotateHandle.y} r={5} fill="var(--card)" stroke="var(--selection)" strokeWidth={1.25} style={{ pointerEvents: "none" }} />
            </g>
          </>
        )}

        {vectorHandles.map((h) => (
          <g key={`handle-${h.which}`}>
            <line x1={h.anchor.x} y1={h.anchor.y} x2={h.point.x} y2={h.point.y} stroke="var(--selection)" strokeWidth={1} opacity={0.65} />
            <g
              style={{ pointerEvents: "auto", cursor: "crosshair" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onVectorHandleStart?.(e, target!.id, selectedPoint!, h.which);
              }}
            >
              <circle cx={h.point.x} cy={h.point.y} r={16} fill="transparent" />
              <circle cx={h.point.x} cy={h.point.y} r={4} fill="var(--card)" stroke="var(--selection)" strokeWidth={1.3} style={{ pointerEvents: "none" }} />
            </g>
          </g>
        ))}

        {vectorAnchors.map((p, i) => {
          const isActive = selectedPoint === i;
          return (
            <g
              key={`anchor-${i}`}
              style={{ pointerEvents: "auto", cursor: "move" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onVectorAnchorStart?.(e, target!.id, i);
              }}
            >
              <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
              <rect
                x={p.x - (isActive ? 4.5 : 3.5)}
                y={p.y - (isActive ? 4.5 : 3.5)}
                width={isActive ? 9 : 7}
                height={isActive ? 9 : 7}
                rx={1}
                fill={isActive ? "var(--selection)" : "var(--card)"}
                stroke="var(--selection)"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            </g>
          );
        })}

        {guides.map((g, i) =>
          g.orientation === "v" ? (
            <line
              key={i}
              x1={g.position * viewport.zoom + viewport.x}
              y1={g.from * viewport.zoom + viewport.y}
              x2={g.position * viewport.zoom + viewport.x}
              y2={g.to * viewport.zoom + viewport.y}
              stroke="#ff4d8d"
              strokeWidth={1}
            />
          ) : (
            <line
              key={i}
              x1={g.from * viewport.zoom + viewport.x}
              y1={g.position * viewport.zoom + viewport.y}
              x2={g.to * viewport.zoom + viewport.x}
              y2={g.position * viewport.zoom + viewport.y}
              stroke="#ff4d8d"
              strokeWidth={1}
            />
          ),
        )}

        {marquee && (
          <rect
            x={marquee.x * viewport.zoom + viewport.x}
            y={marquee.y * viewport.zoom + viewport.y}
            width={marquee.width * viewport.zoom}
            height={marquee.height * viewport.zoom}
            fill="color-mix(in oklch, var(--selection) 12%, transparent)"
            stroke="var(--selection)"
            strokeWidth={1}
          />
        )}

        {remote.map((user) => {
          const ids = (user.selection ?? []).filter((id) => page.nodes[id]);
          return ids.map((id) => {
            const node = page.nodes[id];
            const m = nodeMatrix(page, id);
            const pts = [
              applyMatrix(m, { x: 0, y: 0 }),
              applyMatrix(m, { x: node.width, y: 0 }),
              applyMatrix(m, { x: node.width, y: node.height }),
              applyMatrix(m, { x: 0, y: node.height }),
            ].map(toScreen);
            return (
              <polygon
                key={`${user.clientId}-${id}`}
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={user.color}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            );
          });
        })}
      </svg>

      {!editing && selectionBounds && (
        <div
          className="absolute -translate-x-1/2 rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium text-selection-foreground shadow-sm"
          style={{
            left: (selectionBounds.x + selectionBounds.width / 2) * viewport.zoom + viewport.x,
            top: (selectionBounds.y + selectionBounds.height) * viewport.zoom + viewport.y + 10,
            background: "var(--selection)",
            opacity: readOnly ? 0.75 : 1,
          }}
        >
          {Math.round(selectionBounds.width)} × {Math.round(selectionBounds.height)}
        </div>
      )}

      {/* Root frame labels */}
      {viewport.zoom > 0.4 &&
        page.rootIds
          .map((id) => page.nodes[id])
          .filter((n): n is SceneNode => !!n && n.type === "frame" && n.visible)
          .map((frame) => {
            const b = nodeAABB(page, frame);
            return (
              <div
                key={`label-${frame.id}`}
                className="absolute max-w-[220px] truncate text-[11px] font-medium"
                style={{
                  left: b.x * viewport.zoom + viewport.x,
                  top: b.y * viewport.zoom + viewport.y - 18,
                  color: selection.includes(frame.id) ? "var(--selection)" : "var(--muted-foreground)",
                }}
              >
                {frame.name}
              </div>
            );
          })}

      {remote.map((user) =>
        user.cursor ? (
          <div
            key={`cursor-${user.clientId}`}
            className="absolute z-40"
            style={{
              left: user.cursor.x * viewport.zoom + viewport.x,
              top: user.cursor.y * viewport.zoom + viewport.y,
              transform: "translate(-2px, -2px)",
            }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }}>
              <path d="M1 1 L14.5 9.5 L8.4 10.8 L5.6 18.5 Z" fill={user.color} stroke="white" strokeWidth="1" />
            </svg>
            <div
              className="mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ background: user.color }}
            >
              {user.name}
            </div>
          </div>
        ) : null,
      )}
      <span className="hidden">{pageId}</span>
    </div>
  );
}

function HoverOutline({ page, node, toScreen }: { page: Page; node: SceneNode; toScreen: (p: Point) => Point }) {
  const m = nodeMatrix(page, node.id);
  const pts = [
    applyMatrix(m, { x: 0, y: 0 }),
    applyMatrix(m, { x: node.width, y: 0 }),
    applyMatrix(m, { x: node.width, y: node.height }),
    applyMatrix(m, { x: 0, y: node.height }),
  ].map(toScreen);
  return (
    <polygon
      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke="var(--selection)"
      strokeWidth={1}
      opacity={0.7}
    />
  );
}
