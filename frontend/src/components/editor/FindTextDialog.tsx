import React, { useEffect, useMemo, useState } from "react";
import { Replace, Search, TextCursorInput } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { nodeAABB } from "@/lib/nodes";
import { cn } from "@/lib/utils";

export function FindTextDialog({
  open,
  onOpenChange,
  hostRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const ensureAllPages = useEditor((s) => s.ensureAllPages);
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<"page" | "file">("file");

  useEffect(() => {
    if (open) {
      setActive(0);
      void ensureAllPages();
      setTimeout(() => document.getElementById("sigma-find-input")?.focus(), 40);
    }
  }, [open, ensureAllPages]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const current = useEditor.getState().pageId;
    const pages = scope === "file" ? doc.pages : doc.pages.filter((p) => p.id === current);
    return pages.flatMap((page) =>
      Object.values(page.nodes)
        .filter((node) => node.type === "text" && node.text.toLowerCase().includes(q))
        .map((node) => ({ page, node })),
    );
  }, [doc, query, scope]);

  useEffect(() => setActive(0), [query, scope]);

  const reveal = (index: number) => {
    const hit = results[index];
    if (!hit) return;
    const st = useEditor.getState();
    if (st.pageId !== hit.page.id) st.setPage(hit.page.id);
    st.select([hit.node.id]);
    const host = hostRef.current;
    if (host) {
      const b = nodeAABB(hit.page, hit.node);
      const zoom = st.viewport.zoom;
      st.setViewport({
        zoom,
        x: host.clientWidth / 2 - (b.x + b.width / 2) * zoom,
        y: host.clientHeight / 2 - (b.y + b.height / 2) * zoom,
      });
    }
  };

  const replaceOne = () => {
    const hit = results[active];
    if (!hit || !query) return;
    const st = useEditor.getState();
    if (st.pageId !== hit.page.id) st.setPage(hit.page.id);
    st.updateNode(hit.node.id, { text: hit.node.text.replace(new RegExp(escapeRegExp(query), "i"), replace) }, true);
  };

  const replaceAll = () => {
    if (!query) return;
    const st = useEditor.getState();
    let count = 0;
    for (const page of doc.pages) {
      if (scope === "page" && page.id !== st.pageId) continue;
      st.setPage(page.id);
      for (const node of Object.values(page.nodes)) {
        if (node.type !== "text" || !node.text.toLowerCase().includes(query.toLowerCase())) continue;
        st.updateNode(node.id, { text: node.text.replace(new RegExp(escapeRegExp(query), "gi"), replace) }, true);
        count++;
      }
    }
    if (count > 0) toast.success(t("Replaced text in {count} layers", { count }));
    else toast.error(t("No matching text"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TextCursorInput className="size-4 text-primary" /> {t("Find text")}
          </DialogTitle>
          <DialogDescription>{t("Search and replace text across the current page or the whole file.")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sigma-find-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (results.length > 0) reveal(e.shiftKey ? Math.max(0, active - 1) : Math.min(results.length - 1, active + 1));
              }
              e.stopPropagation();
            }}
            placeholder={t("Find text…")}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={t("Replace with…")} className="flex-1" />
          <Button variant="outline" size="sm" onClick={replaceOne} disabled={!results.length}>{t("Replace")}</Button>
          <Button size="sm" onClick={replaceAll} disabled={!results.length}>{t("Replace all")}</Button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <button className={cn("rounded px-2 py-1 hover:bg-secondary", scope === "file" && "bg-secondary text-foreground")} onClick={() => setScope("file")}>{t("Whole file")}</button>
          <button className={cn("rounded px-2 py-1 hover:bg-secondary", scope === "page" && "bg-secondary text-foreground")} onClick={() => setScope("page")}>{t("Current page")}</button>
          <span className="ml-auto">{t("{count} results", { count: results.length })}</span>
        </div>
        <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-border">
          {!query ? (
            <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">{t("Type to search text layers.")}</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">{t("No matching text")}</div>
          ) : (
            results.map((hit, index) => (
              <button
                key={`${hit.page.id}-${hit.node.id}`}
                onClick={() => { setActive(index); reveal(index); }}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-secondary/50",
                  index === active && "bg-primary/8",
                )}
              >
                <Replace className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px]">{highlight(hit.node.text, query)}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{hit.page.name} · {hit.node.name}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}
