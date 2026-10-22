import React, { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { aiApi } from "@/lib/api";
import type { AISettings } from "@/lib/types";
import { useT } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODELS = ["deepseek-v4.1-flash", "deepseek-chat", "deepseek-reasoner"];

export function AISettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (settings: AISettings) => void;
}) {
  const t = useT();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [provider, setProvider] = useState("deepseek");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4.1-flash");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTestResult(null);
    aiApi
      .settings()
      .then((s) => {
        setSettings(s);
        setProvider(s.provider || "deepseek");
        setBaseUrl(s.baseUrl || "https://api.deepseek.com");
        setModel(s.model || "deepseek-v4.1-flash");
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const save = async (clearKey = false) => {
    setSaving(true);
    try {
      const next = await aiApi.save({ provider, baseUrl, model, apiKey: apiKey || undefined, clearKey });
      setSettings(next);
      setApiKey("");
      onSaved?.(next);
      toast.success(t("AI settings saved"));
      return next;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const saved = await save();
      if (!saved) return;
      const res = await aiApi.test();
      setTestResult(t("Connected · {model} · {ms}ms", { model: res.model, ms: res.latencyMs }));
      toast.success(t("Connection OK"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> {t("AI settings")}
          </DialogTitle>
          <DialogDescription>{t("Bring your own DeepSeek key. It is encrypted at rest and never leaves this server.")}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("Loading…")}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2">
              <div className="flex items-center gap-2 text-[12px]">
                <KeyRound className="size-3.5 text-primary" />
                {settings?.configured ? (
                  <span>
                    {t("Key configured")} <Badge variant="success">{settings.keyHint}</Badge>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("No API key configured")}</span>
                )}
              </div>
              {settings?.configured && (
                <button
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => save(true)}
                >
                  <Trash2 className="size-3" /> {t("Clear key")}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("Provider")}</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="openai-compatible">{t("OpenAI-compatible")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("Base URL")}</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("Model")}</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-v4.1-flash" />
              <div className="flex flex-wrap gap-1.5">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={
                      "rounded-full border px-2 py-0.5 text-[10px] transition-colors " +
                      (model === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary")
                    }
                  >
                    {m}
                    {m === "deepseek-v4.1-flash" && <span className="ml-1 opacity-70">{t("latest")}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("API key")}</Label>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.configured ? t("Leave blank to keep the current key") : "sk-…"}
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {t("The key is encrypted with AES-GCM and only used to call the model you configure.")}
              </p>
            </div>

            {testResult && (
              <div className="flex items-center gap-2 rounded-md bg-[color-mix(in_oklch,var(--success)_12%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--success)]">
                <CheckCircle2 className="size-3.5" /> {testResult}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Close")}
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || saving || loading}>
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            {t("Save & test")}
          </Button>
          <Button onClick={() => save()} disabled={saving || loading}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
