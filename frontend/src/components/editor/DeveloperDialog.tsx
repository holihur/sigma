import React, { useEffect, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Terminal,
  Trash2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { systemApi, tokensApi } from "@/lib/api";
import type { CreatedPersonalAccessToken, PersonalAccessToken, UpdateStatus } from "@/lib/types";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const MCP_TOOLS = [
  "list_files", "get_file", "list_pages", "get_page", "create_file",
  "create_frame", "create_rect", "create_ellipse", "create_text",
  "update_node", "delete_nodes", "duplicate_node", "link_to_frame",
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 shrink-0 gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(t("Copied"));
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error(t("Copy failed"));
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label}
    </Button>
  );
}

export function DeveloperDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Claude / Cursor");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(true);
  const [days, setDays] = useState(90);
  const [created, setCreated] = useState<CreatedPersonalAccessToken | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  const endpoint = `${location.origin}/api/mcp`;

  const load = async () => {
    setLoading(true);
    try {
      const res = await tokensApi.list();
      setTokens(res.tokens);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCreated(null);
      load();
      systemApi.updateStatus().then(setUpdate).catch(() => {});
    }
  }, [open]);

  const create = async () => {
    const scopes: string[] = [];
    if (read) scopes.push("mcp:read");
    if (write) scopes.push("mcp:write");
    if (!name.trim()) {
      toast.error(t("Token name is required"));
      return;
    }
    if (!scopes.length) {
      toast.error(t("Choose at least one scope"));
      return;
    }
    setCreating(true);
    try {
      const res = await tokensApi.create({ name: name.trim(), scopes, expiresInDays: days });
      setCreated(res);
      setTokens((prev) => [res.pat, ...prev]);
      toast.success(t("Token created"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await tokensApi.remove(id);
      setTokens((prev) => prev.filter((x) => x.id !== id));
      if (created?.pat.id === id) setCreated(null);
      toast.success(t("Token revoked"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    try {
      setUpdate(await systemApi.checkUpdate());
    } catch (e) {
      toast.error((e as Error).message);
      systemApi.updateStatus().then(setUpdate).catch(() => {});
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async () => {
    setApplying(true);
    try {
      const res = await systemApi.applyUpdate();
      toast.success(t("Update {version} installed. Sigma is restarting…", { version: res.version }));
      setTimeout(() => window.location.reload(), 3000);
    } catch (e) {
      toast.error((e as Error).message);
      setApplying(false);
    }
  };

  const snippet = JSON.stringify(
    {
      mcpServers: {
        sigma: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${created?.token ?? "<YOUR_SIGMA_PAT>"}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-white shadow">
              <Terminal className="size-4" />
            </span>
            {t("Developer & MCP")}
          </DialogTitle>
          <DialogDescription>{t("Connect Claude, Cursor, or any MCP client to Sigma with a scoped personal access token.")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70dvh] space-y-5 overflow-y-auto pr-1">
          <section className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold">
              <Bot className="size-4 text-sky-500" /> {t("MCP endpoint")}
            </div>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-2 text-[11px]">{endpoint}</code>
              <CopyButton value={endpoint} label={t("Copy")} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {t("PATs only authenticate the MCP transport; regular app sessions still use your login token.")}
            </p>
          </section>

          {created && (
            <section className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-sky-700 dark:text-sky-300">
                <ShieldCheck className="size-4" /> {t("New token")} · {created.pat.name}
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">{t("Copy it now. The full token is never shown again.")}</p>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-background px-2.5 py-2 text-[11px]">{created.token}</code>
                <CopyButton value={created.token} label={t("Copy token")} />
              </div>
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium">{t("MCP config")}</span>
                  <CopyButton value={snippet} label={t("Copy config")} />
                </div>
                <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background p-2.5 text-[10px] leading-relaxed">{snippet}</pre>
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold">
                <KeyRound className="size-4" /> {t("Personal access tokens")}
              </div>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={load} disabled={loading}>
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> {t("Refresh")}
              </Button>
            </div>
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label className="text-[11px]">{t("Token name")}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-[12px]" placeholder="Claude / Cursor" />
                </div>
                <div>
                  <Label className="text-[11px]">{t("Expires in days")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value) || 90)}
                    className="mt-1 h-8 w-full text-[12px] sm:w-28"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-[11px]">
                  <Switch checked={read} onCheckedChange={setRead} /> {t("Read designs")} <Badge variant="outline" className="h-4 text-[9px]">mcp:read</Badge>
                </label>
                <label className="flex items-center gap-2 text-[11px]">
                  <Switch checked={write} onCheckedChange={setWrite} /> {t("Edit designs")} <Badge variant="outline" className="h-4 text-[9px]">mcp:write</Badge>
                </label>
                <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={create} disabled={creating}>
                  {creating ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                  {t("Create token")}
                </Button>
              </div>
            </div>

            <div className="mt-2 divide-y divide-border rounded-xl border border-border">
              {tokens.length === 0 && !loading && (
                <div className="px-3 py-5 text-center text-[11px] text-muted-foreground">{t("No tokens yet")}</div>
              )}
              {tokens.map((tok) => (
                <div key={tok.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium">
                      {tok.name}
                      <code className="rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">{tok.prefix}</code>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {tok.scopes.map((s) => <Badge key={s} variant="secondary" className="h-4 text-[9px]">{s}</Badge>)}
                      <span>{t("Last used")}: {tok.lastUsedAt || t("Never")}</span>
                      <span>· {t("Expires")}: {tok.expiresAt ? new Date(tok.expiresAt).toLocaleDateString() : t("Never")}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px] text-destructive" onClick={() => revoke(tok.id)}>
                    <Trash2 className="size-3.5" /> {t("Revoke")}
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[12px] font-semibold">
                <Rocket className="size-4 text-sky-500" /> {t("System update")}
              </div>
              <Badge variant="outline" className="h-5 text-[9px]">v{update?.currentVersion ?? "…"}</Badge>
              {update?.autoUpdate && <Badge variant="secondary" className="h-5 text-[9px]">{t("Auto · every {interval}", { interval: update.interval })}</Badge>}
              <div className="ml-auto flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={checkUpdate} disabled={checking}>
                  <RefreshCw className={cn("size-3.5", checking && "animate-spin")} /> {t("Check now")}
                </Button>
                {update?.updateAvailable && (
                  <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={applyUpdate} disabled={applying}>
                    {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    {t("Update now")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span>{t("Latest")}: {update?.latestVersion ? `v${update.latestVersion}` : t("Unknown")}</span>
              <span>· {t("Last checked")}: {update?.lastChecked ? new Date(update.lastChecked).toLocaleTimeString() : t("Never")}</span>
              {update?.restartPending && <span className="text-amber-500">· {t("Restart pending")}</span>}
              {update?.updateAvailable && <span className="font-medium text-sky-500">· {t("Update available")}</span>}
            </div>
            {update?.lastError && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {update.lastError}
              </p>
            )}
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {t("Release binaries verify SHA-256 checksums before replacing the running server.")}
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold">
              <Terminal className="size-4" /> {t("MCP tools")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MCP_TOOLS.map((tool) => (
                <code key={tool} className="rounded-md border border-border bg-secondary/50 px-1.5 py-1 text-[10px]">{tool}</code>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
