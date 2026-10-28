import React, { useMemo, useState } from "react";
import { CheckCircle2, CircleDot, MessageCircle, Plus, Reply, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { commentsApi } from "@/lib/api";
import type { Comment } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { cn, formatRelative, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const appendComment = useEditor((s) => s.appendComment);
  const removeComment = useEditor((s) => s.removeComment);
  const setTool = useEditor((s) => s.setTool);
  const user = useAuth((s) => s.user);
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [scope, setScope] = useState<"page" | "all">("page");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  const roots = useMemo(() => {
    return comments
      .filter((c) => !c.parentId)
      .filter((c) => (scope === "page" ? c.pageId === pageId : true))
      .filter((c) => (filter === "open" ? !c.resolved : c.resolved))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [comments, scope, pageId, filter]);

  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const openCount = comments.filter((c) => !c.parentId && !c.resolved).length;
  const pageName = (id: string) => doc.pages.find((p) => p.id === id)?.name ?? "Page";
  const canDelete = (comment: Comment) => comment.authorId === user?.id || file?.role === "owner";

  const focus = async (comment: Comment) => {
    try {
      if (comment.pageId !== pageId) await setPage(comment.pageId);
    } catch {
      return;
    }
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
      for (const reply of repliesOf(comment.id)) removeComment(reply.id);
      if (replyTo === comment.id) setReplyTo(null);
      toast.success(t("Comment deleted"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submitReply = async (comment: Comment) => {
    const text = replyDraft.trim();
    if (!file || !text) return;
    try {
      const data = await commentsApi.create(file.id, {
        pageId: comment.pageId,
        nodeId: comment.nodeId,
        parentId: comment.id,
        x: comment.x,
        y: comment.y,
        text,
      });
      appendComment(data.comment);
      setReplyDraft("");
      setReplyTo(null);
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
            <TabsTrigger value="open" className="flex-1">{t("Open")}</TabsTrigger>
            <TabsTrigger value="resolved" className="flex-1">{t("Resolved")}</TabsTrigger>
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
        {roots.length === 0 && (
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

        {roots.map((comment, index) => {
          const replies = repliesOf(comment.id);
          return (
            <div
              key={comment.id}
              className={cn(
                "mb-2 rounded-lg border border-transparent px-1 py-1 transition-colors hover:border-border hover:bg-secondary/30",
                activeCommentId === comment.id && "border-primary/40 bg-primary/5",
                comment.resolved && "opacity-70",
              )}
            >
              <button
                type="button"
                onClick={() => focus(comment)}
                className="w-full rounded-md px-1.5 py-1.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    {comment.avatar && <AvatarImage src={comment.avatar} alt={comment.author} />}
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
              </button>

              {replies.length > 0 && (
                <div className="ml-7 mt-1 space-y-1 border-l border-border pl-2.5">
                  {replies.map((reply) => (
                    <div key={reply.id} className="group/reply rounded-md px-1 py-1 hover:bg-secondary/40">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="size-4">
                          {reply.avatar && <AvatarImage src={reply.avatar} alt={reply.author} />}
                          <AvatarFallback className="text-[6px] font-semibold text-white" style={{ background: reply.color }}>
                            {initials(reply.author)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] font-medium">{reply.author}</span>
                        <span className="text-[9px] text-muted-foreground">{formatRelative(reply.createdAt)}</span>
                        {canDelete(reply) && (
                          <button
                            className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover/reply:opacity-100"
                            title={t("Delete")}
                            onClick={() => void remove(reply)}
                          >
                            <Trash2 className="size-2.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">{reply.text}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-1.5 flex items-center gap-1 pl-1.5">
                <span className="mr-auto flex size-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                  {index + 1}
                </span>
                {replies.length > 0 && (
                  <span className="mr-1 text-[9px] text-muted-foreground">{t("{count} replies", { count: replies.length })}</span>
                )}
                {!comment.resolved && (
                  <button
                    onClick={() => { setReplyTo(replyTo === comment.id ? null : comment.id); setReplyDraft(""); }}
                    className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground", replyTo === comment.id && "bg-secondary text-foreground")}
                  >
                    <Reply className="size-3" /> {t("Reply")}
                  </button>
                )}
                <button
                  onClick={() => resolve(comment, !comment.resolved)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {comment.resolved ? <RotateCcw className="size-3" /> : <CheckCircle2 className="size-3" />}
                  {comment.resolved ? t("Reopen") : t("Resolve")}
                </button>
                {canDelete(comment) && (
                  <button
                    onClick={() => void remove(comment)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>

              {replyTo === comment.id && (
                <div className="ml-7 mt-1.5 rounded-lg border border-border bg-background/60 p-2">
                  <textarea
                    autoFocus
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitReply(comment);
                      if (e.key === "Escape") setReplyTo(null);
                      e.stopPropagation();
                    }}
                    placeholder={t("Reply to {name}…", { name: comment.author })}
                    className="min-h-14 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-[11px] outline-none focus:border-ring"
                  />
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <button className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-secondary" onClick={() => setReplyTo(null)}>
                      {t("Cancel")}
                    </button>
                    <button
                      className="rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-40"
                      disabled={!replyDraft.trim()}
                      onClick={() => void submitReply(comment)}
                    >
                      {t("Reply")}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
