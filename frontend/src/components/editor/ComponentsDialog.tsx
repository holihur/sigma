import React, { useState } from "react";
import { Box, Component as ComponentIcon, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function ComponentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const pageId = useEditor((s) => s.pageId);
  const createComponent = useEditor((s) => s.createComponent);
  const insertInstance = useEditor((s) => s.insertInstance);
  const syncInstances = useEditor((s) => s.syncInstances);
  const [query, setQuery] = useState("");

  const components = doc.pages.flatMap((page) =>
    Object.values(page.nodes)
      .filter((n) => n.component)
      .map((node) => ({ node, page })),
  );
  const instances = doc.pages.flatMap((page) => Object.values(page.nodes).filter((n) => n.componentId));
  const selected = selection.length === 1 ? doc.pages.flatMap((p) => Object.values(p.nodes)).find((n) => n.id === selection[0]) : null;
  const canCreate = !!selected && !selected.component && !selected.componentId;

  const create = () => {
    const id = createComponent();
    if (!id) {
      toast.error(t("Select a frame, group, or layer to turn into a component"));
      return;
    }
    toast.success(t("Component created"));
  };

  const filteredComponents = components.filter(({ node, page }) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${node.name} ${page.name}`.toLowerCase().includes(q);
  });

  const insert = (componentId: string) => {
    const id = insertInstance(componentId);
    if (!id) {
      toast.error(t("Could not insert this component"));
      return;
    }
    toast.success(t("Component instance inserted"));
    onOpenChange(false);
  };

  const sync = (componentId: string) => {
    const count = syncInstances(componentId);
    toast.success(t("Updated {count} instances", { count }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-white shadow">
              <ComponentIcon className="size-4" />
            </span>
            {t("Components")}
          </DialogTitle>
          <DialogDescription>{t("Reusable components and their instances, scoped to this file.")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-2.5">
          <Box className="size-4 shrink-0 text-sky-500" />
          <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {selected
              ? canCreate
                ? t("Turn “{name}” into a main component", { name: selected.name })
                : selected.component
                  ? t("“{name}” is a main component", { name: selected.name })
                  : t("This selection is an instance of a component")
              : t("Select one layer to create a component")}
          </div>
          <Button size="sm" className="h-8 shrink-0 gap-1.5" disabled={!canCreate} onClick={create}>
            <Plus className="size-3.5" /> {t("Create")}
          </Button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          {t("{components} components · {instances} instances", { components: components.length, instances: instances.length })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search components…")}
            className="h-8 pl-8 text-[12px]"
          />
        </div>

        <div className="max-h-[48dvh] overflow-y-auto pr-1">
          <div className="space-y-2 pr-1">
            {components.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
                {t("No components yet. Select a frame and create your first component.")}
              </div>
            )}
            {filteredComponents.map(({ node, page }) => {
              const count = instances.filter((n) => n.componentId === node.id).length;
              const current = page.id === pageId;
              return (
                <div key={node.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
                      <ComponentIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium">{node.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{page.name}</span>
                        <Badge variant="secondary" className="h-4 text-[9px]">{t("{count} instances", { count })}</Badge>
                        {!current && <Badge variant="outline" className="h-4 text-[9px]">{t("Other page")}</Badge>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => sync(node.id)}>
                      <RefreshCw className="size-3.5" /> {t("Update instances")}
                    </Button>
                    <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => insert(node.id)}>
                      <Plus className="size-3.5" /> {t("Insert")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("Instances track their main component. Property edits inside a component update instances automatically; use Update instances after adding or deleting layers.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
