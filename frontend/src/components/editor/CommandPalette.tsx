import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, Box, Circle, Command as CommandIcon,
  Component as ComponentIcon, Copy, Download, FileDown, FileUp, Frame, Group as GroupIcon,
  Hand, Image as ImageIcon, Layers, LayoutGrid, MessageCircle, Minus, Moon, MousePointer2,
  Palette, PenTool, Play, Redo2, Search, Share2, SlidersHorizontal, Sparkles, Square,
  Sun, Trash2, Type, Undo2, Ungroup, ZoomIn, Rows3, Columns3,
} from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor";
import { useI18n, useT } from "@/i18n";
import { useTheme } from "@/store/theme";
import { boundsOf, getPage } from "@/lib/nodes";
import { cn } from "@/lib/utils";

interface Action {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  keywords?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  hostRef,
  onShare,
  onVersions,
  onAI,
  onComponents,
  onStyles,
  onFind,
  onImportSVG,
  onExportFigma,
  onDeveloper,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostRef: React.RefObject<HTMLDivElement | null>;
  onShare: () => void;
  onVersions: () => void;
  onAI: () => void;
  onComponents: () => void;
  onStyles: () => void;
  onFind: () => void;
  onImportSVG: () => void;
  onExportFigma: () => void;
  onDeveloper: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selection = useEditor((s) => s.selection);
  const pageId = useEditor((s) => s.pageId);
  const doc = useEditor((s) => s.doc);
  const locale = useI18n((s) => s.locale);
  const toggleLocale = useI18n((s) => s.toggle);
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  const run = (action: Action) => {
    onOpenChange(false);
    setTimeout(() => action.run(), 0);
  };

  const actions = useMemo<Action[]>(() => {
    const st = useEditor.getState();
    const page = getPage(st.doc, st.pageId);
    const host = hostRef.current;
    const width = host?.clientWidth ?? 900;
    const height = host?.clientHeight ?? 700;
    const selected = st.selection.length;
    const zoomSelection = () => {
      if (!selected) return;
      const b = boundsOf(page, st.selection);
      const zoom = Math.max(0.02, Math.min((width - 160) / Math.max(b.width, 1), (height - 160) / Math.max(b.height, 1), 4));
      st.setViewport({
        zoom,
        x: width / 2 - (b.x + b.width / 2) * zoom,
        y: height / 2 - (b.y + b.height / 2) * zoom,
      });
    };
    const list: Action[] = [
      { id: "tool-move", label: "Move", group: "Tools", shortcut: "V", icon: <MousePointer2 className="size-3.5" />, run: () => st.setTool("select") },
      { id: "tool-hand", label: "Hand", group: "Tools", shortcut: "H", icon: <Hand className="size-3.5" />, run: () => st.setTool("hand") },
      { id: "tool-frame", label: "Frame", group: "Tools", shortcut: "F", icon: <Frame className="size-3.5" />, run: () => st.setTool("frame") },
      { id: "tool-rect", label: "Rectangle", group: "Tools", shortcut: "R", icon: <Square className="size-3.5" />, run: () => st.setTool("rect") },
      { id: "tool-ellipse", label: "Ellipse", group: "Tools", shortcut: "O", icon: <Circle className="size-3.5" />, run: () => st.setTool("ellipse") },
      { id: "tool-line", label: "Line", group: "Tools", shortcut: "L", icon: <Minus className="size-3.5" />, run: () => st.setTool("line") },
      { id: "tool-vector", label: "Pen / vector", group: "Tools", shortcut: "P", icon: <PenTool className="size-3.5" />, run: () => st.setTool("vector") },
      { id: "tool-text", label: "Text", group: "Tools", shortcut: "T", icon: <Type className="size-3.5" />, run: () => st.setTool("text") },
      { id: "tool-image", label: "Place image", group: "Tools", shortcut: "⇧I", icon: <ImageIcon className="size-3.5" />, run: () => st.setTool("image") },
      { id: "tool-comment", label: "Comment", group: "Tools", shortcut: "C", icon: <MessageCircle className="size-3.5" />, run: () => st.setTool("comment") },

      { id: "undo", label: "Undo", group: "Edit", shortcut: "⌘Z", icon: <Undo2 className="size-3.5" />, run: st.undo },
      { id: "redo", label: "Redo", group: "Edit", shortcut: "⇧⌘Z", icon: <Redo2 className="size-3.5" />, run: st.redo },
      { id: "cut", label: "Cut", group: "Edit", shortcut: "⌘X", icon: <Copy className="size-3.5" />, run: st.cutSelection },
      { id: "copy", label: "Copy", group: "Edit", shortcut: "⌘C", icon: <Copy className="size-3.5" />, run: st.copySelection },
      { id: "paste", label: "Paste", group: "Edit", shortcut: "⌘V", icon: <Copy className="size-3.5" />, run: () => st.paste(false) },
      { id: "paste-place", label: "Paste in place", group: "Edit", shortcut: "⇧⌘V", icon: <Copy className="size-3.5" />, run: () => st.paste(true) },
      { id: "duplicate", label: "Duplicate", group: "Edit", shortcut: "⌘D", icon: <Copy className="size-3.5" />, run: () => st.duplicateSelection() },
      { id: "delete", label: "Delete selection", group: "Edit", shortcut: "⌫", icon: <Trash2 className="size-3.5" />, run: st.deleteSelection },
      { id: "copy-style", label: "Copy style", group: "Edit", shortcut: "⌘⌥C", icon: <Palette className="size-3.5" />, run: st.copyStyle },
      { id: "paste-style", label: "Paste style", group: "Edit", shortcut: "⌘⌥V", icon: <Palette className="size-3.5" />, run: st.pasteStyle, },
      { id: "select-all", label: "Select all", group: "Edit", shortcut: "⌘A", icon: <Layers className="size-3.5" />, run: () => st.select(getPage(st.doc, st.pageId).rootIds) },

      { id: "group", label: "Group selection", group: "Arrange", shortcut: "⌘G", icon: <GroupIcon className="size-3.5" />, run: () => { if (!st.groupSelection()) toast.error(t("Select layers with the same parent to group")); } },
      { id: "ungroup", label: "Ungroup", group: "Arrange", shortcut: "⇧⌘G", icon: <Ungroup className="size-3.5" />, run: st.ungroupSelection },
      { id: "frame-selection", label: "Frame selection", group: "Arrange", shortcut: "⌘⌥G", icon: <Frame className="size-3.5" />, run: () => st.frameSelection() },
      { id: "component", label: "Create component", group: "Arrange", icon: <ComponentIcon className="size-3.5" />, run: () => { if (!st.createComponent()) toast.error(t("Select one layer to create a component")); } },
      { id: "layout-horizontal", label: "Auto layout horizontal", group: "Arrange", icon: <Rows3 className="size-3.5" />, run: () => { if (selected === 1) st.updateNode(st.selection[0], { layout: "horizontal" }, true); } },
      { id: "layout-vertical", label: "Auto layout vertical", group: "Arrange", icon: <Columns3 className="size-3.5" />, run: () => { if (selected === 1) st.updateNode(st.selection[0], { layout: "vertical" }, true); } },
      { id: "front", label: "Bring to front", group: "Arrange", shortcut: "⇧⌘]", icon: <LayoutGrid className="size-3.5" />, run: () => st.reorderSelection("front") },
      { id: "back", label: "Send to back", group: "Arrange", shortcut: "⇧⌘[", icon: <LayoutGrid className="size-3.5" />, run: () => st.reorderSelection("back") },
      { id: "align-left", label: "Align left", group: "Arrange", icon: <AlignStartVertical className="size-3.5" />, run: () => st.align("left") },
      { id: "align-hcenter", label: "Align horizontal centers", group: "Arrange", icon: <AlignCenterVertical className="size-3.5" />, run: () => st.align("hcenter") },
      { id: "align-right", label: "Align right", group: "Arrange", icon: <AlignEndVertical className="size-3.5" />, run: () => st.align("right") },
      { id: "align-top", label: "Align top", group: "Arrange", icon: <AlignStartHorizontal className="size-3.5" />, run: () => st.align("top") },
      { id: "align-vcenter", label: "Align vertical centers", group: "Arrange", icon: <AlignCenterHorizontal className="size-3.5" />, run: () => st.align("vcenter") },
      { id: "align-bottom", label: "Align bottom", group: "Arrange", icon: <AlignEndHorizontal className="size-3.5" />, run: () => st.align("bottom") },

      { id: "fit", label: "Zoom to fit", group: "View", shortcut: "⇧1", icon: <Box className="size-3.5" />, run: () => st.fitView(width, height) },
      { id: "zoom-selection", label: "Zoom to selection", group: "View", shortcut: "⇧2", icon: <ZoomIn className="size-3.5" />, run: zoomSelection },
      { id: "zoom-100", label: "Zoom to 100%", group: "View", shortcut: "⇧0", icon: <ZoomIn className="size-3.5" />, run: () => st.setViewport({ zoom: 1, x: width / 2, y: height / 2 }) },
      { id: "layers", label: "Pages & layers", group: "Panels", icon: <Layers className="size-3.5" />, run: () => window.dispatchEvent(new CustomEvent("sigma:open-layers")) },
      { id: "properties", label: "Properties", group: "Panels", icon: <SlidersHorizontal className="size-3.5" />, run: () => window.dispatchEvent(new CustomEvent("sigma:open-properties")) },
      { id: "find", label: "Find in file", group: "Panels", shortcut: "⌘F", icon: <Search className="size-3.5" />, run: onFind },

      { id: "share", label: "Share", group: "File", icon: <Share2 className="size-3.5" />, run: onShare },
      { id: "present", label: "Present", group: "File", icon: <Play className="size-3.5" />, run: () => st.openPreview(null) },
      { id: "versions", label: "Version history", group: "File", icon: <Download className="size-3.5" />, run: onVersions },
      { id: "components-dialog", label: "Insert component…", group: "File", icon: <ComponentIcon className="size-3.5" />, run: onComponents },
      { id: "styles", label: "Local styles", group: "File", icon: <Palette className="size-3.5" />, run: onStyles },
      { id: "agent-context", label: "Developer & MCP", group: "File", icon: <CommandIcon className="size-3.5" />, run: onDeveloper },
      { id: "export-figma", label: "Export Figma JSON", group: "File", icon: <FileDown className="size-3.5" />, run: onExportFigma },
      { id: "import-svg", label: "Import SVG", group: "File", icon: <FileUp className="size-3.5" />, run: onImportSVG },

      { id: "ai", label: "AI assistant", group: "AI", icon: <Sparkles className="size-3.5" />, run: onAI },
      { id: "theme", label: theme === "dark" ? "Light theme" : "Dark theme", group: "Preferences", icon: theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />, run: toggleTheme },
      { id: "language", label: locale === "en" ? "中文" : "English", group: "Preferences", icon: <CommandIcon className="size-3.5" />, run: toggleLocale },
    ];
    return list;
  }, [hostRef, onAI, onComponents, onDeveloper, onExportFigma, onFind, onImportSVG, onShare, onStyles, onVersions, theme, locale, toggleTheme, toggleLocale, t, selection, pageId, doc]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => `${a.label} ${a.group} ${a.keywords ?? ""} ${a.id}`.toLowerCase().includes(q));
  }, [actions, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[230] flex items-start justify-center bg-black/45 px-3 pt-[12vh] backdrop-blur-sm" onMouseDown={() => onOpenChange(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-panel-border bg-panel shadow-2xl animate-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-panel-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); onOpenChange(false); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter" && filtered[active]) { e.preventDefault(); run(filtered[active]); }
              e.stopPropagation();
            }}
            placeholder={t("Search commands, tools and actions…")}
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[58vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="px-3 py-10 text-center text-[12px] text-muted-foreground">{t("No commands match your search.")}</div>
          )}
          {filtered.map((action, index) => {
            const header = action.group !== lastGroup ? action.group : "";
            lastGroup = action.group;
            return (
              <React.Fragment key={action.id}>
                {header && <div className="px-2.5 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{t(header)}</div>}
                <button
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(action)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-foreground/90",
                    index === active && "bg-primary/12 text-foreground",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary/70 text-muted-foreground">{action.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{t(action.label)}</span>
                  {action.shortcut && <span className="text-[10px] text-muted-foreground">{action.shortcut}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-panel-border px-3 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ {t("Navigate")}</span>
          <span>↵ {t("Run")}</span>
          <span className="ml-auto">{t("Quick actions")}</span>
        </div>
      </div>
    </div>
  );
}
