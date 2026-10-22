import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, FileCode2, Loader2, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { aiApi } from "@/lib/api";
import type { AISkill } from "@/lib/types";
import { useT } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AgentContextDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const [tab, setTab] = useState<"design" | "agents" | "skills">("design");
  const [design, setDesign] = useState("");
  const [agents, setAgents] = useState("");
  const [skills, setSkills] = useState<AISkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const designFileRef = useRef<HTMLInputElement>(null);
  const agentsFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([aiApi.context(), aiApi.skills()])
      .then(([ctx, list]) => {
        setDesign(ctx.designMd ?? "");
        setAgents(ctx.agentsMd ?? "");
        setSkills(list.skills ?? []);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await aiApi.saveContext({ designMd: design, agentsMd: agents });
      toast.success(t("Agent context saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 512 * 1024) {
      toast.error(t("SKILL.md must be under 512 KB"));
      return;
    }
    setUploading(true);
    try {
      const content = await file.text();
      const res = await aiApi.uploadSkill({ filename: file.name, content });
      setSkills((prev) => [...prev.filter((s) => s.name !== res.skill.name), res.skill].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(t("Skill “{name}” uploaded", { name: res.skill.name }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    try {
      await aiApi.deleteSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
      toast.success(t("Skill deleted"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-white shadow">
              <Bot className="size-4" />
            </span>
            {t("Agent context & skills")}
          </DialogTitle>
          <DialogDescription>{t("Give Sigma AI project-specific design rules, agent instructions and reusable skills.")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="design" className="flex-1 gap-1.5"><BookOpen className="size-3.5" /> Design.md</TabsTrigger>
            <TabsTrigger value="agents" className="flex-1 gap-1.5"><FileCode2 className="size-3.5" /> AGENTS.md</TabsTrigger>
            <TabsTrigger value="skills" className="flex-1 gap-1.5"><Sparkles className="size-3.5" /> {t("Skills")} <Badge variant="secondary" className="h-4 text-[9px]">{skills.length}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex h-52 items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : tab === "skills" ? (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary/50 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="size-6 animate-spin text-primary" /> : <UploadCloud className="size-6 text-primary" />}
              <span className="text-[12px] font-medium">{t("Upload SKILL.md")}</span>
              <span className="text-[10px] text-muted-foreground">{t("Agent Skills format with YAML frontmatter: name, description, then markdown instructions.")}</span>
            </button>
            <div className="max-h-[38dvh] space-y-2 overflow-y-auto pr-1">
              {skills.length === 0 && (
                <div className="rounded-xl border border-border px-4 py-8 text-center text-[11px] text-muted-foreground">{t("No custom skills yet.")}</div>
              )}
              {skills.map((skill) => (
                <div key={skill.id} className="flex items-start gap-2 rounded-xl border border-border p-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-500"><Sparkles className="size-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium"><code>{skill.name}</code></div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{skill.description}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] text-destructive" onClick={() => remove(skill.id)}>
                    <Trash2 className="size-3.5" /> {t("Delete")}
                  </Button>
                </div>
              ))}
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 text-[10px] leading-relaxed">{`---
name: mobile-checkout
description: Use when designing or reviewing mobile checkout flows.
---
# Instructions
1. Keep the primary action above the fold.
2. Use the project's spacing and color tokens.`}</pre>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={cn("flex items-center gap-2 text-[11px] text-muted-foreground")}>
              {tab === "design" ? <BookOpen className="size-3.5" /> : <FileCode2 className="size-3.5" />}
              <span className="min-w-0 flex-1">
                {tab === "design"
                  ? t("Design.md is loaded into every AI request as the project's design system.")
                  : t("AGENTS.md tells the agent how to work in this workspace: conventions, constraints and review rules.")}
              </span>
              <input
                ref={tab === "design" ? designFileRef : agentsFileRef}
                type="file"
                accept=".md,text/markdown"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const text = await f.text();
                  if (tab === "design") setDesign(text); else setAgents(text);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 text-[10px]" onClick={() => (tab === "design" ? designFileRef : agentsFileRef).current?.click()}>
                <UploadCloud className="size-3" /> {t("Upload .md")}
              </Button>
            </div>
            <textarea
              value={tab === "design" ? design : agents}
              onChange={(e) => (tab === "design" ? setDesign(e.target.value) : setAgents(e.target.value))}
              placeholder={
                tab === "design"
                  ? t("# Design system\n- Brand color: #0ea5e9\n- Radius: 12px\n- Font: Inter\n- Spacing: 4 / 8 / 12 / 16 / 24")
                  : t("# Agent instructions\n- Always create a frame before adding layers.\n- Use sentence case.\n- Keep contrast accessible.")
              }
              className="h-[42dvh] w-full resize-none rounded-xl border border-border bg-background p-3 font-mono text-[11px] leading-relaxed outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
                {t("Save context")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
