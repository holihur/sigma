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

const PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", models: ["deepseek-v4.1-flash", "deepseek-chat", "deepseek-reasoner"], hint: "DeepSeek API" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "o4-mini"], hint: "OpenAI API" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-2.5-flash", "gemini-2.5-pro"], hint: "Gemini OpenAI-compatible endpoint" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4", "google/gemini-2.5-flash"], hint: "OpenRouter API" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], hint: "Groq API" },
  { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", models: ["mistral-large-latest", "mistral-small-latest"], hint: "Mistral API" },
  { id: "xai", label: "xAI", baseUrl: "https://api.x.ai/v1", models: ["grok-3-mini", "grok-3"], hint: "xAI API" },
  { id: "together", label: "Together", baseUrl: "https://api.together.xyz/v1", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"], hint: "Together API" },
  { id: "ollama", label: "Ollama / local", baseUrl: "http://localhost:11434/v1", models: ["llama3.1", "qwen2.5-coder"], hint: "Local OpenAI-compatible endpoint" },
  { id: "custom", label: "Custom / self-hosted", baseUrl: "", models: [], hint: "Any OpenAI-compatible /chat/completions endpoint" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

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
  const [provider, setProvider] = useState<ProviderId>("deepseek");
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
        const known = PROVIDERS.find((p) => p.id === s.provider);
        setProvider((known?.id ?? "custom") as ProviderId);
        setBaseUrl(s.baseUrl || "https://api.deepseek.com");
        setModel(s.model || "deepseek-v4.1-flash");
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  const activeProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[PROVIDERS.length - 1];

  const chooseProvider = (id: string) => {
    const next = PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
    setProvider(next.id);
    if (next.baseUrl) setBaseUrl(next.baseUrl);
    const firstModel = next.models[0];
    if (firstModel) setModel(firstModel);
  };

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
          <DialogDescription>{t("Bring your own AI provider key. Any OpenAI-compatible endpoint works; the key is encrypted at rest and never leaves this server.")}</DialogDescription>
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
                <Select value={provider} onValueChange={chooseProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("Base URL")}</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={activeProvider.baseUrl || "https://your-provider.example/v1"} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("Model")}</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model-id" />
              <div className="flex flex-wrap gap-1.5">
                {activeProvider.models.map((m) => (
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
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {t(activeProvider.hint)} · {t("Base URL must point at an OpenAI-compatible /v1 endpoint.")}
              </p>
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
