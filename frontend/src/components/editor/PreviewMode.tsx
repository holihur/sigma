import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  MousePointerClick,
  Play,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import type { Page, SceneNode, Transition } from "@/lib/types";
import { descendantsOf, getPage, nodeAABB } from "@/lib/nodes";
import { useEditor } from "@/store/editor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NodeView, type NodeViewContext } from "./NodeView";

type Location = { pageId: string; frameId: string };

export function PreviewMode({ onClose, publicMode }: { onClose?: () => void; publicMode?: boolean } = {}) {
  const open = useEditor((s) => s.previewOpen);
  const closeStore = useEditor((s) => s.closePreview);
  const close = onClose ?? closeStore;
  const doc = useEditor((s) => s.doc);
  const file = useEditor((s) => s.file);
  const initialFrame = useEditor((s) => s.previewFrameId);
  const currentPageId = useEditor((s) => s.pageId);
  const [location, setLocation] = useState<Location | null>(null);
  const [history, setHistory] = useState<Location[]>([]);
  const [anim, setAnim] = useState<{ transition: Transition; nonce: number } | null>(null);
  const [showHotspots, setShowHotspots] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef<Location | null>(null);

  const frames = useMemo(
    () =>
      doc.pages.flatMap((p) =>
        p.rootIds
          .map((id) => p.nodes[id])
          .filter((n): n is SceneNode => !!n && n.type === "frame")
          .map((n) => ({ pageId: p.id, pageName: p.name, frame: n })),
      ),
    [doc],
  );

  useEffect(() => {
    if (!open) {
      setLocation(null);
      setHistory([]);
      setAnim(null);
      initialRef.current = null;
      return;
    }
    let loc: Location | null = null;
    if (initialFrame) {
      const page = doc.pages.find((p) => p.nodes[initialFrame]);
      if (page) loc = { pageId: page.id, frameId: initialFrame };
    }
    if (!loc) {
      const page = getPage(doc, currentPageId);
      const frameId = page.rootIds.find((id) => page.nodes[id]?.type === "frame");
      if (frameId) loc = { pageId: page.id, frameId };
    }
    if (!loc && frames[0]) loc = { pageId: frames[0].pageId, frameId: frames[0].frame.id };
    setLocation(loc);
    initialRef.current = loc;
    setHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFrame, currentPageId]);

  // Track stage size for fitting.
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, location]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" || e.key === "Backspace") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const page = location ? getPage(doc, location.pageId) : null;
  const frame = page && location ? page.nodes[location.frameId] : null;

  if (!frame || frame.type !== "frame") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0b0d] text-white">
        <PreviewToolbar
          title={file?.name ?? "Prototype"}
          frames={frames}
          value=""
          onClose={close}
          onSelect={(value) => {
            const [pageId, frameId] = value.split("|");
            setLocation({ pageId, frameId });
            setHistory([]);
          }}
          onRestart={() => undefined}
          scale={1}
          showHotspots={showHotspots}
          setShowHotspots={setShowHotspots}
          canBack={false}
          onBack={goBack}
          publicMode={publicMode}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/5">
            <MousePointerClick className="size-6 text-white/50" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">No frame to present</h2>
            <p className="mt-1 text-sm text-white/50">Draw a frame on the canvas, then present again.</p>
          </div>
          <Button variant="secondary" onClick={close}>
            Back to canvas
          </Button>
        </div>
      </div>
    );
  }

  const frameBounds = nodeAABB(page!, frame);
  const padding = 64;
  const scale = Math.max(
    0.05,
    Math.min((stageSize.width - padding * 2) / Math.max(frameBounds.width, 1), (stageSize.height - padding * 2) / Math.max(frameBounds.height, 1), 1.6),
  );
  const left = stageSize.width / 2 - (frameBounds.width * scale) / 2 - frameBounds.x * scale;
  const top = stageSize.height / 2 - (frameBounds.height * scale) / 2 - frameBounds.y * scale;

  const hotspots = collectHotspots(page!, frame);
  const animClass =
    anim?.transition === "dissolve"
      ? "animate-fade"
      : anim?.transition === "slide-left"
        ? "preview-slide-left"
        : anim?.transition === "slide-up"
          ? "preview-slide-up"
          : "";

  const navigate = (targetPageId: string, targetFrameId: string, transition: Transition) => {
    if (!location) return;
    setHistory((h) => [...h, location]);
    setAnim({ transition, nonce: Date.now() });
    setLocation({ pageId: targetPageId, frameId: targetFrameId });
  };

  function goBack() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const next = h[h.length - 1];
      const prevLoc = h[h.length - 2];
      setAnim({ transition: "dissolve", nonce: Date.now() });
      setLocation(next);
      return prevLoc ? h.slice(0, -1) : [];
    });
  }

  const previewCtx: NodeViewContext = {
    page: page!,
    editable: false,
    interactive: false,
    tool: "hand",
    panMode: true,
    zoom: scale,
    selected: new Set(),
    hoveredId: null,
    editingId: null,
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0a0a0c] text-white">
      <PreviewToolbar
        title={file?.name ?? "Prototype"}
        frames={frames}
        value={`${location!.pageId}|${location!.frameId}`}
        onClose={close}
        onSelect={(value) => {
          const [pageId, frameId] = value.split("|");
          setLocation({ pageId, frameId });
          setHistory([]);
        }}
        onRestart={() => {
          if (initialRef.current) {
            setLocation(initialRef.current);
            setHistory([]);
            setAnim({ transition: "dissolve", nonce: Date.now() });
          }
        }}
        scale={scale}
        showHotspots={showHotspots}
        setShowHotspots={setShowHotspots}
        canBack={history.length > 0}
        onBack={goBack}
        publicMode={publicMode}
      />

      <div ref={stageRef} className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div
          key={anim ? anim.nonce : "static"}
          className={cn("absolute origin-top-left", animClass)}
          style={{
            left,
            top,
            width: frameBounds.width,
            height: frameBounds.height,
            transform: `scale(${scale})`,
            filter: "drop-shadow(0 24px 60px rgba(0,0,0,.55))",
          }}
        >
          <div style={{ width: frameBounds.width, height: frameBounds.height, position: "relative", background: frame.fill ? undefined : "#fff" }}>
            <NodeView node={frame} ctx={previewCtx} />
            {showHotspots &&
              hotspots.map(({ node, bounds }) => (
                <div
                  key={node.id}
                  className="pointer-events-none absolute rounded-sm border border-dashed border-[#7c5cff] bg-[#7c5cff]/15"
                  style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
                />
              ))}
            {hotspots.map(({ node, bounds }) => (
              <button
                key={`hot-${node.id}`}
                className="absolute cursor-pointer rounded-sm outline-none transition-colors hover:bg-[#7c5cff]/15 focus-visible:bg-[#7c5cff]/20"
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  background: "transparent",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const link = node.link!;
                  if (link.action === "back") {
                    goBack();
                  } else if (link.action === "url") {
                    if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
                  } else if (link.action === "navigate" && link.targetFrameId && link.targetPageId) {
                    if (doc.pages.some((p) => p.id === link.targetPageId && p.nodes[link.targetFrameId!])) {
                      navigate(link.targetPageId, link.targetFrameId, link.transition ?? "instant");
                    }
                  }
                }}
                title={node.link?.action === "url" ? node.link.url : `Go to ${frameName(doc.pages, node.link)}`}
              />
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[92vw] -translate-x-1/2 truncate rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] text-white/60 backdrop-blur sm:bottom-4 sm:text-[11px]">
          {frame.name} · {Math.round(scale * 100)}% · {hotspots.length} hotspot{hotspots.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function PreviewToolbar({
  title,
  frames,
  value,
  onClose,
  onSelect,
  onRestart,
  scale,
  showHotspots,
  setShowHotspots,
  canBack,
  onBack,
  publicMode,
}: {
  title: string;
  frames: { pageId: string; pageName: string; frame: SceneNode }[];
  value: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  onRestart: () => void;
  scale: number;
  showHotspots: boolean;
  setShowHotspots: (v: boolean) => void;
  canBack: boolean;
  onBack: () => void;
  publicMode?: boolean;
}) {
  return (
    <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#111114]/90 px-2 py-2 backdrop-blur sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0">
      <button onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white sm:size-8">
        <X className="size-4" />
      </button>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#9d7bff] to-[#6d4aff] text-white">
        <Play className="size-3.5 fill-current" />
      </div>
      <div className="min-w-0 flex-1 sm:flex-none">
        <div className="truncate text-[12px] font-medium">{title}</div>
        <div className="hidden text-[10px] text-white/40 sm:block">{publicMode ? "Public prototype · read only" : "Prototype presentation"}</div>
      </div>

      <div className="order-last flex w-full items-center gap-2 sm:order-none sm:mx-auto sm:w-auto">
        <button
          onClick={onBack}
          disabled={!canBack}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-25 sm:size-8"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Select value={value} onValueChange={onSelect}>
          <SelectTrigger className="h-9 w-full border-white/10 bg-white/5 text-[12px] text-white sm:h-8 sm:w-56">
            <SelectValue placeholder="Choose a frame" />
          </SelectTrigger>
          <SelectContent>
            {frames.map((f) => (
              <SelectItem key={`${f.pageId}|${f.frame.id}`} value={`${f.pageId}|${f.frame.id}`}>
                {f.pageName} / {f.frame.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={onRestart}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white sm:size-8"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>

      <button
        onClick={() => setShowHotspots(!showHotspots)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] text-white/60 hover:bg-white/10 hover:text-white sm:h-8 sm:px-2.5",
          showHotspots && "bg-white/10 text-white",
        )}
      >
        <MousePointerClick className="size-3.5" /> <span className="hidden sm:inline">Hotspots</span>
      </button>
      <div className="hidden items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/50 md:flex">
        <ZoomOut className="size-3" />
        {Math.round(scale * 100)}%
        <ZoomIn className="size-3" />
      </div>
      <ExternalLink className="hidden size-3.5 text-white/30 lg:block" />
      <Maximize2 className="hidden size-3.5 text-white/30 lg:block" />
    </div>
  );
}

function collectHotspots(page: Page, frame: SceneNode): { node: SceneNode; bounds: ReturnType<typeof nodeAABB> }[] {
  const out: { node: SceneNode; bounds: ReturnType<typeof nodeAABB> }[] = [];
  const walk = (node: SceneNode) => {
    if (node.link && node.link.action !== "none") out.push({ node, bounds: nodeAABB(page, node) });
    for (const childId of node.children) {
      const child = page.nodes[childId];
      if (child) walk(child);
    }
  };
  walk(frame);
  return out;
}

function frameName(pages: Page[], link: SceneNode["link"]): string {
  if (!link?.targetPageId || !link?.targetFrameId) return "target";
  const page = pages.find((p) => p.id === link.targetPageId);
  return page?.nodes[link.targetFrameId]?.name ?? "target";
}

// Keep descendants import referenced for potential future hotspot filtering.
void descendantsOf;
