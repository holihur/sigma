import React, { useRef, useState } from "react";
import { FileJson, Figma, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { figmaApi } from "@/lib/api";
import type { FileMeta } from "@/lib/types";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function FigmaImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: (file: FileMeta) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"url" | "json">("url");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setUrl("");
    setToken("");
    setName("");
    setJson("");
    setFileName("");
    setBusy(false);
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let res;
      if (tab === "url") {
        if (!url.trim()) throw new Error(t("Enter a Figma file URL"));
        if (!token.trim()) throw new Error(t("Enter a Figma personal access token"));
        res = await figmaApi.import({ url: url.trim(), token: token.trim(), name: name.trim() });
      } else {
        if (!json.trim()) throw new Error(t("Choose or paste a Sigma JSON file"));
        res = await figmaApi.importJSON(json, name.trim() || fileName.replace(/\.(sigma\.)?json$/i, "") || t("Imported design"));
      }
      toast.success(t("Imported {count} layers across {pages} pages", { count: res.nodes, pages: res.pages }));
      if (res.warnings?.length) {
        toast.warning(t("Some Figma features were simplified: {list}", { list: res.warnings.join("; ") }), { duration: 10000 });
      }
      onImported(res.file);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (file?: File) => {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) {
      toast.error(t("JSON file is too large"));
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setJson(String(reader.result ?? ""));
    reader.onerror = () => toast.error(t("Could not read that file"));
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-white shadow">
              <Figma className="size-4" />
            </span>
            {t("Import from Figma")}
          </DialogTitle>
          <DialogDescription>{t("Bring a Figma file in through the REST API, or import a Sigma JSON export.")}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "url" | "json")}>
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1 gap-1.5"><Figma className="size-3.5" /> {t("Figma URL")}</TabsTrigger>
            <TabsTrigger value="json" className="flex-1 gap-1.5"><FileJson className="size-3.5" /> {t("JSON / plugin")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "url" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="figma-url">{t("Figma file URL")}</Label>
              <Input
                id="figma-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.figma.com/file/…"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="figma-token">{t("Personal access token")}</Label>
              <Input
                id="figma-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("Figma → Settings → Security → Personal access tokens")}
                className="h-9"
                autoComplete="off"
              />
            </div>
            <p className="rounded-md bg-secondary/60 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
              {t("The token is used once for this import and is never stored by Sigma.")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-7 text-center transition-colors hover:border-primary/50 hover:bg-secondary/50"
            >
              <UploadCloud className="size-6 text-primary" />
              <span className="text-[12px] font-medium">{fileName || t("Choose a .sigma.json file")}</span>
              <span className="text-[10px] text-muted-foreground">{t("Exported from Sigma or produced by the Figma plugin")}</span>
            </button>
            <textarea
              value={json}
              onChange={(e) => { setJson(e.target.value); setFileName(""); }}
              placeholder={t("…or paste JSON here")}
              className="h-28 w-full resize-none rounded-lg border border-border bg-background p-2.5 font-mono text-[10px] outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="figma-name">{t("Design name (optional)")}</Label>
          <Input id="figma-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Use the file name")} className="h-9" />
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="ml-auto" onClick={() => onOpenChange(false)} disabled={busy}>{t("Cancel")}</Button>
          <Button onClick={run} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {t("Import design")}
          </Button>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("Binary .fig files are not supported. Use the Figma REST API or the bundled Sigma plugin.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
