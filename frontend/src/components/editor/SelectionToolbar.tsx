import React from "react";
import { Component as ComponentIcon, Copy, Frame, Group as GroupIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { boundsOf, getPage } from "@/lib/nodes";
import { cn } from "@/lib/utils";

export function SelectionToolbar({ hostRef }: { hostRef: React.RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const pageId = useEditor((s) => s.pageId);
  const doc = useEditor((s) => s.doc);
  const viewport = useEditor((s) => s.viewport);
  const editingId = useEditor((s) => s.editingId);
  const readOnly = useEditor((s) => s.isReadOnly);
  const tool = useEditor((s) => s.tool);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const groupSelection = useEditor((s) => s.groupSelection);
  const frameSelection = useEditor((s) => s.frameSelection);
  const createComponent = useEditor((s) => s.createComponent);
  const styleClipboard = useEditor((s) => s.styleClipboard);
  const pasteStyle = useEditor((s) => s.pasteStyle);

  if (readOnly || editingId || selection.length === 0 || tool !== "select") return null;
  const page = getPage(doc, pageId);
  const selected = selection.map((id) => page.nodes[id]).filter(Boolean);
  if (selected.length === 0) return null;
  const bounds = boundsOf(page, selection);
  const host = hostRef.current;
  const width = host?.clientWidth ?? 900;
  const x = bounds.x * viewport.zoom + viewport.x;
  const y = bounds.y * viewport.zoom + viewport.y;
  const bottom = (bounds.y + bounds.height) * viewport.zoom + viewport.y;
  const scale = bounds.width * viewport.zoom;
  const left = Math.max(8, Math.min(width - 300, x + Math.max(0, scale / 2 - 130)));
  const top = y > 64 ? y - 44 : Math.max(56, bottom + 10);
  const single = selected.length === 1 ? selected[0] : null;
  const canComponent = !!single && !single.component && !single.componentId;

  const button = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button
      key={label}
      type="button"
      title={t(label)}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
    >
      {icon}
    </button>
  );

  return (
    <div
      className={cn(
        "absolute z-[45] flex items-center gap-0.5 rounded-lg border border-panel-border bg-panel/95 p-0.5 shadow-xl backdrop-blur",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ left, top }}
    >
      {button("Duplicate", <Copy className="size-3.5" />, () => duplicateSelection())}
      {button("Frame selection", <Frame className="size-3.5" />, () => {
        if (!frameSelection()) toast.error(t("Select layers to frame"));
      })}
      {button("Group selection", <GroupIcon className="size-3.5" />, () => {
        if (!groupSelection()) toast.error(t("Select layers with the same parent to group"));
      }, selection.length < 2)}
      {button("Create component", <ComponentIcon className="size-3.5" />, () => {
        if (!createComponent()) toast.error(t("Select one layer to create a component"));
      }, !canComponent)}
      <span className="mx-0.5 h-4 w-px bg-border" />
      {button("Paste style", <span className="text-[10px] font-semibold">Aa</span>, pasteStyle, !styleClipboard)}
      <span className="mx-0.5 h-4 w-px bg-border" />
      {button("Delete", <Trash2 className="size-3.5" />, deleteSelection)}
    </div>
  );
}
