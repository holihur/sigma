import React, { useEffect, useRef } from "react";
import type { Page, SceneNode, Tool } from "@/lib/types";
import { nodeLabel, paintToCss, shadowToCss } from "@/lib/nodes";
import { vectorPathData, vectorSubpaths } from "@/lib/vector";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Image as ImageIcon, Lock } from "lucide-react";

export interface NodeViewContext {
  page: Page;
  editable: boolean;
  interactive: boolean;
  tool: Tool;
  panMode?: boolean;
  zoom: number;
  selected: Set<string>;
  hoveredId: string | null;
  editingId: string | null;
  onPointerDown?: (event: React.PointerEvent, id: string) => void;
  onDoubleClick?: (event: React.MouseEvent, id: string) => void;
  onContextMenu?: (event: React.MouseEvent, id: string) => void;
  onTextChange?: (id: string, text: string) => void;
  onEditEnd?: () => void;
  onTextFocus?: () => void;
  hideLockedIndicator?: boolean;
}

export function NodeView({ node, ctx }: { node: SceneNode; ctx: NodeViewContext }) {
  const { page, interactive, tool, selected, hoveredId, editingId } = ctx;
  const t = useT();
  const isSelected = selected.has(node.id);
  const canInteract = interactive && tool === "select" && !ctx.panMode && !node.locked;

  const fill = paintToCss(node.fill);
  const strokeColor = node.stroke ? paintToCss(node.stroke) : "transparent";
  const shadows: string[] = [];
  if (node.shadow) shadows.push(shadowToCss(node.shadow)!);
  if (node.strokeWidth > 0 && node.stroke) shadows.push(`inset 0 0 0 ${node.strokeWidth}px ${strokeColor}`);

  const layoutParent = node.parentId ? page.nodes[node.parentId] : null;
  const inAutoLayout = !!layoutParent && layoutParent.type === "frame" && (layoutParent.layout === "horizontal" || layoutParent.layout === "vertical");
  const style: React.CSSProperties = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    transformOrigin: "center center",
    opacity: node.opacity,
    display: node.visible ? undefined : "none",
    pointerEvents: canInteract ? "auto" : "none",
    zIndex: undefined,
    transition: inAutoLayout ? "left 160ms cubic-bezier(.2,.8,.2,1), top 160ms cubic-bezier(.2,.8,.2,1), width 160ms ease, height 160ms ease" : undefined,
  };

  const innerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    background: node.type === "group" || node.type === "line" || node.type === "text" || node.type === "vector" ? undefined : fill,
    borderRadius: node.type === "ellipse" ? "50%" : node.radius || undefined,
    boxShadow: shadows.length ? shadows.join(", ") : undefined,
    filter: node.blur ? `blur(${node.blur}px)` : undefined,
    overflow: node.clip || node.type === "text" || node.type === "image" ? "hidden" : "visible",
    position: "relative",
  };

  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the DOM id stable for export / hit testing.
  useEffect(() => {
    if (wrapRef.current) wrapRef.current.dataset.nodeId = node.id;
  }, [node.id]);

  const renderChildren = () => {
    if (!node.children.length) return null;
    return node.children.map((childId) => {
      const child = page.nodes[childId];
      if (!child) return null;
      return <NodeView key={childId} node={child} ctx={ctx} />;
    });
  };

  let content: React.ReactNode = null;
  if (node.type === "text") {
    const textStyle: React.CSSProperties = {
      fontFamily: node.fontFamily,
      fontSize: node.fontSize,
      fontWeight: node.fontWeight,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
      color: paintToCss(node.fill, "#111827"),
      textAlign: node.textAlign,
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: node.verticalAlign === "top" ? "flex-start" : node.verticalAlign === "middle" ? "center" : "flex-end",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflow: "hidden",
    };
    if (editingId === node.id && ctx.editable) {
      content = (
        <TextEditor
          node={node}
          style={textStyle}
          onChange={(value) => ctx.onTextChange?.(node.id, value)}
          onDone={() => ctx.onEditEnd?.()}
          onFocus={() => ctx.onTextFocus?.()}
        />
      );
    } else {
      content = (
        <div style={textStyle}>
          <div style={{ width: "100%" }}>{node.text || ""}</div>
        </div>
      );
    }
  } else if (node.type === "image") {
    content = node.src ? (
      <img
        src={node.src}
        alt={node.name}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: node.objectFit, display: "block" }}
      />
    ) : (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <ImageIcon className="size-6 opacity-60" />
        <span className="text-[11px]">{t("Double-click to replace")}</span>
      </div>
    );
    if (!node.src) {
      innerStyle.backgroundImage =
        "repeating-linear-gradient(45deg, color-mix(in oklch, var(--foreground) 4%, transparent) 0 10px, transparent 10px 20px)";
    }
  } else if (node.type === "line") {
    const sw = Math.max(node.strokeWidth, 1);
    content = (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${Math.max(node.width, 1)} ${Math.max(Math.abs(node.height), 1)}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible", display: "block" }}
      >
        <line
          x1={0}
          y1={node.height >= 0 ? 0 : Math.abs(node.height)}
          x2={node.width}
          y2={node.height >= 0 ? Math.abs(node.height) : 0}
          stroke={strokeColor}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  } else if (node.type === "vector") {
    const d = vectorPathData(node);
    content =
      d ? (
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }}>
          <path
            d={d}
            fill={vectorSubpaths(node).some((s) => s.closed) ? fill : "none"}
            fillRule={node.fillRule ?? "nonzero"}
            stroke={strokeColor}
            strokeWidth={node.strokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null;
  } else if (node.type === "frame" || node.type === "group") {
    content = renderChildren();
  }

  return (
    <div
      ref={wrapRef}
      data-node-id={node.id}
      data-node-type={node.type}
      style={style}
      className={cn("editor-surface", node.type === "group" && "pointer-events-none")}
      onPointerDown={(e) => {
        if (!canInteract || node.type === "group") return;
        e.stopPropagation();
        ctx.onPointerDown?.(e, node.id);
      }}
      onDoubleClick={(e) => {
        if (!canInteract) return;
        e.stopPropagation();
        ctx.onDoubleClick?.(e, node.id);
      }}
      onContextMenu={(e) => {
        if (!canInteract) return;
        e.stopPropagation();
        e.preventDefault();
        ctx.onContextMenu?.(e, node.id);
      }}
    >
      <div style={innerStyle} data-role="visual">
        {content}
      </div>
      {node.locked && !ctx.hideLockedIndicator && interactive && (
        <div className="absolute -right-1 -top-1 rounded-full bg-popover p-0.5 text-muted-foreground shadow">
          <Lock className="size-2.5" />
        </div>
      )}
      {isSelected && node.type === "frame" ? null : null}
      {hoveredId === node.id && !isSelected ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ outline: "1px solid color-mix(in oklch, var(--primary) 55%, transparent)" }}
        />
      ) : null}
    </div>
  );
}

function TextEditor({
  node,
  style,
  onChange,
  onDone,
  onFocus,
}: {
  node: SceneNode;
  style: React.CSSProperties;
  onChange: (value: string) => void;
  onDone: () => void;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);
  return (
    <textarea
      ref={ref}
      value={node.text}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onDone();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onDone();
        }
        e.stopPropagation();
      }}
      onFocus={onFocus}
      className="text-node-editor absolute inset-0 z-10"
      style={style}
    />
  );
}

export { nodeLabel };
