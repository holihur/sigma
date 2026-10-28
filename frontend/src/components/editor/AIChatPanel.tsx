import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Settings2, Sparkles, Wand2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { aiApi } from "@/lib/api";
import type { AIAction, AISettings } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ChatItem = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  actions?: AIAction[];
};

const SUGGESTIONS = [
  "Generate a clean login screen with email, password and a primary button",
  "Create a mobile onboarding flow with three steps and prototype links",
  "Restyle the selected layer with sky-blue accents and rounded corners",
  "Add a pricing section with three cards to this page",
];

export function AIChatPanel({
  open,
  onClose,
  onOpenSettings,
  pageId,
  configVersion,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  pageId: string;
  configVersion: number;
}) {
  const t = useT();
  const file = useEditor((s) => s.file);
  const selection = useEditor((s) => s.selection);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSessionId(null);
    setMessages([]);
  }, [file?.id]);

  useEffect(() => {
    if (!open) return;
    aiApi.settings().then(setSettings).catch(() => undefined);
  }, [open, configVersion]);

  useEffect(() => {
    if (open) setTimeout(() => textRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  if (!open) return null;

  const configured = settings?.configured ?? false;

  const send = async (text: string) => {
    if (!file || !text.trim() || busy) return;
    const message = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", content: message }]);
    setBusy(true);
    try {
      const res = await aiApi.chat({
        fileId: file.id,
        pageId,
        message,
        sessionId: sessionId ?? undefined,
        selection,
      });
      setSessionId(res.sessionId);
      // Let the user undo the whole AI turn locally; undo/redo replays through
      // the same tombstone-aware sync used by manual edits.
      useEditor.getState().pushHistory();
      useEditor.getState().applyRemoteDoc(res.doc, res.version);
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: "assistant", content: res.reply, actions: res.actions },
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setMessages((prev) => [...prev, { id: `e_${Date.now()}`, role: "error", content: msg }]);
      if (/api key|key first/i.test(msg)) setSettings((prev) => (prev ? { ...prev, configured: false } : prev));
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[95] flex w-full flex-col border-l border-panel-border bg-panel shadow-2xl sm:w-[400px]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-panel-border px-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white">
          <Sparkles className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-medium">
            Sigma AI
            <Badge variant="outline" className="text-[9px]">
              {settings?.model || "deepseek-chat"}
            </Badge>
          </div>
        </div>
        <button
          title={t("AI settings")}
          onClick={onOpenSettings}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Settings2 className="size-4" />
        </button>
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col">
            <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10">
              <Wand2 className="size-6 text-primary" />
            </div>
            <h2 className="mt-4 text-center text-[16px] font-semibold">{t("Design with Sigma AI")}</h2>
            <p className="mx-auto mt-1.5 max-w-[280px] text-center text-[11px] leading-relaxed text-muted-foreground">
              {t("Describe a screen or a change in natural language. Sigma edits the canvas through real design tools.")}
            </p>
            {!configured && (
              <button
                onClick={onOpenSettings}
                className="mx-auto mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary hover:bg-primary/10"
              >
                {t("Configure your AI provider key")}
              </button>
            )}
            <div className="mt-6 space-y-1.5">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("Try")}
              </div>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={!configured || busy}
                  onClick={() => void send(s)}
                  className="flex w-full items-start gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-[11px] leading-relaxed text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
                >
                  <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
                  {t(s)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
                {m.role !== "user" && (
                  <div
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                      m.role === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary",
                    )}
                  >
                    <Sparkles className="size-3" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.role === "error"
                        ? "border border-destructive/30 bg-destructive/10 text-destructive"
                        : "border border-border bg-secondary/40",
                  )}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.actions.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                          title={a.summary}
                        >
                          <Wrench className="size-2.5" /> {a.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" /> {t("Thinking and editing…")}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-panel-border p-2.5">
        <div className="rounded-xl border border-input bg-background/60 p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/90">
          <textarea
            ref={textRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
              e.stopPropagation();
            }}
            placeholder={configured ? t("Ask Sigma to design…") : t("Configure a key to start…")}
            disabled={!configured || busy}
            rows={2}
            className="w-full resize-none bg-transparent px-1.5 py-1 text-[12px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] text-muted-foreground">{t("Enter to send · Shift+Enter for a new line")}</span>
            <Button
              size="iconSm"
              className="size-7"
              disabled={!configured || busy || !input.trim()}
              onClick={() => void send(input)}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[9px] text-muted-foreground">
          {t("AI edits are applied to the shared canvas and can be undone.")}
        </p>
      </div>
    </div>
  );
}
