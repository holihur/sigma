import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Frame,
  Image as ImageIcon,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MoreHorizontal,
  Plus,
  Square,
  Trash2,
  Type,
  Folder,
  Ungroup,
  Group as GroupIcon,
  ClipboardPaste,
  BringToFront,
  SendToBack,
} from "lucide-react";
import type { Page, SceneNode } from "@/lib/types";
import { toast } from "sonner";
import { useEditor } from "@/store/editor";
import { ancestorsOf, descendantsOf, getPage, nodeLabel } from "@/lib/nodes";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function LayersPanel() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const selection = useEditor((s) => s.selection);
  const setPage = useEditor((s) => s.setPage);
  const addPage = useEditor((s) => s.addPage);
  const deletePage = useEditor((s) => s.deletePage);
  const setPageName = useEditor((s) => s.setPageName);
  const select = useEditor((s) => s.select);
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const setHovered = useEditor((s) => s.setHovered);
  const toggleVisible = useEditor((s) => s.toggleVisible);
  const toggleLock = useEditor((s) => s.toggleLock);
  const renameNode = useEditor((s) => s.renameNode);
  const reparentNode = useEditor((s) => s.reparentNode);
  const readOnly = useEditor((s) => s.isReadOnly);

  const page = getPage(doc, pageId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pageRenaming, setPageRenaming] = useState<string | null>(null);
  const [pageDraft, setPageDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; position: "before" | "after" | "inside" } | null>(null);

  // Expand the ancestors of the current selection automatically.
  useEffect(() => {
    if (selection.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const id of selection) {
        for (const ancestor of ancestorsOf(page, id)) next[ancestor.id] = true;
      }
      return next;
    });
  }, [selection, page]);

  const isExpanded = (id: string) => expanded[id] !== false;

  const rows: { node: SceneNode; depth: number; parentId: string | null }[] = [];
  const walk = (ids: string[], depth: number) => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const node = page.nodes[ids[i]];
      if (!node) continue;
      rows.push({ node, depth, parentId: node.parentId });
      if (node.children.length && isExpanded(node.id)) walk(node.children, depth + 1);
    }
  };
  walk(page.rootIds, 0);

  const startRename = (node: SceneNode) => {
    setRenaming(node.id);
    setRenameDraft(node.name);
  };
  const commitRename = () => {
    if (renaming && renameDraft.trim()) renameNode(renaming, renameDraft.trim());
    setRenaming(null);
  };
  const startPageRename = (p: Page) => {
    setPageRenaming(p.id);
    setPageDraft(p.name);
  };
  const commitPageRename = () => {
    if (pageRenaming && pageDraft.trim()) setPageName(pageRenaming, pageDraft.trim());
    setPageRenaming(null);
  };

  const dropPositionFor = (e: React.DragEvent, node: SceneNode): "before" | "after" | "inside" => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
    const container = node.type === "frame" || node.type === "group";
    if (container && ratio > 0.28 && ratio < 0.72) return "inside";
    return ratio < 0.5 ? "before" : "after";
  };

  const handleDragOver = (e: React.DragEvent, node: SceneNode) => {
    const currentDrag = dragIdRef.current;
    if (!currentDrag || currentDrag === node.id) return;
    if (ancestorsOf(page, node.id).some((a) => a.id === currentDrag)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDrop({ id: node.id, position: dropPositionFor(e, node) });
  };

  const handleDrop = (e: React.DragEvent, node: SceneNode) => {
    e.preventDefault();
    e.stopPropagation();
    const movedId = dragIdRef.current;
    if (!movedId) {
      setDrop(null);
      return;
    }
    // Compute the position directly from the event as well; state updates from
    // dragover may not have flushed for synthetic drags.
    const position = drop?.id === node.id ? drop.position : dropPositionFor(e, node);
    if (position === "inside") {
      reparentNode(movedId, node.id, node.children.length);
      setExpanded((prev) => ({ ...prev, [node.id]: true }));
    } else {
      const siblings = node.parentId && page.nodes[node.parentId] ? page.nodes[node.parentId].children : page.rootIds;
      const at = siblings.indexOf(node.id);
      // Rows are displayed top-most first, so "before" means a higher z-index.
      const index = position === "before" ? at + 1 : at;
      reparentNode(movedId, node.parentId, index);
    }
    setDrop(null);
    setDragId(null);
    dragIdRef.current = null;
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pages</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                title="Add page"
                disabled={readOnly}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                onClick={() => addPage()}
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add page</TooltipContent>
          </Tooltip>
        </div>
        <div className="max-h-36 overflow-y-auto px-2 pb-1">
          {doc.pages.map((p) => (
            <div
              key={p.id}
              className={cn(
                "group flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[12px] text-muted-foreground hover:bg-secondary/70",
                p.id === pageId && "bg-secondary text-foreground",
              )}
              onClick={() => setPage(p.id)}
              onDoubleClick={() => startPageRename(p)}
            >
              {pageRenaming === p.id ? (
                <Input
                  autoFocus
                  value={pageDraft}
                  onChange={(e) => setPageDraft(e.target.value)}
                  onBlur={commitPageRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPageRename();
                    if (e.key === "Escape") setPageRenaming(null);
                    e.stopPropagation();
                  }}
                  className="h-6 border-0 px-1 text-[12px]"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate">{p.name}</span>
              )}
              {doc.pages.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex size-5 items-center justify-center rounded opacity-0 hover:bg-secondary group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => startPageRename(p)} disabled={readOnly}>
                      Rename page
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => deletePage(p.id)} disabled={readOnly}>
                      Delete page
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-panel-border px-3 pb-1.5 pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Layers</span>
          <span className="text-[10px] text-muted-foreground">{rows.length}</span>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3"
          onPointerLeave={() => setHovered(null)}
        >
          {rows.length === 0 && (
            <div className="mx-2 mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center">
              <Layers className="mx-auto mb-2 size-5 text-muted-foreground/60" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                No layers yet.
                <br />
                Press <span className="font-medium text-foreground">F</span> and drag on the canvas to add a frame.
              </p>
            </div>
          )}
          {rows.map(({ node, depth }) => {
            const selected = selection.includes(node.id);
            const container = node.children.length > 0 || node.type === "frame" || node.type === "group";
            return (
              <ContextMenu key={node.id}>
                <ContextMenuTrigger asChild>
                  <div
                    draggable
                    onDragStart={(e) => {
                      dragIdRef.current = node.id;
                      setDragId(node.id);
                      e.dataTransfer.effectAllowed = "move";
                      try {
                        e.dataTransfer.setData("text/plain", node.id);
                      } catch {
                        /* ignore */
                      }
                    }}
                    onDragEnd={() => {
                      dragIdRef.current = null;
                      setDragId(null);
                      setDrop(null);
                    }}
                    onDragOver={(e) => handleDragOver(e, node)}
                    onDragLeave={() => setDrop((d) => (d?.id === node.id ? null : d))}
                    onDrop={(e) => handleDrop(e, node)}
                    onMouseEnter={() => setHovered(node.id)}
                    onClick={(e) => {
                      if (e.shiftKey) toggleSelect(node.id);
                      else select([node.id]);
                    }}
                    onDoubleClick={() => startRename(node)}
                    className={cn(
                      "group relative flex h-7 cursor-default select-none items-center gap-1 rounded px-1.5 text-[12px] text-muted-foreground hover:bg-secondary/70",
                      selected && "bg-primary/12 text-foreground",
                      dragId === node.id && "opacity-40",
                      !node.visible && "opacity-45",
                      drop?.id === node.id && drop.position === "inside" && "ring-1 ring-primary",
                      drop?.id === node.id && drop.position === "before" && "before:absolute before:-top-px before:left-1 before:right-1 before:h-0.5 before:bg-primary",
                      drop?.id === node.id && drop.position === "after" && "after:absolute after:-bottom-px after:left-1 after:right-1 after:h-0.5 after:bg-primary",
                    )}
                    style={{ paddingLeft: 6 + depth * 12 }}
                  >
                    <button
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded hover:bg-secondary",
                        !container && "invisible",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((prev) => ({ ...prev, [node.id]: !isExpanded(node.id) }));
                      }}
                    >
                      {isExpanded(node.id) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </button>
                    <LayerIcon node={node} />
                    {renaming === node.id ? (
                      <Input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenaming(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 flex-1 border-0 px-1 text-[12px]"
                      />
                    ) : (
                      <span className={cn("flex-1 truncate", selected && "text-foreground")}>{nodeLabel(node)}</span>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5">
                      {node.locked && (
                        <button
                          className="flex size-5 items-center justify-center rounded hover:bg-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock(node.id);
                          }}
                        >
                          <Lock className="size-3 text-amber-400" />
                        </button>
                      )}
                      {!node.visible && (
                        <button
                          className="flex size-5 items-center justify-center rounded hover:bg-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVisible(node.id);
                          }}
                        >
                          <EyeOff className="size-3" />
                        </button>
                      )}
                      <div className="hidden items-center gap-0.5 group-hover:flex">
                        <button
                          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVisible(node.id);
                          }}
                          title={node.visible ? "Hide" : "Show"}
                        >
                          {node.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                        </button>
                        <button
                          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock(node.id);
                          }}
                          title={node.locked ? "Unlock" : "Lock"}
                        >
                          {node.locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <ContextMenuItem onClick={() => startRename(node)}>Rename</ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      select([node.id]);
                      useEditor.getState().duplicateSelection();
                    }}
                  >
                    <Copy className="size-3.5" /> Duplicate <ContextMenuShortcut>⌘D</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      select([node.id]);
                      useEditor.getState().copySelection();
                    }}
                  >
                    <Copy className="size-3.5" /> Copy
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      select([node.id]);
                      useEditor.getState().paste();
                    }}
                  >
                    <ClipboardPaste className="size-3.5" /> Paste
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      select([node.id]);
                      const ok = useEditor.getState().groupSelection();
                      if (!ok) toast.error("Select layers with the same parent to group");
                    }}
                  >
                    <GroupIcon className="size-3.5" /> Group selection
                  </ContextMenuItem>
                  {node.type === "group" && (
                    <ContextMenuItem
                      onClick={() => {
                        select([node.id]);
                        useEditor.getState().ungroupSelection();
                      }}
                    >
                      <Ungroup className="size-3.5" /> Ungroup
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      select([node.id]);
                      useEditor.getState().reorderSelection("front");
                    }}
                  >
                    <BringToFront className="size-3.5" /> Bring to front
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      select([node.id]);
                      useEditor.getState().reorderSelection("back");
                    }}
                  >
                    <SendToBack className="size-3.5" /> Send to back
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive"
                    onClick={() => {
                      select([node.id]);
                      useEditor.getState().deleteSelection();
                    }}
                  >
                    <Trash2 className="size-3.5" /> Delete <ContextMenuShortcut>⌫</ContextMenuShortcut>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          {/* Root drop zone */}
          {dragId && (
            <div
              className="mx-1 mt-2 flex h-8 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                reparentNode(dragIdRef.current!, null, page.rootIds.length);
                dragIdRef.current = null;
                setDragId(null);
                setDrop(null);
              }}
            >
              Drop here to move to canvas root
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function LayerIcon({ node }: { node: SceneNode }) {
  const cls = "size-3.5 shrink-0";
  switch (node.type) {
    case "frame":
      return <Frame className={cn(cls, "text-blue-400")} />;
    case "group":
      return <Folder className={cn(cls, "text-amber-400")} />;
    case "rect":
      return <Square className={cls} />;
    case "ellipse":
      return <Circle className={cls} />;
    case "text":
      return <Type className={cls} />;
    case "image":
      return <ImageIcon className={cls} />;
    case "line":
      return <Minus className={cls} />;
    default:
      return <Square className={cls} />;
  }
}

export function countLayers(page: Page): number {
  return Object.keys(page.nodes).length;
}

export function nodeDepth(page: Page, id: string): number {
  return ancestorsOf(page, id).length;
}

export function allDescendants(page: Page, id: string) {
  return descendantsOf(page, id);
}
