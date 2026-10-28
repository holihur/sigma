import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, LockKeyhole, Sparkles, TriangleAlert } from "lucide-react";
import { ApiError, publicApi } from "@/lib/api";
import type { SigmaDoc } from "@/lib/types";
import { getPage } from "@/lib/nodes";
import { useT } from "@/i18n";
import { useEditor } from "@/store/editor";
import { PreviewMode } from "@/components/editor/PreviewMode";

export default function PublicPrototypePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");

  const load = (pass = "") => {
    setLoading(true);
    setError(null);
    publicApi
      .get(token, pass)
      .then(({ file, doc }) => {
        const normalized = doc as SigmaDoc;
        useEditor.getState().load(file, normalized, file.version);
        const firstPage = normalized.pages[0];
        const page = getPage(normalized, firstPage.id);
        const frameId =
          page.rootIds.find((id) => page.nodes[id]?.type === "frame") ??
          Object.values(page.nodes).find((n) => n.type === "frame")?.id ??
          null;
        useEditor.getState().openPreview(frameId);
        document.title = `${file.name} — Sigma prototype`;
        setNeedsPassword(false);
        setLoading(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          setNeedsPassword(true);
          setError(pass ? e.message : null);
        } else {
          setError((e as Error).message || "This prototype link is unavailable");
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return () => {
      useEditor.getState().reset();
      document.title = "Sigma — Prototype design, together";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0c] text-white">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-lg">
          <Sparkles className="size-5" />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-white/50">
          <Loader2 className="size-4 animate-spin" /> {t("Opening prototype…")}
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <LockKeyhole className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">{t("Password required")}</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("This prototype is protected by its owner.")}</p>
        </div>
        <form
          className="flex w-full max-w-xs gap-2"
          onSubmit={(e) => { e.preventDefault(); if (password) load(password); }}
        >
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("Password")}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
          <button type="submit" disabled={loading || !password} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {loading ? <Loader2 className="size-4 animate-spin" /> : t("Open")}
          </button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <TriangleAlert className="size-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold">{t("Prototype unavailable")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <div className="mt-2 flex gap-2">
          <Link to="/login" className="rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground">
            {t("Open Sigma")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <PreviewMode onClose={() => navigate("/login")} publicMode />
      <Link
        to="/login"
        className="fixed bottom-3 right-3 z-[210] flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[10px] font-medium text-white/70 backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
      >
        <Sparkles className="size-3" /> {t("Made with Sigma")}
      </Link>
    </>
  );
}
