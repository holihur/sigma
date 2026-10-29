import React, { useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { versionsApi } from "@/lib/api";
import type { VersionMeta } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { formatRelative } from "@/lib/utils";
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

export function VersionHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const file = useEditor((s) => s.file);
  const readOnly = useEditor((s) => s.isReadOnly);
  const dirty = useEditor((s) => s.dirty);
  const applyRestoredDoc = useEditor((s) => s.applyRestoredDoc);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  const load = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const data = await versionsApi.list(file.id);
      setVersions(data.versions);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.id]);

  if (!file) return null;

  const save = async () => {
    try {
      const data = await versionsApi.create(file.id, name.trim() || `Version ${new Date().toLocaleTimeString()}`);
      setVersions(data.versions);
      setName("");
      toast.success(t("Version saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const restore = async (version: VersionMeta) => {
    if (pendingRestore !== version.id) {
      setPendingRestore(version.id);
      return;
    }
    setRestoring(version.id);
    try {
      if (dirty) {
        await versionsApi.create(file.id, `Autosave before restoring ${version.name}`);
      }
      const data = await versionsApi.restore(file.id, version.id);
      applyRestoredDoc(data.doc, data.version);
      toast.success(`Restored “${version.name}”`);
      setPendingRestore(null);
      await load();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" /> {t("Version history")}
          </DialogTitle>
          <DialogDescription>{t("Save checkpoints as you design, then restore any version later.")}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              e.stopPropagation();
            }}
            placeholder={readOnly ? t("Read-only access") : t("Name this version (optional)")}
            disabled={readOnly}
          />
          <Button onClick={save} disabled={readOnly}>
            <Save className="size-3.5" /> {t("Save version")}
          </Button>
        </div>

        <div className="max-h-[380px] overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
              {t("No saved versions yet.")}
              <br />
              {t("Save one above before making big changes.")}
            </div>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <History className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{v.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {v.author} · {formatRelative(v.createdAt)}
                  </div>
                </div>
                <Badge variant="outline">v{v.version}</Badge>
                {pendingRestore === v.id ? (
                  <>
                    <Button variant="ghost" size="sm" disabled={!!restoring} onClick={() => setPendingRestore(null)}>
                      {t("Cancel")}
                    </Button>
                    <Button variant="outline" size="sm" disabled={!!restoring || readOnly} onClick={() => restore(v)}>
                      {restoring === v.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                      {t("Confirm restore")}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" disabled={!!restoring || readOnly} onClick={() => restore(v)}>
                    <RotateCcw className="size-3.5" />
                    {t("Restore")}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
