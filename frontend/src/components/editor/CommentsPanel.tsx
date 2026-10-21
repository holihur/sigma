import React, { useMemo, useState } from "react";
import { CheckCircle2, CircleDot, MessageCircle, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { commentsApi } from "@/lib/api";
import type { Comment } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { cn, formatRelative, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CommentsPanel({
  activeCommentId,
  onSelect,
  onClose,
}: {
  activeCommentId: string | null;
  onSelect: (comment: Comment) => void;
  onClose: () => void;
}) {
  const t = useT();
  const comments = useEditor((s) => s.comments);
  const pageId = useEditor((s) => s.pageId);
  const doc = useEditor((s) => s.doc);
  const file = useEditor((s) => s.file);
  const setPage = useEditor((s) => s.setPage);
  const select = useEditor((s) => s.select);
  const setComments = useEditor((s) => s.setComments);
  const updateComment = useEditor((s) => s.updateComment);
  const removeComment = useEditor((s) => s.removeComment);
  const setTool = useEditor((s) => s.setTool);
  const user = useAuth((s) => s.user);
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [scope, setScope] = useState<"page" | "all">("page");

  const visible = useMemo(() => {
    return comments
      .filter((c) => (scope === "page" ? c.pageId === pageId : true))
      .filter((c) => (filter === "open" ? !c.resolved : c.resolved))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [comments, scope, pageId, filter]);

  const openCount = comments.filter((c) => !c.resolved).length;
  const pageName = (id: string) => doc.pages.find((p) => p.id === id)?.name ?? "Page";

  const focus = (comment: Comment) => {
    if (comment.pageId !== pageId) setPage(comment.pageId);
    if (comment.nodeId) select([comment.nodeId]);
    onSelect(comment);
  };

  const resolve = async (comment: Comment, resolved: boolean) => {
    try {
      const data = await commentsApi.resolve(comment.id, resolved);
      setComments(data.comments);
      toast.success(resolved ? t("Comment resolved") : t("Comment reopened"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (comment: Comment) => {
    try {
      await commentsApi.remove(comment.id);
      removeComment(comment.id);
      toast.success(t("Comment deleted"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-panel-border bg-panel">
      <div className="flex h-12 items-center gap-2 border-b border-panel-border px-3">
        <MessageCircle className="size-4 text-primary" />
        <span className="text-[13px] font-medium">{t("Comments")}</span>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{openCount} open</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="border-b border-panel-border px-3 py-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "open" | "resolved")}>
          <TabsList className="w-full">
            <TabsTrigger value="open" className="flex-1">
              {t("Open")}
            </TabsTrigger>
            <TabsTrigger value="resolved" className="flex-1">
              {t("Resolved")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex rounded-md border border-input p-0.5">
            <button
              className={cn("rounded px-2 py-0.5 text-[10px]", scope === "page" && "bg-secondary text-foreground")}
              onClick={() => setScope("page")}
            >
              {t("This page")}
            </button>
            <button
              className={cn("rounded px-2 py-0.5 text-[10px]", scope === "all" && "bg-secondary text-foreground")}
              onClick={() => setScope("all")}
            >
              {t("All pages")}
            </button>
          </div>
          <Button size="xs" variant="ghost" onClick={() => setTool("comment")}>
            <Plus className="size-3" /> {t("Add")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.length === 0 && (
          <div className="mt-8 flex flex-col items-center px-4 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
              {filter === "open" ? <CircleDot className="size-5 text-muted-foreground" /> : <CheckCircle2 className="size-5 text-muted-foreground" />}
            </div>
            <p className="text-[12px] font-medium">{filter === "open" ? t("No open comments") : t("Nothing resolved yet")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {filter === "open"
                ? "Press C or use the comment tool, then click anywhere on the canvas to leave feedback."
                : "Resolved conversations will be archived here."}
            </p>
          </div>
        )}
        {visible.map((comment, index) => {
          const canDelete = comment.authorId === user?.id || file?.role === "owner";
          return (
            <button
              key={comment.id}
              type="button"
              onClick={() => focus(comment)}
              className={cn(
                "group mb-1.5 w-full rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-border hover:bg-secondary/40",
                activeCommentId === comment.id && "border-primary/40 bg-primary/5",
                comment.resolved && "opacity-70",
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[8px] font-semibold text-white" style={{ background: comment.color }}>
                    {initials(comment.author)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[12px] font-medium">{comment.author}</span>
                <span className="text-[10px] text-muted-foreground">{formatRelative(comment.createdAt)}</span>
                {scope === "all" && (
                  <span className="ml-auto max-w-[80px] truncate rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">
                    {pageName(comment.pageId)}
                  </span>
                )}
              </div>
              <div className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90">{comment.text}</div>
              <div className="mt-2 flex items-center gap-1">
                <span className="mr-auto flex size-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                  {index + 1}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    resolve(comment, !comment.resolved);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {comment.resolved ? <RotateCcw className="size-3" /> : <CheckCircle2 className="size-3" />}
                  {comment.resolved ? t("Reopen") : t("Resolve")}
                </span>
                {canDelete && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(comment);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="border-t border-panel-border p-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => setTool("comment")}>
          <MessageCircle className="size-3.5" /> {t("Click canvas to comment")}
        </Button>
      </div>
    </aside>
  );
}
