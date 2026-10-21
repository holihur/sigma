import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { publicApi } from "@/lib/api";
import type { SigmaDoc } from "@/lib/types";
import { getPage } from "@/lib/nodes";
import { useEditor } from "@/store/editor";
import { PreviewMode } from "@/components/editor/PreviewMode";

export default function PublicPrototypePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    publicApi
      .get(token)
      .then(({ file, doc }) => {
        if (cancelled) return;
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
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message || "This prototype link is unavailable");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      useEditor.getState().reset();
      document.title = "Sigma — Prototype design, together";
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0c] text-white">
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#9d7bff] to-[#6d4aff] shadow-lg">
          <Sparkles className="size-5" />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-white/50">
          <Loader2 className="size-4 animate-spin" /> Opening prototype…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
          <TriangleAlert className="size-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold">Prototype unavailable</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <div className="mt-2 flex gap-2">
          <Link to="/login" className="rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground">
            Open Sigma
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
        <Sparkles className="size-3" /> Made with Sigma
      </Link>
    </>
  );
}
