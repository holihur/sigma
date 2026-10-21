import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, Maximize, Minus, Plus, Sparkles, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { commentsApi, filesApi } from "@/lib/api";
import type { Comment, Point } from "@/lib/types";
import { boundsOf, getPage, nodeAABB } from "@/lib/nodes";
import { useAuth } from "@/store/auth";
import { useEditor } from "@/store/editor";
import { useCollaboration } from "@/hooks/useCollaboration";
import { clamp, cn, isEditableTarget, round } from "@/lib/utils";
import { Canvas } from "@/components/editor/Canvas";
import { Toolbar } from "@/components/editor/Toolbar";
import { TopBar } from "@/components/editor/TopBar";
import { LayersPanel } from "@/components/editor/LayersPanel";
import { PropertiesPanel } from "@/components/editor/PropertiesPanel";
import { CommentsPanel } from "@/components/editor/CommentsPanel";
import { PreviewMode } from "@/components/editor/PreviewMode";
import { ShareDialog } from "@/components/editor/ShareDialog";
import { VersionHistoryDialog } from "@/components/editor/VersionHistoryDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function EditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuth((s) => s.user);
  const file = useEditor((s) => s.file);
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const loading = useEditor((s) => s.loading);
  const readOnly = useEditor((s) => s.isReadOnly);
  const tool = useEditor((s) => s.tool);
  const viewport = useEditor((s) => s.viewport);
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const comments = useEditor((s) => s.comments);
  const collaborators = useEditor((s) => s.collaborators);
  const showComments = useEditor((s) => s.showComments);
  const setShowComments = useEditor((s) => s.setShowComments);
  const appendComment = useEditor((s) => s.appendComment);
  const setComments = useEditor((s) => s.setComments);
  const applyRestoredDoc = useEditor((s) => s.applyRestoredDoc);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const { sendDoc, sendPresence } = useCollaboration(file?.id ?? null, !!file);

  const page = useMemo(() => getPage(doc, pageId), [doc, pageId]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setLayersOpen(false);
      if (window.innerWidth >= 1280) setPropertiesOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (file && searchParams.get("share") === "1") {
      setShareOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("share");
      setSearchParams(next, { replace: true });
    }
  }, [file, searchParams, setSearchParams]);

  // Load the design on mount / when navigating between files.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    useEditor.getState().reset();
    useEditor.setState({ loading: true });
    filesApi
      .get(id)
      .then(({ file, doc }) => {
        if (cancelled) return;
        useEditor.getState().load(file, doc, file.version);
        document.title = `${file.name} — Sigma`;
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message ?? "Could not open this design");
        useEditor.setState({ loading: false });
      });
    return () => {
      cancelled = true;
      useEditor.getState().reset();
    };
  }, [id]);

  // Load comments after the file is ready.
  const loadComments = useCallback(async () => {
    if (!file) return;
    try {
      const data = await commentsApi.list(file.id);
      setComments(data.comments);
    } catch {
      /* non-critical */
    }
  }, [file, setComments]);

  useEffect(() => {
    if (!file) return;
    void loadComments();
  }, [file?.id, loadComments]);

  // Refresh comments while the panel is open (collaboration via polling).
  useEffect(() => {
    if (!file || !showComments) return;
    const t = setInterval(() => void loadComments(), 15000);
    return () => clearInterval(t);
  }, [file, showComments, loadComments]);

  const fit = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    const st = useEditor.getState();
    const current = getPage(st.doc, st.pageId);
    // On phones, fit a single frame instead of the whole page so the artboard
    // stays readable; the rest of the canvas is a swipe away.
    if (width < 640) {
      const frame =
        current.rootIds.map((id) => current.nodes[id]).find((n) => n?.type === "frame") ??
        Object.values(current.nodes).find((n) => n.type === "frame");
      if (frame) {
        const b = nodeAABB(current, frame);
        const topPad = 16;
        const bottomPad = 120;
        const availableH = Math.max(height - topPad - bottomPad, 160);
        const zoom = clamp(Math.min((width - 24) / Math.max(b.width, 1), availableH / Math.max(b.height, 1)), 0.05, 1.1);
        st.setViewport({
          zoom,
          x: width / 2 - (b.x + b.width / 2) * zoom,
          y: topPad + availableH / 2 - (b.y + b.height / 2) * zoom,
        });
        return;
      }
    }
    st.fitView(width, height);
  }, []);

  // Fit the initial view once the canvas has dimensions.
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
  }, [file?.id, fit]);

  const captureThumbnail = useCallback(async () => {
    const st = useEditor.getState();
    if (!st.file) return;
    const p = getPage(st.doc, st.pageId);
    const frameId =
      p.rootIds.find((nid) => p.nodes[nid]?.type === "frame") ??
      Object.values(p.nodes).find((n) => n.type === "frame")?.id;
    if (!frameId) return;
    const frame = p.nodes[frameId];
    const el = document.querySelector(`[data-node-id="${frameId}"]`) as HTMLElement | null;
    if (!el || !frame) return;
    try {
      const dataUrl = await toPng(el, {
        pixelRatio: 0.5,
        cacheBust: true,
        width: Math.max(frame.width, 1),
        height: Math.max(Math.abs(frame.height), 1),
        style: {
          position: "relative",
          left: "0px",
          top: "0px",
          margin: "0",
          transform: frame.rotation ? `rotate(${frame.rotation}deg)` : "none",
          transformOrigin: "center center",
        },
      });
      if (dataUrl.length < 800_000) {
        await filesApi.patch(st.file.id, { thumbnail: dataUrl });
      }
    } catch {
      /* thumbnails are best-effort */
    }
  }, []);

  useEffect(() => {
    if (!file || readOnly) return;
    const t = setTimeout(() => void captureThumbnail(), 6000);
    const interval = setInterval(() => void captureThumbnail(), 50000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
      void captureThumbnail();
    };
  }, [file?.id, readOnly, captureThumbnail]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (e.defaultPrevented) return;
      if (st.previewOpen) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (isEditableTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const el = hostRef.current;
      const center = { x: (el?.clientWidth ?? 800) / 2, y: (el?.clientHeight ?? 600) / 2 };
      const size = { width: el?.clientWidth ?? 800, height: el?.clientHeight ?? 600 };

      if (meta) {
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) st.redo();
          else st.undo();
          return;
        }
        if (key === "y") {
          e.preventDefault();
          st.redo();
          return;
        }
        if (key === "c") {
          st.copySelection();
          return;
        }
        if (key === "v") {
          st.paste();
          return;
        }
        if (key === "d") {
          e.preventDefault();
          st.duplicateSelection();
          return;
        }
        if (key === "g") {
          e.preventDefault();
          if (e.shiftKey) st.ungroupSelection();
          else if (!st.groupSelection()) toast.error("Select layers with the same parent to group");
          return;
        }
        if (key === "a") {
          e.preventDefault();
          st.select(getPage(st.doc, st.pageId).rootIds);
          return;
        }
        if (key === "s") {
          e.preventDefault();
          void sendDoc();
          return;
        }
        if (key === "]") {
          e.preventDefault();
          st.reorderSelection(e.shiftKey ? "front" : "forward");
          return;
        }
        if (key === "[") {
          e.preventDefault();
          st.reorderSelection(e.shiftKey ? "back" : "backward");
          return;
        }
        if (key === "0") {
          e.preventDefault();
          const viewer = getPage(st.doc, st.pageId);
          st.fitView(size.width, size.height);
          void viewer;
          return;
        }
        if (key === "=" || key === "+") {
          e.preventDefault();
          st.zoomAt(1.2, center, size);
          return;
        }
        if (key === "-") {
          e.preventDefault();
          st.zoomAt(1 / 1.2, center, size);
          return;
        }
      } else {
        if (e.shiftKey && (key === "1" || key === "!")) {
          e.preventDefault();
          fit();
          return;
        }
        if (e.shiftKey && (key === "0" || key === ")")) {
          e.preventDefault();
          st.setViewport({ zoom: 1, x: size.width / 2, y: size.height / 2 });
          return;
        }
        if (key === "=" || key === "+") {
          e.preventDefault();
          st.zoomAt(1.2, center, size);
          return;
        }
        if (key === "-") {
          e.preventDefault();
          st.zoomAt(1 / 1.2, center, size);
          return;
        }
        if (key === "delete" || key === "backspace") {
          e.preventDefault();
          st.deleteSelection();
          return;
        }
        if (key === "escape") {
          st.setEditingId(null);
          st.setTool("select");
          return;
        }
        if (key.startsWith("arrow")) {
          e.preventDefault();
          const amount = e.shiftKey ? 10 : 1;
          if (key === "arrowleft") st.nudge(-amount, 0);
          if (key === "arrowright") st.nudge(amount, 0);
          if (key === "arrowup") st.nudge(0, -amount);
          if (key === "arrowdown") st.nudge(0, amount);
          return;
        }
        if (key === "enter" && st.selection.length === 1) {
          const node = getPage(st.doc, st.pageId).nodes[st.selection[0]];
          if (node?.type === "text") {
            st.setEditingId(node.id);
            return;
          }
        }
        const toolKeys: Record<string, Parameters<typeof st.setTool>[0]> = {
          v: "select",
          h: "hand",
          f: "frame",
          a: "frame",
          r: "rect",
          o: "ellipse",
          l: "line",
          t: "text",
          c: "comment",
        };
        if (e.shiftKey && key === "i") {
          st.setTool("image");
          return;
        }
        if (toolKeys[key]) {
          st.setTool(toolKeys[key]);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit, sendDoc]);

  const handleRename = async (name: string) => {
    if (!file) return;
    try {
      const data = await filesApi.patch(file.id, { name });
      useEditor.getState().setFileMeta(data.file);
      document.title = `${data.file.name} — Sigma`;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDuplicate = async () => {
    if (!file) return;
    try {
      const data = await filesApi.duplicate(file.id);
      toast.success("Design duplicated");
      navigate(`/file/${data.file.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCreateComment = async (point: Point, text: string) => {
    if (!file) return;
    try {
      const data = await commentsApi.create(file.id, {
        pageId,
        x: point.x,
        y: point.y,
        text,
      });
      appendComment(data.comment);
      setActiveCommentId(data.comment.id);
      setShowComments(true);
      toast.success("Comment added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!user) return <Navigate to="/login" replace />;
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">We couldn’t open this design</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/">Back to files</Link>
          </Button>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (loading || !file) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#9d7bff] to-[#6d4aff] text-white shadow-lg">
          <Sparkles className="size-5" />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Opening your canvas…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar
        onShare={() => setShareOpen(true)}
        onVersions={() => setVersionsOpen(true)}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onOpenLayers={() => {
          setPropertiesOpen(false);
          setLayersOpen(true);
        }}
        onOpenProperties={() => {
          setLayersOpen(false);
          setPropertiesOpen(true);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-panel-border bg-panel lg:flex">
          <LayersPanel />
        </aside>

        {layersOpen && (
          <Drawer side="left" title="Pages & layers" onClose={() => setLayersOpen(false)} className="lg:hidden">
            <LayersPanel />
          </Drawer>
        )}

        <main ref={hostRef} className="relative min-w-0 flex-1">
          <Canvas
            page={page}
            tool={tool}
            viewport={viewport}
            selection={selection}
            editingId={editingId}
            readOnly={readOnly}
            comments={comments}
            collaborators={collaborators}
            selfUserId={user.id}
            activeCommentId={activeCommentId}
            onCursorMove={(point) => sendPresence(point)}
            onCommentClick={(comment) => {
              setActiveCommentId(comment.id);
              setShowComments(true);
            }}
            onCreateComment={handleCreateComment}
          />
          <Toolbar readOnly={readOnly} />
          <ZoomControl hostRef={hostRef} onFit={fit} />
          <CanvasStatus />
        </main>

        <aside className="hidden w-[280px] shrink-0 flex-col border-l border-panel-border bg-panel xl:flex">
          <PropertiesPanel page={page} readOnly={readOnly} doc={doc} />
        </aside>

        {propertiesOpen && (
          <Drawer side="right" title="Design" onClose={() => setPropertiesOpen(false)} className="xl:hidden">
            <PropertiesPanel page={page} readOnly={readOnly} doc={doc} />
          </Drawer>
        )}

        {showComments && (
          <>
            <div className="fixed inset-0 z-[84] bg-black/50 backdrop-blur-sm xl:hidden" onClick={() => setShowComments(false)} />
            <div className="fixed inset-y-0 right-0 z-[85] w-[min(94vw,340px)] xl:static xl:z-auto xl:w-[300px] xl:shrink-0">
              <CommentsPanel
                activeCommentId={activeCommentId}
                onSelect={(comment) => setActiveCommentId(comment.id)}
                onClose={() => setShowComments(false)}
              />
            </div>
          </>
        )}
      </div>

      <PreviewMode />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      <VersionHistoryDialog open={versionsOpen} onOpenChange={setVersionsOpen} />
    </div>
  );
}

function Drawer({
  side,
  title,
  onClose,
  children,
  className,
}: {
  side: "left" | "right";
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={cn("fixed inset-0 z-[95]", className)}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-y-0 flex w-[min(90vw,350px)] flex-col border-panel-border bg-panel shadow-2xl",
          side === "left" ? "left-0 border-r drawer-in-left" : "right-0 border-l drawer-in-right",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-panel-border px-3">
          <span className="text-[13px] font-medium">{title}</span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

function ZoomControl({ hostRef, onFit }: { hostRef: React.RefObject<HTMLDivElement | null>; onFit: () => void }) {
  const viewport = useEditor((s) => s.viewport);
  const zoomAt = useEditor((s) => s.zoomAt);
  const setViewport = useEditor((s) => s.setViewport);
  const selection = useEditor((s) => s.selection);
  const page = useEditor((s) => getPage(s.doc, s.pageId));
  const center = () => {
    const el = hostRef.current;
    return {
      screen: { x: (el?.clientWidth ?? 800) / 2, y: (el?.clientHeight ?? 600) / 2 },
      size: { width: el?.clientWidth ?? 800, height: el?.clientHeight ?? 600 },
    };
  };
  const zoomToSelection = () => {
    const el = hostRef.current;
    if (!el || selection.length === 0) return;
    const b = boundsOf(page, selection);
    const zoom = Math.max(0.05, Math.min((el.clientWidth - 160) / Math.max(b.width, 1), (el.clientHeight - 160) / Math.max(b.height, 1), 4));
    useEditor.getState().setViewport({
      zoom,
      x: el.clientWidth / 2 - (b.x + b.width / 2) * zoom,
      y: el.clientHeight / 2 - (b.y + b.height / 2) * zoom,
    });
  };
  return (
    <div className="absolute bottom-3 right-3 z-40 flex items-center gap-0.5 rounded-lg border border-panel-border bg-panel/95 p-0.5 shadow-lg backdrop-blur sm:bottom-4 sm:right-4">
      <button
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => {
          const c = center();
          zoomAt(1 / 1.2, c.screen, c.size);
        }}
      >
        <Minus className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="min-w-[52px] rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
            {round(viewport.zoom * 100, 0)}%
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          {[25, 50, 100, 150, 200].map((z) => (
            <DropdownMenuItem
              key={z}
              onClick={() => {
                const c = center();
                useEditor.getState().setViewport({
                  zoom: z / 100,
                  x: c.screen.x - ((c.screen.x - viewport.x) / viewport.zoom) * (z / 100),
                  y: c.screen.y - ((c.screen.y - viewport.y) / viewport.zoom) * (z / 100),
                });
              }}
            >
              {z}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onFit}>Zoom to fit</DropdownMenuItem>
          <DropdownMenuItem onClick={zoomToSelection}>Zoom to selection</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const el = hostRef.current;
              if (!el) return;
              useEditor.getState().setViewport({ zoom: 1, x: el.clientWidth / 2, y: el.clientHeight / 2 });
            }}
          >
            Zoom to 100%
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => {
          const c = center();
          zoomAt(1.2, c.screen, c.size);
        }}
      >
        <Plus className="size-3.5" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={onFit}
        title="Zoom to fit (Shift+1)"
      >
        <Maximize className="size-3.5" />
      </button>
      <button
        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => setViewport({ zoom: 1, x: hostRef.current ? hostRef.current.clientWidth / 2 : 0, y: hostRef.current ? hostRef.current.clientHeight / 2 : 0 })}
        title="Reset zoom (Shift+0)"
      >
        1:1
      </button>
    </div>
  );
}

function CanvasStatus() {
  const file = useEditor((s) => s.file);
  const pageId = useEditor((s) => s.pageId);
  const pages = useEditor((s) => s.doc.pages);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const page = pages.find((p) => p.id === pageId);
  if (!file) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-3 z-30 hidden items-center gap-2 rounded-md bg-panel/80 px-2 py-1 text-[10px] text-muted-foreground shadow backdrop-blur md:flex">
      <span className="font-medium text-foreground">{page?.name}</span>
      <span>·</span>
      <span>{pages.length} pages</span>
      {selection.length > 0 && (
        <>
          <span>·</span>
          <span>{selection.length} selected</span>
        </>
      )}
      <span>·</span>
      <span className="capitalize">{tool}</span>
    </div>
  );
}
