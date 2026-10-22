import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BringToFront,
  Clipboard,
  Copy,
  Component as ComponentIcon,
  Group as GroupIcon,
  Image as ImageIcon,
  RefreshCw,
  Unlink,
  Layers,
  MessageCircle,
  Play,
  SendToBack,
  Trash2,
  Ungroup,
} from "lucide-react";
import type {
  Bounds,
  Comment,
  Guide,
  Page,
  Point,
  PresenceUser,
  SceneNode,
  Tool,
  Viewport,
} from "@/lib/types";
import {
  ancestorsOf,
  boundsOf,
  createNode,
  descendantsOf,
  frameAt,
  getPage,
  hitTest,
  matrixAngle,
  nodeAABB,
  nodeMatrix,
  parentLocalPoint,
  screenToWorld,
  topLevelSelection,
} from "@/lib/nodes";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { uploadImage } from "@/lib/api";
import { clamp, cn, isEditableTarget, uid } from "@/lib/utils";
import { NodeView } from "./NodeView";
import { SelectionOverlay, type ResizeHandle } from "./SelectionOverlay";

type DragState =
  | { kind: "pan"; startScreen: Point; startViewport: Viewport }
  | {
      kind: "move";
      startScreen: Point;
      startWorld: Point;
      ids: string[];
      initialBounds: Bounds;
      targets: Bounds[];
      applied: Point;
      moved: boolean;
      history: boolean;
    }
  | {
      kind: "marquee";
      startWorld: Point;
      startScreen: Point;
      additive: boolean;
      moved: boolean;
    }
  | {
      kind: "resize";
      nodeId: string;
      handle: ResizeHandle;
      start: SceneNode;
      startWorld: Point;
      totalAngle: number;
      moved: boolean;
    }
  | {
      kind: "rotate";
      nodeId: string;
      center: Point;
      startAngle: number;
      startRotation: number;
      moved: boolean;
    }
  | {
      kind: "create";
      tool: Tool;
      nodeId: string;
      startWorld: Point;
      startLocal: Point;
      parentId: string | null;
      moved: boolean;
    }
  | {
      kind: "vector-point";
      nodeId: string;
      index: number;
      start: SceneNode;
      moved: boolean;
    };

interface CanvasProps {
  page: Page;
  tool: Tool;
  viewport: Viewport;
  selection: string[];
  editingId: string | null;
  readOnly: boolean;
  comments: Comment[];
  collaborators: PresenceUser[];
  selfUserId?: string;
  activeCommentId?: string | null;
  onCursorMove?: (point: Point) => void;
  onCommentClick?: (comment: Comment) => void;
  onCreateComment?: (point: Point, text: string) => void;
}

export function Canvas({
  page,
  tool,
  viewport,
  selection,
  editingId,
  readOnly,
  comments,
  collaborators,
  selfUserId,
  activeCommentId,
  onCursorMove,
  onCommentClick,
  onCreateComment,
}: CanvasProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const pointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ startDist: number; startCenter: Point; startViewport: Viewport } | null>(null);
  const suppressRef = useRef(false);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [cursor, setCursor] = useState<"default" | "grab" | "grabbing" | "crosshair">("default");
  const [spaceDown, setSpaceDown] = useState(false);
  const [draft, setDraft] = useState<{ world: Point; text: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [imagePending, setImagePending] = useState<{ point: Point; replaceId?: string } | null>(null);
  const hoveredId = useEditor((s) => s.hoveredId);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const penRef = useRef<{ nodeId: string; points: Point[]; parentId: string | null; history: boolean } | null>(null);
  const lastPenClick = useRef<{ time: number; screen: Point } | null>(null);
  const lastCursorSent = useRef(0);
  const hoverFrame = useRef<number | null>(null);

  const store = useEditor;
  const pageId = page.id;
  const rootNodes = page.rootIds.map((id) => page.nodes[id]).filter(Boolean);
  const selectedSet = new Set(selection);

  // ---------- coordinate helpers ----------
  const rect = () => containerRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = rect();
    return screenToWorld(viewport, { x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const toScreen = (p: Point): Point => ({ x: p.x * viewport.zoom + viewport.x, y: p.y * viewport.zoom + viewport.y });

  // ---------- cursor presence ----------
  const reportCursor = useCallback(
    (world: Point) => {
      if (!onCursorMove) return;
      const now = performance.now();
      if (now - lastCursorSent.current < 45) return;
      lastCursorSent.current = now;
      onCursorMove(world);
    },
    [onCursorMove],
  );

  // ---------- wheel zoom / pan ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0022);
        store.getState().zoomAt(factor, { x: e.clientX - r.left, y: e.clientY - r.top }, { width: r.width, height: r.height });
      } else {
        const vp = store.getState().viewport;
        store.getState().setViewport({ ...vp, x: vp.x - e.deltaX, y: vp.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store]);

  // ---------- two-finger pinch zoom / pan ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size >= 2) {
        const pts = Array.from(pointersRef.current.values()).slice(0, 2);
        const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        pinchRef.current = {
          startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1,
          startCenter: center,
          startViewport: { ...store.getState().viewport },
        };
        suppressRef.current = true;
        dragRef.current = null;
        setMarquee(null);
        setGuides([]);
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (!pinch || pointersRef.current.size < 2) return;
      const pts = Array.from(pointersRef.current.values()).slice(0, 2);
      const r = el.getBoundingClientRect();
      const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const zoom = clamp(pinch.startViewport.zoom * (dist / pinch.startDist), 0.02, 8);
      const screenCenter = { x: center.x - r.left, y: center.y - r.top };
      const world = {
        x: (pinch.startCenter.x - r.left - pinch.startViewport.x) / pinch.startViewport.zoom,
        y: (pinch.startCenter.y - r.top - pinch.startViewport.y) / pinch.startViewport.zoom,
      };
      store.getState().setViewport({
        zoom,
        x: screenCenter.x - world.x * zoom,
        y: screenCenter.y - world.y * zoom,
      });
      e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) suppressRef.current = false;
    };
    el.addEventListener("pointerdown", down, { capture: true });
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down, { capture: true } as EventListenerOptions);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [store]);

  // ---------- space to pan ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.code === "Space") {
        spaceRef.current = true;
        setSpaceDown(true);
        if (!dragRef.current) setCursor("grab");
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceDown(false);
        if (!dragRef.current) setCursor("default");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (dragRef.current) return;
    if (tool === "hand") setCursor("grab");
    else if (tool === "select" || tool === "comment") setCursor(tool === "comment" ? "crosshair" : "default");
    else setCursor("crosshair");
  }, [tool]);

  // ---------- hover ----------
  const handleHover = (e: React.PointerEvent) => {
    if (dragRef.current) return;
    if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const nodeEl = el?.closest("[data-node-id]") as HTMLElement | null;
      const id = nodeEl?.dataset.nodeId ?? null;
      if (store.getState().hoveredId !== id) store.getState().setHovered(id);
    });
    if (tool === "select") reportCursor(worldPoint(e));
  };

  useEffect(() => {
    if (tool !== "select") store.getState().setHovered(null);
  }, [tool, store]);

  // ---------- window gesture handling ----------
  const beginGesture = (onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) => {
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // ---------- vector pen ----------
  const updatePenPoints = (points: Point[], parentId: string | null) => {
    const pen = penRef.current;
    if (!pen) return;
    const local = points.map((p) => parentLocalPoint(page, parentId, p));
    const minX = Math.min(...local.map((p) => p.x));
    const minY = Math.min(...local.map((p) => p.y));
    const maxX = Math.max(...local.map((p) => p.x));
    const maxY = Math.max(...local.map((p) => p.y));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const normalized = local.map((p) => ({ x: (p.x - minX) / width, y: (p.y - minY) / height }));
    store.getState().updateNode(pen.nodeId, { x: minX, y: minY, width, height, points: normalized }, false);
  };

  const finishPen = (closed: boolean) => {
    const pen = penRef.current;
    penRef.current = null;
    lastPenClick.current = null;
    if (!pen) return;
    const st = store.getState();
    const node = getPage(st.doc, pageId).nodes[pen.nodeId];
    if (!node) return;
    if (pen.points.length < 2) {
      st.select([pen.nodeId]);
      st.deleteSelection();
      st.setTool("select");
      return;
    }
    st.updateNode(pen.nodeId, {
      closed,
      fill: closed ? node.fill ?? { type: "solid", color: "#0ea5e9" } : null,
      name: node.name === "Vector" ? "Vector" : node.name,
    }, false);
    st.select([pen.nodeId]);
    st.setTool("select");
  };

  const onPenClick = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const world = worldPoint(e);
    const screen = screenPoint(e);
    const now = performance.now();
    const last = lastPenClick.current;
    if (last && now - last.time < 320 && Math.hypot(screen.x - last.screen.x, screen.y - last.screen.y) < 8) {
      finishPen(false);
      return;
    }
    lastPenClick.current = { time: now, screen };
    const pen = penRef.current;
    if (!pen) {
      const parent = frameAt(page, world);
      const local = parentLocalPoint(page, parent?.id ?? null, world);
      store.getState().pushHistory();
      const node = createNode("vector", {
        x: local.x,
        y: local.y,
        width: 1,
        height: 1,
        points: [{ x: 0, y: 0 }],
        name: "Vector",
      });
      store.getState().addNode(node, parent?.id ?? null, undefined, false);
      penRef.current = { nodeId: node.id, points: [world], parentId: parent?.id ?? null, history: true };
      return;
    }
    const first = toScreen(pen.points[0]);
    if (pen.points.length >= 2 && Math.hypot(screen.x - first.x, screen.y - first.y) < 12) {
      finishPen(true);
      return;
    }
    const points = [...pen.points, world];
    pen.points = points;
    updatePenPoints(points, pen.parentId);
  };

  useEffect(() => {
    if (tool !== "vector" && penRef.current) finishPen(false);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!penRef.current || isEditableTarget(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        finishPen(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        finishPen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

  // ---------- background pointer down ----------
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (suppressRef.current) return;
    const touchPan = e.pointerType === "touch" && tool === "select";
    if (e.button === 1 || spaceRef.current || tool === "hand" || touchPan) {
      e.preventDefault();
      const start = screenPoint(e);
      const startViewport = { ...store.getState().viewport };
      dragRef.current = { kind: "pan", startScreen: start, startViewport };
      setCursor("grabbing");
      beginGesture(
        (ev) => {
          if (suppressRef.current) return;
          const p = screenPoint(ev);
          store.getState().setViewport({ ...startViewport, x: startViewport.x + p.x - start.x, y: startViewport.y + p.y - start.y });
        },
        () => {
          dragRef.current = null;
          setCursor(spaceRef.current ? "grab" : "default");
        },
      );
      return;
    }
    if (e.button !== 0) return;

    const world = worldPoint(e);
    setContextMenu(null);

    if (readOnly && tool !== "comment") {
      if (tool === "select") store.getState().select([]);
      return;
    }

    if (tool === "vector") {
      onPenClick(e);
      return;
    }

    if (tool === "comment") {
      setDraft({ world, text: "" });
      requestAnimationFrame(() => draftRef.current?.focus());
      return;
    }

    if (tool === "select") {
      const additive = e.shiftKey;
      dragRef.current = { kind: "marquee", startWorld: world, startScreen: screenPoint(e), additive, moved: false };
      setMarquee({ x: world.x, y: world.y, width: 0, height: 0 });
      beginGesture(
        (ev) => {
          if (suppressRef.current) return;
          const d = dragRef.current;
          if (!d || d.kind !== "marquee") return;
          const now = worldPoint(ev);
          const b = normalizeRect(d.startWorld, now);
          if (!d.moved && Math.hypot(now.x - d.startWorld.x, now.y - d.startWorld.y) * viewport.zoom > 3) d.moved = true;
          setMarquee(b);
        },
        (ev) => {
          const d = dragRef.current;
          dragRef.current = null;
          setMarquee(null);
          if (!d || d.kind !== "marquee") return;
          if (!d.moved) {
            if (readOnly) store.getState().select([], d.additive);
            else store.getState().select([], d.additive);
            return;
          }
          const now = worldPoint(ev);
          const box = normalizeRect(d.startWorld, now);
          const hits: string[] = [];
          for (const node of Object.values(page.nodes) as SceneNode[]) {
            if (!node.visible || node.locked) continue;
            const b = nodeAABB(page, node);
            if (intersects(b, box)) hits.push(node.id);
          }
          const top = topLevelSelection(page, hits);
          store.getState().select(top, d.additive);
        },
      );
      return;
    }

    if (tool === "image") {
      setImagePending({ point: world });
      imageInputRef.current?.click();
      return;
    }

    if (tool === "text") {
      store.getState().pushHistory();
      const parent = frameAt(page, world);
      const local = parentLocalPoint(page, parent?.id ?? null, world);
      const node = createNode("text", {
        x: local.x,
        y: local.y,
        width: 220,
        height: 36,
        text: "Text",
        fontSize: 24,
        name: "Text",
      });
      store.getState().addNode(node, parent?.id ?? null, undefined, false);
      store.getState().setEditingId(node.id);
      store.getState().setTool("select");
      return;
    }

    // Shape / frame / line creation.
    const parent = tool === "frame" ? frameAt(page, world) : frameAt(page, world);
    const local = parentLocalPoint(page, parent?.id ?? null, world);
    store.getState().pushHistory();
    const node = createNode(tool as "frame" | "rect" | "ellipse" | "line", {
      x: local.x,
      y: local.y,
      width: 1,
      height: tool === "line" ? 0 : 1,
    });
    if (tool === "frame") {
      node.name = "Frame";
      node.clip = true;
      node.fill = { type: "solid", color: "#ffffff" };
    }
    if (tool === "line") {
      node.name = "Line";
    }
    store.getState().addNode(node, parent?.id ?? null, undefined, false);
    dragRef.current = {
      kind: "create",
      tool,
      nodeId: node.id,
      startWorld: world,
      startLocal: local,
      parentId: parent?.id ?? null,
      moved: false,
    };
    beginGesture(
      (ev) => {
        if (suppressRef.current) return;
        const d = dragRef.current;
        if (!d || d.kind !== "create") return;
        const now = worldPoint(ev);
        const cur = parentLocalPoint(page, d.parentId, now);
        const x = Math.min(d.startLocal.x, cur.x);
        const y = Math.min(d.startLocal.y, cur.y);
        const w = Math.abs(cur.x - d.startLocal.x);
        const h = Math.abs(cur.y - d.startLocal.y);
        if (!d.moved && (w > 0.5 || h > 0.5)) d.moved = true;
        store.getState().updateNode(
          d.nodeId,
          {
            x: d.tool === "line" ? d.startLocal.x : x,
            y: d.tool === "line" ? d.startLocal.y : y,
            width: Math.max(w, 1),
            height: d.tool === "line" ? Math.max(h, 0.5) : Math.max(h, 1),
          },
          false,
        );
      },
      () => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d || d.kind !== "create") return;
        const node = store.getState().doc.pages.find((p) => p.id === pageId)?.nodes[d.nodeId];
        if (node) {
          if (!d.moved || (node.width < 3 && Math.abs(node.height) < 3)) {
            if (d.tool === "frame") {
              store.getState().updateNode(d.nodeId, { width: 390, height: 844 }, false);
            } else if (d.tool === "line") {
              store.getState().updateNode(d.nodeId, { width: 120, height: 0 }, false);
            } else {
              store.getState().updateNode(d.nodeId, { width: 100, height: 100 }, false);
            }
          }
        }
        store.getState().setTool("select");
      },
    );
  };

  // ---------- node pointer down ----------
  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (suppressRef.current || e.button !== 0 || tool !== "select") return;
    e.preventDefault();
    const state = store.getState();
    const node = page.nodes[id];
    if (!node || node.locked) return;

    const groupAnc = ancestorsOf(page, id).find((n) => n.type === "group");
    const deep = e.metaKey || e.ctrlKey || e.altKey;
    const targetId = groupAnc && !deep ? groupAnc.id : id;
    let nextSelection = state.selection;
    if (e.shiftKey) {
      state.toggleSelect(targetId);
      return;
    } else if (!state.selection.includes(targetId)) {
      state.select([targetId]);
      nextSelection = [targetId];
    }
    if (readOnly) return;

    const selectedPage = getPage(store.getState().doc, pageId);
    const ids = topLevelSelection(selectedPage, nextSelection);
    if (ids.length === 0) return;
    const initialBounds = boundsOf(selectedPage, ids);
    const exclude = new Set<string>();
    for (const root of ids) {
      exclude.add(root);
      for (const d of descendantsOf(selectedPage, root)) exclude.add(d.id);
    }
    const targets: Bounds[] = [];
    for (const n of Object.values(selectedPage.nodes) as SceneNode[]) {
      if (!n.visible || exclude.has(n.id)) continue;
      targets.push(nodeAABB(selectedPage, n));
    }
    for (const id2 of selectedPage.rootIds) {
      const n = selectedPage.nodes[id2];
      if (n) targets.push(nodeAABB(selectedPage, n));
    }

    const startWorld = worldPoint(e);
    dragRef.current = {
      kind: "move",
      startScreen: screenPoint(e),
      startWorld,
      ids,
      initialBounds,
      targets,
      applied: { x: 0, y: 0 },
      moved: false,
      history: false,
    };
    beginGesture(
      (ev) => {
        if (suppressRef.current) return;
        const d = dragRef.current;
        if (!d || d.kind !== "move") return;
        const now = worldPoint(ev);
        const raw = { x: now.x - d.startWorld.x, y: now.y - d.startWorld.y };
        if (!d.moved) {
          if (Math.hypot(raw.x, raw.y) * viewport.zoom < 3) return;
          d.moved = true;
        }
        if (!d.history) {
          d.history = true;
          store.getState().pushHistory();
        }
        const proposed: Bounds = { ...d.initialBounds, x: d.initialBounds.x + raw.x, y: d.initialBounds.y + raw.y };
        const snap = computeSnap(proposed, d.targets, 6 / viewport.zoom);
        const total = { x: raw.x + snap.dx, y: raw.y + snap.dy };
        const inc = { x: total.x - d.applied.x, y: total.y - d.applied.y };
        d.applied = total;
        setGuides(snap.guides);
        if (inc.x !== 0 || inc.y !== 0) store.getState().translateSelection(inc.x, inc.y, false);
      },
      () => {
        dragRef.current = null;
        setGuides([]);
      },
    );
  };

  const onVectorAnchorStart = (e: React.PointerEvent, id: string, index: number) => {
    if (readOnly) return;
    const node = page.nodes[id];
    if (!node || node.type !== "vector") return;
    e.preventDefault();
    e.stopPropagation();
    const points = node.points ?? [];
    if (e.altKey) {
      if (points.length <= 2) {
        toast.error(t("A vector needs at least two points"));
        return;
      }
      store.getState().pushHistory();
      store.getState().updateNode(id, { points: points.filter((_, i) => i !== index) }, false);
      return;
    }
    store.getState().pushHistory();
    dragRef.current = { kind: "vector-point", nodeId: id, index, start: { ...node }, moved: false };
    beginGesture(
      (ev) => {
        if (suppressRef.current) return;
        const d = dragRef.current;
        if (!d || d.kind !== "vector-point") return;
        const local = parentLocalPoint(page, d.nodeId, worldPoint(ev));
        const x = clamp(local.x / Math.max(d.start.width, 1), 0, 1);
        const y = clamp(local.y / Math.max(d.start.height, 1), 0, 1);
        const next = (d.start.points ?? []).map((p, i) => (i === d.index ? { x, y } : p));
        d.moved = true;
        store.getState().updateNode(d.nodeId, { points: next }, false);
      },
      () => {
        dragRef.current = null;
      },
    );
  };

  const addVectorPoint = (node: SceneNode, world: Point) => {
    const local = parentLocalPoint(page, node.id, world);
    const nx = clamp(local.x / Math.max(node.width, 1), 0, 1);
    const ny = clamp(local.y / Math.max(node.height, 1), 0, 1);
    const points = [...(node.points ?? [])];
    if (points.some((p) => Math.hypot(p.x - nx, p.y - ny) < 0.025)) return;
    if (points.length < 2) {
      points.push({ x: nx, y: ny });
    } else {
      const segments = points.length + (node.closed ? 1 : 0);
      let best = points.length - 1;
      let bestDist = Infinity;
      for (let i = 0; i < segments; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = dx * dx + dy * dy;
        const t = len === 0 ? 0 : clamp(((nx - a.x) * dx + (ny - a.y) * dy) / len, 0, 1);
        const px = a.x + t * dx, py = a.y + t * dy;
        const dist = Math.hypot(nx - px, ny - py);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      points.splice(best + 1, 0, { x: nx, y: ny });
    }
    store.getState().pushHistory();
    store.getState().updateNode(node.id, { points }, false);
  };

  const onNodeDoubleClick = (e: React.MouseEvent, id: string) => {
    if (readOnly) return;
    const node = page.nodes[id];
    if (!node) return;
    if (node.type === "vector") {
      addVectorPoint(node, worldPoint(e));
      return;
    }
    if (node.type === "text") {
      store.getState().pushHistory();
      store.getState().select([id]);
      store.getState().setEditingId(id);
      return;
    }
    if (node.type === "image") {
      setImagePending({ point: nodeAABB(page, node), replaceId: id });
      imageInputRef.current?.click();
      return;
    }
    const world = worldPoint(e);
    const hit = hitTest(page, world);
    if (hit && hit.id !== id) {
      store.getState().select([hit.id]);
    }
  };

  // ---------- resize / rotate ----------
  const onResizeStart = (handle: ResizeHandle, e: React.PointerEvent) => {
    if (readOnly || selection.length !== 1) return;
    const node = page.nodes[selection[0]];
    if (!node || node.type === "group") return;
    store.getState().pushHistory();
    const totalAngle = matrixAngle(nodeMatrix(page, node.id));
    dragRef.current = {
      kind: "resize",
      nodeId: node.id,
      handle,
      start: { ...node },
      startWorld: worldPoint(e),
      totalAngle,
      moved: false,
    };
    beginGesture(
      (ev) => {
        if (suppressRef.current) return;
        const d = dragRef.current;
        if (!d || d.kind !== "resize") return;
        const now = worldPoint(ev);
        const dxWorld = now.x - d.startWorld.x;
        const dyWorld = now.y - d.startWorld.y;
        const rad = (-d.totalAngle * Math.PI) / 180;
        const dx = dxWorld * Math.cos(rad) - dyWorld * Math.sin(rad);
        const dy = dxWorld * Math.sin(rad) + dyWorld * Math.cos(rad);
        if (!d.moved && Math.hypot(dx, dy) * viewport.zoom < 2) return;
        d.moved = true;
        let { x, y, width, height } = d.start;
        const h = d.handle;
        if (h.includes("e")) width = d.start.width + dx;
        if (h.includes("w")) {
          width = d.start.width - dx;
          x = d.start.x + dx;
        }
        if (h.includes("s")) height = d.start.height + dy;
        if (h.includes("n")) {
          height = d.start.height - dy;
          y = d.start.y + dy;
        }
        if (d.start.type === "line" && (h === "e" || h === "w")) height = d.start.height;
        width = Math.max(width, d.start.type === "line" ? 1 : 2);
        height = Math.max(height, d.start.type === "line" ? 0 : 2);
        store.getState().updateNode(d.nodeId, { x, y, width, height }, false);
      },
      () => {
        dragRef.current = null;
      },
    );
  };

  const onRotateStart = (e: React.PointerEvent) => {
    if (readOnly || selection.length !== 1) return;
    const node = page.nodes[selection[0]];
    if (!node || node.type === "group") return;
    store.getState().pushHistory();
    const m = nodeMatrix(page, node.id);
    const center = { x: m[0] * (node.width / 2) + m[2] * (node.height / 2) + m[4], y: m[1] * (node.width / 2) + m[3] * (node.height / 2) + m[5] };
    const world = worldPoint(e);
    const startAngle = (Math.atan2(world.y - center.y, world.x - center.x) * 180) / Math.PI;
    dragRef.current = { kind: "rotate", nodeId: node.id, center, startAngle, startRotation: node.rotation, moved: false };
    beginGesture(
      (ev) => {
        if (suppressRef.current) return;
        const d = dragRef.current;
        if (!d || d.kind !== "rotate") return;
        const p = worldPoint(ev);
        const angle = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI;
        let next = d.startRotation + angle - d.startAngle;
        if (ev.shiftKey) next = Math.round(next / 15) * 15;
        d.moved = true;
        store.getState().updateNode(d.nodeId, { rotation: Math.round(next * 10) / 10 }, false);
      },
      () => {
        dragRef.current = null;
      },
    );
  };

  // ---------- image upload ----------
  const onImageChosen = async (file: File, pending: { point: Point; replaceId?: string }) => {
    try {
      const src = await uploadImage(file);
      const img = await loadImage(src);
      if (pending.replaceId) {
        store.getState().pushHistory();
        store.getState().updateNode(pending.replaceId, { src, objectFit: "cover" }, false);
      } else {
        store.getState().pushHistory();
        const parent = frameAt(page, pending.point);
        const local = parentLocalPoint(page, parent?.id ?? null, pending.point);
        const maxW = 640;
        const ratio = img.width / Math.max(img.height, 1);
        let width = Math.min(maxW, img.width || 320);
        let height = width / ratio;
        if (height > 640) {
          height = 640;
          width = height * ratio;
        }
        const node = createNode("image", {
          x: local.x - width / 2,
          y: local.y - height / 2,
          width,
          height,
          src,
          name: file.name.replace(/\.[^.]+$/, "") || "Image",
        });
        store.getState().addNode(node, parent?.id ?? null, undefined, false);
        store.getState().setTool("select");
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not upload image");
    }
  };

  // ---------- drop image ----------
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    const point = worldPoint(e);
    try {
      const src = await uploadImage(file);
      const img = await loadImage(src);
      store.getState().pushHistory();
      const parent = frameAt(page, point);
      const local = parentLocalPoint(page, parent?.id ?? null, point);
      const ratio = img.width / Math.max(img.height, 1);
      const width = Math.min(560, img.width || 320);
      const height = width / ratio;
      const node = createNode("image", {
        x: local.x - width / 2,
        y: local.y - height / 2,
        width,
        height,
        src,
        name: "Dropped image",
      });
      store.getState().addNode(node, parent?.id ?? null, undefined, false);
    } catch (err) {
      toast.error((err as Error).message || "Could not upload image");
    }
  };

  // ---------- comments ----------
  const unresolved = comments.filter((c) => c.pageId === pageId && !c.resolved);
  const submitDraft = () => {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) {
      setDraft(null);
      return;
    }
    onCreateComment?.(draft.world, text);
    setDraft(null);
    store.getState().setTool("select");
  };

  // ---------- context menu ----------
  const onNodeContextMenu = (e: React.MouseEvent, id: string) => {
    if (readOnly) return;
    const state = store.getState();
    if (!state.selection.includes(id)) state.select([id]);
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu]);

  const ctxNode = contextMenu ? page.nodes[contextMenu.nodeId] : null;

  // ---------- drag-to-select frame from layer panel (not used) ----------
  const onBackgroundDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select" || e.target !== e.currentTarget) return;
    const world = worldPoint(e);
    const hit = hitTest(page, world);
    if (hit) store.getState().select([hit.id]);
  };

  const gridSize = 24 * viewport.zoom;
  const showGrid = gridSize > 7;
  const cursorClass =
    cursor === "grab" ? "cursor-grab" : cursor === "grabbing" ? "cursor-grabbing" : cursor === "crosshair" ? "cursor-crosshair" : "cursor-default";

  const nodeCtx = {
    page,
    editable: !readOnly,
    interactive: true,
    tool,
    panMode: spaceDown || tool === "hand",
    zoom: viewport.zoom,
    selected: selectedSet,
    hoveredId,
    editingId,
    onPointerDown: onNodePointerDown,
    onDoubleClick: onNodeDoubleClick,
    onContextMenu: onNodeContextMenu,
    onTextChange: (id: string, text: string) => {
      if (readOnly) return;
      store.getState().updateNode(id, { text }, false);
    },
    onEditEnd: () => store.getState().setEditingId(null),
    onTextFocus: () => undefined,
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full touch-none overflow-hidden bg-canvas outline-none", cursorClass)}
      style={
        showGrid
          ? {
              backgroundImage: "radial-gradient(circle, var(--grid) 1px, transparent 1.2px)",
              backgroundSize: `${gridSize}px ${gridSize}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }
          : undefined
      }
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={handleHover}
      onDoubleClick={onBackgroundDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: "0 0" }}
      >
        {rootNodes.map((node) => (
          <NodeView key={node.id} node={node} ctx={nodeCtx} />
        ))}
      </div>

      <SelectionOverlay
        page={page}
        pageId={pageId}
        viewport={viewport}
        selection={selection}
        hoveredId={hoveredId}
        readOnly={readOnly}
        editing={!!editingId}
        guides={guides}
        marquee={marquee}
        collaborators={collaborators}
        selfUserId={selfUserId}
        onResizeStart={onResizeStart}
        onRotateStart={onRotateStart}
        onVectorAnchorStart={onVectorAnchorStart}
      />

      {/* comment pins */}
      {unresolved.map((comment, index) => {
        const p = toScreen(comment);
        return (
          <button
            key={comment.id}
            type="button"
            className={cn(
              "absolute z-40 flex size-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-sm bg-primary text-[10px] font-semibold text-primary-foreground shadow-md transition-transform hover:scale-110",
              activeCommentId === comment.id && "ring-2 ring-white/80",
            )}
            style={{ left: p.x, top: p.y, background: comment.color || undefined }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onCommentClick?.(comment)}
            title={`${comment.author}: ${comment.text}`}
          >
            {index + 1}
          </button>
        );
      })}

      {/* draft comment */}
      {draft && (
        <div
          className="absolute z-50 w-64 -translate-y-2 rounded-lg border border-border bg-popover p-2 shadow-2xl animate-pop"
          style={{ left: toScreen(draft.world).x, top: toScreen(draft.world).y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MessageCircle className="size-3" /> {t("New comment")}
          </div>
          <textarea
            ref={draftRef}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitDraft();
              e.stopPropagation();
            }}
            placeholder={t("Leave feedback…")}
            className="min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus:border-ring"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary" onClick={() => setDraft(null)}>
              {t("Cancel")}
            </button>
            <button className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground" onClick={submitDraft}>
              {t("Post")}
            </button>
          </div>
        </div>
      )}

      {/* context menu */}
      {contextMenu && ctxNode && (
        <div
          className="fixed z-[140] w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl animate-pop"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MenuRow
            icon={<Copy className="size-3.5" />}
            label={t("Duplicate")}
            shortcut="⌘D"
            onClick={() => {
              store.getState().select([ctxNode.id]);
              store.getState().duplicateSelection();
              setContextMenu(null);
            }}
          />
          <MenuRow
            icon={<Clipboard className="size-3.5" />}
            label={t("Copy")}
            shortcut="⌘C"
            onClick={() => {
              store.getState().select([ctxNode.id]);
              store.getState().copySelection();
              setContextMenu(null);
            }}
          />
          <div className="my-1 h-px bg-border" />
          {ctxNode.component ? (
            <MenuRow
              icon={<RefreshCw className="size-3.5" />}
              label={t("Update instances")}
              onClick={() => {
                const count = store.getState().syncInstances(ctxNode.id);
                toast.success(t("Updated {count} instances", { count }));
                setContextMenu(null);
              }}
            />
          ) : ctxNode.componentId ? (
            <MenuRow
              icon={<Unlink className="size-3.5" />}
              label={t("Detach instance")}
              onClick={() => {
                store.getState().detachInstance(ctxNode.id);
                setContextMenu(null);
              }}
            />
          ) : (
            <MenuRow
              icon={<ComponentIcon className="size-3.5" />}
              label={t("Create component")}
              onClick={() => {
                const id = store.getState().createComponent([ctxNode.id]);
                if (id) toast.success(t("Component created"));
                setContextMenu(null);
              }}
            />
          )}
          <MenuRow
            icon={<GroupIcon className="size-3.5" />}
            label={t("Group selection")}
            shortcut="⌘G"
            onClick={() => {
              const ok = store.getState().groupSelection();
              if (!ok) toast.error(t("Select layers with the same parent to group"));
              setContextMenu(null);
            }}
          />
          {ctxNode.type === "group" && (
            <MenuRow
              icon={<Ungroup className="size-3.5" />}
              label={t("Ungroup")}
              shortcut="⇧⌘G"
              onClick={() => {
                store.getState().ungroupSelection();
                setContextMenu(null);
              }}
            />
          )}
          <div className="my-1 h-px bg-border" />
          <MenuRow
            icon={<BringToFront className="size-3.5" />}
            label={t("Bring to front")}
            shortcut="]"
            onClick={() => {
              store.getState().reorderSelection("front");
              setContextMenu(null);
            }}
          />
          <MenuRow
            icon={<SendToBack className="size-3.5" />}
            label={t("Send to back")}
            shortcut="["
            onClick={() => {
              store.getState().reorderSelection("back");
              setContextMenu(null);
            }}
          />
          {ctxNode.type === "frame" && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuRow
                icon={<Play className="size-3.5" />}
                label={t("Play prototype")}
                onClick={() => {
                  store.getState().openPreview(ctxNode.id);
                  setContextMenu(null);
                }}
              />
            </>
          )}
          <div className="my-1 h-px bg-border" />
          <MenuRow
            icon={<Trash2 className="size-3.5" />}
            label={t("Delete")}
            shortcut="⌫"
            danger
            onClick={() => {
              store.getState().select([ctxNode.id]);
              store.getState().deleteSelection();
              setContextMenu(null);
            }}
          />
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && imagePending) onImageChosen(f, imagePending);
          e.target.value = "";
          setImagePending(null);
        }}
      />
    </div>
  );
}

function MenuRow({
  icon,
  label,
  shortcut,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none hover:bg-secondary",
        danger && "text-destructive",
      )}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {shortcut && <span className="ml-auto text-[10px] text-muted-foreground">{shortcut}</span>}
    </button>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

function normalizeRect(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function computeSnap(moving: Bounds, targets: Bounds[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  if (targets.length === 0) return { dx: 0, dy: 0, guides: [] };
  const guides: Guide[] = [];
  const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const movingY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
  let bestX: { diff: number; at: number; target: Bounds } | null = null;
  let bestY: { diff: number; at: number; target: Bounds } | null = null;
  for (const t of targets) {
    const tx = [t.x, t.x + t.width / 2, t.x + t.width];
    const ty = [t.y, t.y + t.height / 2, t.y + t.height];
    for (const mx of movingX) {
      for (const x of tx) {
        const diff = x - mx;
        if (Math.abs(diff) <= threshold && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff, at: x, target: t };
      }
    }
    for (const my of movingY) {
      for (const y of ty) {
        const diff = y - my;
        if (Math.abs(diff) <= threshold && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff, at: y, target: t };
      }
    }
  }
  if (bestX) {
    guides.push({
      orientation: "v",
      position: bestX.at,
      from: Math.min(moving.y + (bestY?.diff ?? 0), bestX.target.y),
      to: Math.max(moving.y + moving.height + (bestY?.diff ?? 0), bestX.target.y + bestX.target.height),
    });
  }
  if (bestY) {
    guides.push({
      orientation: "h",
      position: bestY.at,
      from: Math.min(moving.x + (bestX?.diff ?? 0), bestY.target.x),
      to: Math.max(moving.x + moving.width + (bestX?.diff ?? 0), bestY.target.x + bestY.target.width),
    });
  }
  return { dx: bestX?.diff ?? 0, dy: bestY?.diff ?? 0, guides };
}
