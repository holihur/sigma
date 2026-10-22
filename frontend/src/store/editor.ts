import { create } from "zustand";
import type {
  Bounds,
  Comment,
  FileMeta,
  Page,
  Point,
  PresenceUser,
  SceneNode,
  SigmaDoc,
  Tool,
  Viewport,
} from "@/lib/types";
import { collectSubtree, instantiateSubtree, mergeDocs } from "@/lib/merge";
import {
  ancestorsOf,
  applyMatrix,
  descendantsOf,
  boundsOf,
  frameAt,
  getPage,
  isAncestorOf,
  matrixAngle,
  nodeAABB,
  nodeMatrix,
  topLevelSelection,
} from "@/lib/nodes";
import { clamp, uid } from "@/lib/utils";

type Clipboard = { roots: string[]; nodes: Record<string, SceneNode>; pageId: string };

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type ReorderMode = "front" | "back" | "forward" | "backward";
export type SyncStatus = "saved" | "saving" | "offline";

interface EditorState {
  file: FileMeta | null;
  doc: SigmaDoc;
  pageId: string;
  version: number;
  selection: string[];
  selectedPoint: number | null;
  hoveredId: string | null;
  tool: Tool;
  viewport: Viewport;
  past: SigmaDoc[];
  future: SigmaDoc[];
  editingId: string | null;
  clipboard: Clipboard | null;
  comments: Comment[];
  showComments: boolean;
  collaborators: PresenceUser[];
  dirty: boolean;
  saving: boolean;
  syncStatus: SyncStatus;
  lastSavedAt: number | null;
  changeSeq: number;
  syncSeq: number;
  previewOpen: boolean;
  previewFrameId: string | null;
  isReadOnly: boolean;
  loading: boolean;

  load: (file: FileMeta, doc: SigmaDoc, version: number) => void;
  reset: () => void;
  setFileMeta: (file: FileMeta) => void;
  setPage: (id: string) => void;
  setTool: (tool: Tool) => void;
  setViewport: (vp: Viewport) => void;
  zoomAt: (factor: number, screen: Point, size: { width: number; height: number }) => void;
  fitView: (width: number, height: number, padding?: number) => void;
  centerOn: (point: Point, width: number, height: number, zoom?: number) => void;
  select: (ids: string[], additive?: boolean) => void;
  setSelectedPoint: (index: number | null) => void;
  toggleSelect: (id: string) => void;
  setHovered: (id: string | null) => void;
  setEditingId: (id: string | null) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  updateNodes: (ids: string[], patch: Partial<SceneNode> | ((node: SceneNode) => Partial<SceneNode>), record?: boolean) => void;
  updateNode: (id: string, patch: Partial<SceneNode> | ((node: SceneNode) => Partial<SceneNode>), record?: boolean) => void;
  addNode: (node: SceneNode, parentId?: string | null, index?: number, record?: boolean) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  groupSelection: () => boolean;
  ungroupSelection: () => void;
  createComponent: (ids?: string[]) => string | null;
  insertInstance: (componentId: string) => string | null;
  detachInstance: (id: string) => void;
  syncInstances: (componentId: string, record?: boolean) => number;
  reorderSelection: (mode: ReorderMode) => void;
  reparentNode: (nodeId: string, parentId: string | null, index: number) => void;
  translateSelection: (dx: number, dy: number, record?: boolean) => void;
  align: (kind: AlignKind) => void;
  distribute: (axis: "h" | "v") => void;
  nudge: (dx: number, dy: number) => void;
  renameNode: (id: string, name: string) => void;
  toggleVisible: (id: string) => void;
  toggleLock: (id: string) => void;
  setPageName: (id: string, name: string) => void;
  addPage: (name?: string) => void;
  deletePage: (id: string) => void;
  setComments: (comments: Comment[]) => void;
  appendComment: (comment: Comment) => void;
  updateComment: (comment: Comment) => void;
  removeComment: (id: string) => void;
  setShowComments: (show: boolean) => void;
  setCollaborators: (users: PresenceUser[]) => void;
  beginSync: () => void;
  confirmSync: (version: number) => void;
  failSync: () => void;
  applyRemoteDoc: (doc: SigmaDoc, version: number) => void;
  applyRemoteDelta: (delta: SigmaDoc, version: number) => void;
  applyRestoredDoc: (doc: SigmaDoc, version: number) => void;
  openPreview: (frameId?: string | null) => void;
  closePreview: () => void;
  setPreviewFrame: (frameId: string | null) => void;
  setLoading: (loading: boolean) => void;
}

const emptyDoc: SigmaDoc = {
  pages: [{ id: "page-blank", name: "Page 1", nodes: {}, rootIds: [], ts: Date.now() }],
  tombstones: {},
};

function normalizeDoc(doc: SigmaDoc): SigmaDoc {
  if (!doc || !Array.isArray(doc.pages) || doc.pages.length === 0) return structuredClone(emptyDoc);
  const out = structuredClone(doc);
  out.tombstones = out.tombstones ?? {};
  out.deletedPages = out.deletedPages ?? {};
  for (const page of out.pages) {
    page.nodes = page.nodes ?? {};
    page.rootIds = (page.rootIds ?? []).filter((id) => page.nodes[id]);
    page.ts = page.ts ?? 0;
    for (const node of Object.values(page.nodes)) {
      node.children = node.children ?? [];
      node.points = node.points ?? [];
      node.closed = node.closed ?? false;
      node.component = node.component ?? false;
      node.componentId = node.componentId ?? null;
    }
  }
  return out;
}

function currentPage(state: Pick<EditorState, "doc" | "pageId">): Page {
  return getPage(state.doc, state.pageId);
}

function shiftTree(page: Page, id: string, dxWorld: number, dyWorld: number, visited = new Set<string>()) {
  if (visited.has(id)) return;
  visited.add(id);
  const node = page.nodes[id];
  if (!node) return;
  if (node.type === "group") {
    for (const child of node.children) shiftTree(page, child, dxWorld, dyWorld, visited);
    return;
  }
  const angle = node.parentId && page.nodes[node.parentId] ? matrixAngle(nodeMatrix(page, node.parentId)) : 0;
  const rad = (-angle * Math.PI) / 180;
  const lx = dxWorld * Math.cos(rad) - dyWorld * Math.sin(rad);
  const ly = dxWorld * Math.sin(rad) + dyWorld * Math.cos(rad);
  node.x += lx;
  node.y += ly;
  node.ts = Date.now();
}

function collectShift(
  page: Page,
  id: string,
  dxWorld: number,
  dyWorld: number,
  updates: Map<string, { x: number; y: number }>,
  visited = new Set<string>(),
) {
  if (visited.has(id)) return;
  visited.add(id);
  const node = page.nodes[id];
  if (!node) return;
  if (node.type === "group") {
    for (const child of node.children) collectShift(page, child, dxWorld, dyWorld, updates, visited);
    return;
  }
  const angle = node.parentId && page.nodes[node.parentId] ? matrixAngle(nodeMatrix(page, node.parentId)) : 0;
  const rad = (-angle * Math.PI) / 180;
  updates.set(id, {
    x: node.x + dxWorld * Math.cos(rad) - dyWorld * Math.sin(rad),
    y: node.y + dxWorld * Math.sin(rad) + dyWorld * Math.cos(rad),
  });
}

export const useEditor = create<EditorState>((set, get) => {
  const commitPage = (page: Page, record = true) => {
    const state = get();
    const nextDoc: SigmaDoc = {
      ...state.doc,
      pages: state.doc.pages.map((p) => (p.id === page.id ? page : p)),
    };
    const past = record ? [...state.past, state.doc].slice(-60) : state.past;
    set({
      doc: nextDoc,
      past,
      future: record ? [] : state.future,
      dirty: true,
      changeSeq: state.changeSeq + 1,
      syncStatus: "saving",
    });
  };

  const mutate = (fn: (page: Page, doc: SigmaDoc) => void, record = true) => {
    const state = get();
    const next = structuredClone(state.doc);
    const page = getPage(next, state.pageId);
    fn(page, next);
    const past = record ? [...state.past, state.doc].slice(-60) : state.past;
    set({
      doc: next,
      past,
      future: record ? [] : state.future,
      dirty: true,
      changeSeq: state.changeSeq + 1,
      syncStatus: "saving",
    });
  };

  return {
    file: null,
    doc: structuredClone(emptyDoc),
    pageId: emptyDoc.pages[0].id,
    version: 0,
    selection: [],
    selectedPoint: null,
    hoveredId: null,
    tool: "select",
    viewport: { x: 0, y: 0, zoom: 1 },
    past: [],
    future: [],
    editingId: null,
    clipboard: null,
    comments: [],
    showComments: false,
    collaborators: [],
    dirty: false,
    saving: false,
    syncStatus: "saved",
    lastSavedAt: null,
    changeSeq: 0,
    syncSeq: 0,
    previewOpen: false,
    previewFrameId: null,
    isReadOnly: false,
    loading: true,

    load: (file, doc, version) => {
      const normalized = normalizeDoc(doc);
      set({
        file,
        doc: normalized,
        pageId: normalized.pages[0].id,
        version,
        selection: [],
        selectedPoint: null,
        hoveredId: null,
        editingId: null,
        past: [],
        future: [],
        clipboard: null,
        comments: [],
        collaborators: [],
        dirty: false,
        saving: false,
        syncStatus: "saved",
        changeSeq: 0,
        syncSeq: 0,
        previewOpen: false,
        previewFrameId: null,
        isReadOnly: file.role === "view",
        loading: false,
        tool: "select",
      });
    },
    reset: () =>
      set({
        file: null,
        doc: structuredClone(emptyDoc),
        pageId: emptyDoc.pages[0].id,
        version: 0,
        selection: [],
        past: [],
        future: [],
        dirty: false,
        saving: false,
        loading: true,
        isReadOnly: false,
        previewOpen: false,
      }),
    setFileMeta: (file) => set({ file, isReadOnly: file.role === "view" }),
    setPage: (id) => {
      if (!get().doc.pages.some((p) => p.id === id)) return;
      set({ pageId: id, selection: [], selectedPoint: null, editingId: null, hoveredId: null });
    },
    setTool: (tool) => set({ tool, selectedPoint: null, editingId: null }),
    setViewport: (vp) => set({ viewport: vp }),
    zoomAt: (factor, screen, size) => {
      const { viewport } = get();
      const nextZoom = clamp(viewport.zoom * factor, 0.02, 8);
      const world = {
        x: (screen.x - viewport.x) / viewport.zoom,
        y: (screen.y - viewport.y) / viewport.zoom,
      };
      set({
        viewport: {
          zoom: nextZoom,
          x: screen.x - world.x * nextZoom,
          y: screen.y - world.y * nextZoom,
        },
        // keep params referenced for potential future bounds clamping
        ...(size.width >= 0 ? {} : {}),
      });
    },
    fitView: (width, height, padding = 96) => {
      const { doc, pageId } = get();
      const page = getPage(doc, pageId);
      const roots = page.rootIds.filter((id) => page.nodes[id]);
      if (roots.length === 0) {
        set({ viewport: { x: width / 2, y: height / 2, zoom: 1 } });
        return;
      }
      const b = boundsOf(page, roots);
      const zoom = clamp(
        Math.min((width - padding * 2) / Math.max(b.width, 1), (height - padding * 2) / Math.max(b.height, 1)),
        0.02,
        1.5,
      );
      set({
        viewport: {
          zoom,
          x: width / 2 - (b.x + b.width / 2) * zoom,
          y: height / 2 - (b.y + b.height / 2) * zoom,
        },
      });
    },
    centerOn: (point, width, height, zoom) => {
      const z = zoom ?? get().viewport.zoom;
      set({ viewport: { zoom: z, x: width / 2 - point.x * z, y: height / 2 - point.y * z } });
    },
    select: (ids, additive) => {
      const unique = Array.from(new Set(ids));
      set({
        selection: additive ? Array.from(new Set([...get().selection, ...unique])) : unique,
        selectedPoint: null,
        editingId: null,
      });
    },
    setSelectedPoint: (index) => set({ selectedPoint: index }),
    toggleSelect: (id) => {
      const sel = get().selection;
      set({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id], selectedPoint: null, editingId: null });
    },
    setHovered: (id) => set({ hoveredId: id }),
    setEditingId: (id) => set({ editingId: id }),
    pushHistory: () => {
      const { doc, past } = get();
      set({ past: [...past, doc].slice(-60), future: [] });
    },
    undo: () => {
      const { past, doc, future } = get();
      if (past.length === 0) return;
      const prev = rebaseHistoryDoc(past[past.length - 1], doc);
      const pageExists = prev.pages.some((p) => p.id === get().pageId);
      const nextPageId = pageExists ? get().pageId : prev.pages[0]?.id ?? get().pageId;
      set({
        doc: prev,
        pageId: nextPageId,
        past: past.slice(0, -1),
        future: [doc, ...future].slice(0, 60),
        selection: pageExists ? get().selection.filter((id) => getPage(prev, nextPageId).nodes[id]) : [],
        selectedPoint: null,
        dirty: true,
        changeSeq: get().changeSeq + 1,
        syncStatus: "saving",
      });
    },
    redo: () => {
      const { future, doc, past } = get();
      if (future.length === 0) return;
      const next = rebaseHistoryDoc(future[0], doc);
      const pageExists = next.pages.some((p) => p.id === get().pageId);
      const nextPageId = pageExists ? get().pageId : next.pages[0]?.id ?? get().pageId;
      set({
        doc: next,
        pageId: nextPageId,
        future: future.slice(1),
        past: [...past, doc].slice(-60),
        selection: pageExists ? get().selection.filter((id) => getPage(next, nextPageId).nodes[id]) : [],
        selectedPoint: null,
        dirty: true,
        changeSeq: get().changeSeq + 1,
        syncStatus: "saving",
      });
    },
    updateNodes: (ids, patch, record = true) => {
      if (get().isReadOnly) return;
      const state = get();
      const source = getPage(state.doc, state.pageId);
      const now = Date.now();
      let changed = false;
      const nodes = { ...source.nodes };
      for (const id of ids) {
        const node = source.nodes[id];
        if (!node) continue;
        const next = typeof patch === "function" ? patch(node) : patch;
        nodes[id] = { ...node, ...next, ts: now };
        changed = true;
      }
      if (!changed) return;
      commitPage({ ...source, nodes }, record);

      // Keep instances in sync when a layer inside a main component changes.
      const components = new Set<string>();
      for (const id of ids) {
        let cur: SceneNode | undefined = source.nodes[id];
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          if (cur.component) {
            components.add(cur.id);
            break;
          }
          cur = cur.parentId ? source.nodes[cur.parentId] : undefined;
        }
      }
      for (const componentId of components) get().syncInstances(componentId, false);
    },
    updateNode: (id, patch, record = true) => get().updateNodes([id], patch, record),
    addNode: (node, parentId = null, index, record = true) => {
      if (get().isReadOnly) return;
      mutate((page) => {
        const now = Date.now();
        const created = { ...node, parentId, ts: now };
        page.nodes[created.id] = created;
        if (parentId && page.nodes[parentId]) {
          const parent = page.nodes[parentId];
          const at = index === undefined ? parent.children.length : clamp(index, 0, parent.children.length);
          parent.children.splice(at, 0, created.id);
          parent.ts = now;
        } else {
          created.parentId = null;
          const at = index === undefined ? page.rootIds.length : clamp(index, 0, page.rootIds.length);
          page.rootIds.splice(at, 0, created.id);
        }
        page.ts = now;
      }, record);
      set({ selection: [node.id] });
    },
    deleteSelection: () => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection).filter((id) => page.nodes[id] && !page.nodes[id].locked);
      if (roots.length === 0) return;
      mutate((p, d) => {
        const now = Date.now();
        d.tombstones = d.tombstones ?? {};
        const removeTree = (id: string) => {
          const node = p.nodes[id];
          if (!node) return;
          for (const child of [...node.children]) removeTree(child);
          delete p.nodes[id];
          d.tombstones![id] = now;
        };
        for (const id of roots) {
          const node = p.nodes[id];
          if (!node) continue;
          if (node.parentId && p.nodes[node.parentId]) {
            const parent = p.nodes[node.parentId];
            parent.children = parent.children.filter((c) => c !== id);
            parent.ts = now;
          } else {
            p.rootIds = p.rootIds.filter((c) => c !== id);
          }
          removeTree(id);
        }
        p.ts = now;
      });
      set({ selection: [], selectedPoint: null, editingId: null });
    },
    duplicateSelection: () => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length === 0) return;
      const newRoots: string[] = [];
      mutate((p) => {
        const now = Date.now();
        for (const rootId of roots) {
          const original = p.nodes[rootId];
          if (!original) continue;
          const clip = collectSubtree(p, [rootId]);
          const inst = instantiateSubtree(p, clip, () => uid(rootId.slice(0, 2)));
          for (const node of Object.values(inst.nodes)) {
            node.parentId = node.parentId && inst.nodes[node.parentId] ? node.parentId : original.parentId;
            p.nodes[node.id] = node;
          }
          for (const newRoot of inst.roots) {
            shiftTree(p, newRoot, 16, 16);
            if (original.parentId && p.nodes[original.parentId]) {
              const parent = p.nodes[original.parentId];
              const idx = parent.children.indexOf(rootId);
              parent.children.splice(idx + 1, 0, newRoot);
              parent.ts = now;
            } else {
              const idx = p.rootIds.indexOf(rootId);
              p.rootIds.splice(idx + 1, 0, newRoot);
            }
            newRoots.push(newRoot);
          }
        }
        p.ts = now;
      });
      set({ selection: newRoots });
    },
    copySelection: () => {
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length === 0) return;
      set({ clipboard: { ...collectSubtree(page, roots), pageId: page.id } });
    },
    paste: () => {
      if (get().isReadOnly) return;
      const state = get();
      const clip = state.clipboard;
      if (!clip) return;
      const page = currentPage(state);
      let targetParent: string | null = null;
      const selectedNode = state.selection.length === 1 ? page.nodes[state.selection[0]] : null;
      if (selectedNode && (selectedNode.type === "frame" || selectedNode.type === "group")) targetParent = selectedNode.id;
      const newRoots: string[] = [];
      mutate((p) => {
        const now = Date.now();
        const inst = instantiateSubtree(p, clip, () => uid("cp"));
        for (const node of Object.values(inst.nodes)) p.nodes[node.id] = node;
        for (const root of inst.roots) {
          const node = p.nodes[root];
          node.parentId = targetParent;
          if (targetParent && p.nodes[targetParent]) {
            p.nodes[targetParent].children.push(root);
            p.nodes[targetParent].ts = now;
          } else {
            p.rootIds.push(root);
          }
          shiftTree(p, root, 20, 20);
          newRoots.push(root);
        }
        p.ts = now;
      });
      set({ selection: newRoots });
    },
    groupSelection: () => {
      if (get().isReadOnly) return false;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length === 0) return false;
      const parentIds = new Set(roots.map((id) => page.nodes[id]?.parentId ?? null));
      if (parentIds.size > 1) return false;
      const parentId = page.nodes[roots[0]]?.parentId ?? null;
      const siblings = parentId ? page.nodes[parentId]?.children ?? [] : page.rootIds;
      const ordered = siblings.filter((id) => roots.includes(id));
      if (ordered.length === 0) return false;
      const minIndex = Math.min(...ordered.map((id) => siblings.indexOf(id)));
      const group = {
        ...structuredClone(page.nodes[ordered[0]]),
        id: uid("gr"),
        type: "group" as const,
        name: "Group",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        opacity: 1,
        fill: null,
        stroke: null,
        shadow: null,
        blur: 0,
        clip: false,
        radius: 0,
        parentId,
        children: [...ordered],
        link: null,
        ts: Date.now(),
      };
      mutate((p) => {
        const now = Date.now();
        const container = parentId && p.nodes[parentId] ? p.nodes[parentId] : null;
        if (container) {
          container.children = container.children.filter((id) => !ordered.includes(id));
          container.children.splice(minIndex, 0, group.id);
          container.ts = now;
        } else {
          p.rootIds = p.rootIds.filter((id) => !ordered.includes(id));
          p.rootIds.splice(minIndex, 0, group.id);
        }
        for (const id of ordered) {
          if (p.nodes[id]) p.nodes[id].parentId = group.id;
        }
        p.nodes[group.id] = { ...group, ts: now };
        p.ts = now;
      });
      set({ selection: [group.id] });
      return true;
    },
    ungroupSelection: () => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const groups = topLevelSelection(page, state.selection).filter((id) => page.nodes[id]?.type === "group");
      if (groups.length === 0) return;
      const newSelection: string[] = [];
      mutate((p, d) => {
        const now = Date.now();
        d.tombstones = d.tombstones ?? {};
        for (const groupId of groups) {
          const group = p.nodes[groupId];
          if (!group) continue;
          const siblings = group.parentId && p.nodes[group.parentId] ? p.nodes[group.parentId].children : p.rootIds;
          const idx = siblings.indexOf(groupId);
          const kids = [...group.children];
          siblings.splice(idx, 1, ...kids);
          for (const kid of kids) {
            const child = p.nodes[kid];
            if (!child) continue;
            child.parentId = group.parentId;
            child.x += group.x;
            child.y += group.y;
            child.ts = now;
            newSelection.push(kid);
          }
          if (group.parentId && p.nodes[group.parentId]) p.nodes[group.parentId].ts = now;
          delete p.nodes[groupId];
          d.tombstones![groupId] = now;
        }
        p.ts = now;
      });
      set({ selection: newSelection });
    },
    createComponent: (ids) => {
      if (get().isReadOnly) return null;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, ids ?? state.selection);
      if (roots.length !== 1) return null;
      const node = page.nodes[roots[0]];
      if (!node) return null;
      get().updateNode(node.id, { component: true, componentId: null }, true);
      return node.id;
    },
    insertInstance: (componentId) => {
      if (get().isReadOnly) return null;
      const state = get();
      let sourcePage = state.doc.pages.find((p) => p.nodes[componentId]?.component);
      if (!sourcePage) {
        // Allow inserting by pointing at a component node id from any page.
        sourcePage = state.doc.pages.find((p) => p.nodes[componentId]);
      }
      const component = sourcePage?.nodes[componentId];
      if (!sourcePage || !component) return null;
      const clip = collectSubtree(sourcePage, [componentId]);
      const page = currentPage(state);
      const { roots, nodes } = instantiateSubtree(page, { roots: clip.roots, nodes: clip.nodes }, () => uid());
      const rootId = roots[0];
      const root = nodes[rootId];
      if (!root) return null;
      const now = Date.now();
      root.componentId = componentId;
      root.component = false;
      root.name = component.name;
      root.x = component.x + 40;
      root.y = component.y + 40;
      root.parentId = null;
      root.ts = now;
      const next = structuredClone(state.doc);
      const target = getPage(next, state.pageId);
      for (const [id, node] of Object.entries(nodes)) {
        if (id === rootId) {
          target.nodes[id] = { ...node, ...root };
        } else {
          target.nodes[id] = { ...node, parentId: node.parentId === rootId ? rootId : node.parentId };
        }
      }
      target.rootIds.push(rootId);
      target.ts = now;
      set({
        doc: next,
        past: [...state.past, state.doc].slice(-60),
        future: [],
        selection: [rootId],
        editingId: null,
        dirty: true,
        changeSeq: state.changeSeq + 1,
        syncStatus: "saving",
      });
      return rootId;
    },
    detachInstance: (id) => {
      if (get().isReadOnly) return;
      get().updateNode(id, { componentId: null, component: false }, true);
    },
    syncInstances: (componentId, record = true) => {
      if (get().isReadOnly) return 0;
      const state = get();
      const sourcePage = state.doc.pages.find((p) => p.nodes[componentId]?.component) ?? state.doc.pages.find((p) => p.nodes[componentId]);
      const component = sourcePage?.nodes[componentId];
      if (!sourcePage || !component) return 0;
      const clip = collectSubtree(sourcePage, [componentId]);
      const next = structuredClone(state.doc);
      next.tombstones = next.tombstones ?? {};
      const now = Date.now();
      let count = 0;
      for (const page of next.pages) {
        const instances = Object.values(page.nodes).filter((n) => n.componentId === componentId);
        for (const instance of instances) {
          const oldDescendants = descendantsOf(page, instance.id);
          for (const old of oldDescendants) {
            delete page.nodes[old.id];
            next.tombstones![old.id] = now;
          }
          const { roots, nodes } = instantiateSubtree(page, { roots: clip.roots, nodes: clip.nodes }, () => uid());
          const newRoot = nodes[roots[0]];
          if (!newRoot) continue;
          const preserved = {
            id: instance.id,
            x: instance.x,
            y: instance.y,
            name: instance.name,
            parentId: instance.parentId,
            componentId,
          };
          page.nodes[instance.id] = { ...newRoot, ...preserved, component: false, ts: now };
          for (const [id, node] of Object.entries(nodes)) {
            if (id === newRoot.id) continue;
            page.nodes[id] = { ...node, parentId: node.parentId === newRoot.id ? instance.id : node.parentId, ts: now };
          }
          page.ts = now;
          count++;
        }
      }
      if (count === 0) return 0;
      set({
        doc: next,
        past: record ? [...state.past, state.doc].slice(-60) : state.past,
        future: record ? [] : state.future,
        dirty: true,
        changeSeq: state.changeSeq + 1,
        syncStatus: "saving",
      });
      return count;
    },
    reorderSelection: (mode) => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length === 0) return;
      mutate((p) => {
        const now = Date.now();
        const groups = new Map<string, string[]>();
        for (const id of roots) {
          const parentId = p.nodes[id]?.parentId ?? null;
          const key = parentId ?? "__root__";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(id);
        }
        for (const [key, ids] of groups) {
          const siblings = key === "__root__" ? p.rootIds : p.nodes[key]?.children;
          if (!siblings) continue;
          const ordered = siblings.filter((id) => ids.includes(id));
          const sorted =
            mode === "forward" || mode === "backward"
              ? mode === "forward"
                ? [...ordered].reverse()
                : ordered
              : ordered;
          if (mode === "front") {
            for (const id of ordered) siblings.splice(siblings.indexOf(id), 1);
            siblings.push(...ordered);
          } else if (mode === "back") {
            for (const id of [...ordered].reverse()) siblings.splice(siblings.indexOf(id), 1);
            siblings.unshift(...ordered);
          } else {
            for (const id of sorted) {
              const at = siblings.indexOf(id);
              if (mode === "forward" && at < siblings.length - 1) {
                siblings.splice(at, 1);
                siblings.splice(at + 1, 0, id);
              } else if (mode === "backward" && at > 0) {
                siblings.splice(at, 1);
                siblings.splice(at - 1, 0, id);
              }
            }
          }
        }
        p.ts = now;
      });
    },
    reparentNode: (nodeId, parentId, index) => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const node = page.nodes[nodeId];
      if (!node) return;
      if (parentId === nodeId || (parentId && isAncestorOf(page, nodeId, parentId))) return;
      const before = nodeAABB(page, node);
      const origin = applyMatrix(nodeMatrix(page, nodeId), { x: 0, y: 0 });
      mutate((p) => {
        const now = Date.now();
        const target = p.nodes[nodeId];
        if (!target) return;
        const oldSiblings = target.parentId && p.nodes[target.parentId] ? p.nodes[target.parentId].children : p.rootIds;
        const oldAt = oldSiblings.indexOf(nodeId);
        if (oldAt >= 0) oldSiblings.splice(oldAt, 1);
        if (target.parentId && p.nodes[target.parentId]) p.nodes[target.parentId].ts = now;

        let nextSiblings: string[] = p.rootIds;
        if (parentId && p.nodes[parentId]) {
          const parent = p.nodes[parentId];
          nextSiblings = parent.children;
          parent.children.splice(clamp(index, 0, parent.children.length), 0, nodeId);
          parent.ts = now;
          target.parentId = parentId;
        } else {
          p.rootIds.splice(clamp(index, 0, p.rootIds.length), 0, nodeId);
          target.parentId = null;
        }
        target.ts = now;

        if (target.type !== "group" && parentId && p.nodes[parentId]) {
          const inv = invertMatrix(nodeMatrix(p, parentId));
          const local = {
            x: inv[0] * origin.x + inv[2] * origin.y + inv[4],
            y: inv[1] * origin.x + inv[3] * origin.y + inv[5],
          };
          target.x = local.x;
          target.y = local.y;
        } else if (!parentId && target.type !== "group") {
          target.x = origin.x;
          target.y = origin.y;
        } else if (target.type === "group") {
          const after = nodeAABB(p, target);
          for (const kid of target.children) {
            shiftTree(p, kid, before.x - after.x, before.y - after.y);
          }
        }
        p.ts = now;
      });
    },
    translateSelection: (dx, dy, record = false) => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length === 0) return;
      const updates = new Map<string, { x: number; y: number }>();
      for (const id of roots) collectShift(page, id, dx, dy, updates);
      if (updates.size === 0) return;
      const now = Date.now();
      const nodes = { ...page.nodes };
      for (const [id, pos] of updates) {
        const node = nodes[id];
        if (!node) continue;
        nodes[id] = { ...node, x: pos.x, y: pos.y, ts: now };
      }
      commitPage({ ...page, nodes }, record);
    },
    align: (kind) => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length === 0) return;
      const bounds: Record<string, Bounds> = {};
      for (const id of roots) {
        const node = page.nodes[id];
        if (node) bounds[id] = nodeAABB(page, node);
      }
      let target: Bounds;
      if (roots.length === 1) {
        const only = page.nodes[roots[0]];
        const parent = only?.parentId ? page.nodes[only.parentId] : null;
        if (!parent) return;
        target = nodeAABB(page, parent);
      } else {
        target = boundsOf(page, roots);
      }
      mutate((p) => {
        for (const id of roots) {
          const node = p.nodes[id];
          const b = bounds[id];
          if (!node || !b) continue;
          let dx = 0;
          let dy = 0;
          if (kind === "left") dx = target.x - b.x;
          if (kind === "hcenter") dx = target.x + target.width / 2 - (b.x + b.width / 2);
          if (kind === "right") dx = target.x + target.width - (b.x + b.width);
          if (kind === "top") dy = target.y - b.y;
          if (kind === "vcenter") dy = target.y + target.height / 2 - (b.y + b.height / 2);
          if (kind === "bottom") dy = target.y + target.height - (b.y + b.height);
          shiftTree(p, id, dx, dy);
        }
      });
    },
    distribute: (axis) => {
      if (get().isReadOnly) return;
      const state = get();
      const page = currentPage(state);
      const roots = topLevelSelection(page, state.selection);
      if (roots.length < 3) return;
      const items = roots
        .map((id) => ({ id, b: nodeAABB(page, page.nodes[id]) }))
        .sort((a, b) =>
          axis === "h" ? a.b.x + a.b.width / 2 - (b.b.x + b.b.width / 2) : a.b.y + a.b.height / 2 - (b.b.y + b.b.height / 2),
        );
      const first = items[0];
      const last = items[items.length - 1];
      const total = axis === "h" ? last.b.x + last.b.width - first.b.x : last.b.y + last.b.height - first.b.y;
      const sum = items.reduce((acc, it) => acc + (axis === "h" ? it.b.width : it.b.height), 0);
      const gap = (total - sum) / (items.length - 1);
      mutate((p) => {
        let cursor = axis === "h" ? first.b.x : first.b.y;
        for (const item of items) {
          const node = p.nodes[item.id];
          if (!node) continue;
          const size = axis === "h" ? item.b.width : item.b.height;
          const current = axis === "h" ? item.b.x : item.b.y;
          if (item !== first && item !== last) {
            const delta = cursor - current;
            shiftTree(p, item.id, axis === "h" ? delta : 0, axis === "h" ? 0 : delta);
          }
          cursor += size + gap;
        }
      });
    },
    nudge: (dx, dy) => get().translateSelection(dx, dy, true),
    renameNode: (id, name) =>
      get().updateNode(id, { name: name.trim() || "Layer" }),
    toggleVisible: (id) => {
      const node = currentPage(get()).nodes[id];
      if (node) get().updateNode(id, { visible: !node.visible });
    },
    toggleLock: (id) => {
      const node = currentPage(get()).nodes[id];
      if (node) {
        get().updateNode(id, { locked: !node.locked });
        if (!node.locked) set({ selection: get().selection.filter((s) => s !== id) });
      }
    },
    setPageName: (id, name) => {
      if (get().isReadOnly) return;
      mutate((_page, doc) => {
        const p = doc.pages.find((x) => x.id === id);
        if (p) {
          p.name = name;
          p.ts = Date.now();
        }
      });
    },
    addPage: (name) => {
      if (get().isReadOnly) return;
      const newPage: Page = {
        id: uid("page"),
        name: name?.trim() || `Page ${get().doc.pages.length + 1}`,
        nodes: {},
        rootIds: [],
        ts: Date.now(),
      };
      const next = { ...get().doc, pages: [...get().doc.pages, newPage] };
      set({
        doc: next,
        pageId: newPage.id,
        selection: [],
        past: [...get().past, get().doc].slice(-60),
        future: [],
        dirty: true,
        changeSeq: get().changeSeq + 1,
        syncStatus: "saving",
      });
    },
    deletePage: (id) => {
      if (get().isReadOnly) return;
      const { doc, pageId } = get();
      if (doc.pages.length <= 1) return;
      const pages = doc.pages.filter((p) => p.id !== id);
      const nextPage = pageId === id ? pages[Math.max(0, doc.pages.findIndex((p) => p.id === id) - 1)].id : pageId;
      const now = Date.now();
      set({
        doc: { ...doc, pages, deletedPages: { ...(doc.deletedPages ?? {}), [id]: now } },
        pageId: nextPage,
        selection: [],
        past: [...get().past, doc].slice(-60),
        future: [],
        dirty: true,
        changeSeq: get().changeSeq + 1,
        syncStatus: "saving",
      });
    },
    setComments: (comments) => set({ comments }),
    appendComment: (comment) => {
      if (get().comments.some((c) => c.id === comment.id)) return;
      set({ comments: [...get().comments, comment] });
    },
    updateComment: (comment) => set({ comments: get().comments.map((c) => (c.id === comment.id ? comment : c)) }),
    removeComment: (id) => set({ comments: get().comments.filter((c) => c.id !== id) }),
    setShowComments: (show) => set({ showComments: show }),
    setCollaborators: (users) => set({ collaborators: users }),
    beginSync: () => set({ syncSeq: get().changeSeq, saving: true, syncStatus: "saving" }),
    confirmSync: (version) => {
      const { changeSeq, syncSeq } = get();
      set({
        version: Math.max(version, get().version),
        saving: false,
        lastSavedAt: Date.now(),
        dirty: changeSeq !== syncSeq,
        syncStatus: changeSeq !== syncSeq ? "saving" : "saved",
      });
    },
    failSync: () => set({ saving: false, syncStatus: "offline" }),
    applyRemoteDoc: (doc, version) => {
      const state = get();
      const merged = mergeDocs(state.doc, normalizeDoc(doc));
      const pageIds = new Set(merged.pages.map((p) => p.id));
      const pageId = pageIds.has(state.pageId) ? state.pageId : merged.pages[0].id;
      const page = getPage(merged, pageId);
      set({
        doc: merged,
        pageId,
        version: Math.max(version, state.version),
        selection: state.selection.filter((id) => page.nodes[id]),
        editingId: state.editingId && page.nodes[state.editingId] ? state.editingId : null,
      });
      get().confirmSync(version);
    },
    applyRemoteDelta: (delta, version) => {
      const state = get();
      const merged = mergeDocs(state.doc, delta);
      const pageIds = new Set(merged.pages.map((p) => p.id));
      const pageId = pageIds.has(state.pageId) ? state.pageId : merged.pages[0].id;
      const page = getPage(merged, pageId);
      set({
        doc: merged,
        pageId,
        version: Math.max(version, state.version),
        selection: state.selection.filter((id) => page.nodes[id]),
        editingId: state.editingId && page.nodes[state.editingId] ? state.editingId : null,
      });
      get().confirmSync(version);
    },
    applyRestoredDoc: (doc, version) => {
      const normalized = normalizeDoc(doc);
      const pageIds = new Set(normalized.pages.map((p) => p.id));
      const nextPageId = pageIds.has(get().pageId) ? get().pageId : normalized.pages[0].id;
      const nextPage = getPage(normalized, nextPageId);
      set({
        doc: normalized,
        pageId: nextPageId,
        version,
        selection: get().selection.filter((id) => nextPage.nodes[id]),
        past: [...get().past, get().doc].slice(-60),
        future: [],
        dirty: false,
        syncSeq: get().changeSeq,
        saving: false,
        syncStatus: "saved",
        lastSavedAt: Date.now(),
      });
    },
    openPreview: (frameId) => {
      const state = get();
      const page = currentPage(state);
      let frame = frameId ?? null;
      if (!frame) {
        const selected = state.selection.map((id) => page.nodes[id]).find((n) => n?.type === "frame");
        if (selected) frame = selected.id;
      }
      if (!frame) {
        frame = page.rootIds.find((id) => page.nodes[id]?.type === "frame") ?? null;
      }
      set({ previewOpen: true, previewFrameId: frame });
    },
    closePreview: () => set({ previewOpen: false }),
    setPreviewFrame: (frameId) => set({ previewFrameId: frameId }),
    setLoading: (loading) => set({ loading }),
  };
});

/** Rebases a history snapshot onto the current document so undo/redo keeps
 *  per-node timestamps monotonic and turns removals into tombstones. */
function rebaseHistoryDoc(target: SigmaDoc, current: SigmaDoc): SigmaDoc {
  const now = Date.now();
  const out = structuredClone(target);
  out.tombstones = { ...(out.tombstones ?? {}) };
  out.deletedPages = { ...(out.deletedPages ?? {}) };
  const currentPages = new Map(current.pages.map((p) => [p.id, p]));
  const targetPages = new Set(out.pages.map((p) => p.id));
  for (const page of current.pages) {
    if (!targetPages.has(page.id)) out.deletedPages[page.id] = now;
  }
  for (const page of out.pages) {
    const cur = currentPages.get(page.id);
    if (!cur) {
      page.ts = now;
      continue;
    }
    for (const id of Object.keys(cur.nodes)) {
      if (!page.nodes[id]) out.tombstones[id] = now;
    }
    for (const [id, node] of Object.entries(page.nodes)) {
      const previous = cur.nodes[id];
      if (!previous) {
        node.ts = now;
        if (!node.parentId) page.ts = now;
        continue;
      }
      if (JSON.stringify(previous) !== JSON.stringify(node)) {
        node.ts = now;
        if (!node.parentId) page.ts = now;
      }
    }
    if (page.name !== cur.name || page.rootIds.join("|") !== cur.rootIds.join("|")) page.ts = now;
  }
  return out;
}

function invertMatrix(m: [number, number, number, number, number, number]) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number];
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

// Re-exported selectors used by panels.
export function selectedNodes(state: EditorState): SceneNode[] {
  const page = getPage(state.doc, state.pageId);
  return state.selection.map((id) => page.nodes[id]).filter(Boolean);
}

export function selectedNode(state: EditorState): SceneNode | null {
  if (state.selection.length !== 1) return null;
  return currentPage(state).nodes[state.selection[0]] ?? null;
}

export function pageAncestors(page: Page, id: string): SceneNode[] {
  return ancestorsOf(page, id);
}

export function findFrameAt(page: Page, point: Point): SceneNode | null {
  return frameAt(page, point);
}
