import React, { useState } from "react";
import { Palette, Plus, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { getPage } from "@/lib/nodes";

export function StylesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const selection = useEditor((s) => s.selection);
  const addColorStyle = useEditor((s) => s.addColorStyle);
  const removeColorStyle = useEditor((s) => s.removeColorStyle);
  const applyColorStyle = useEditor((s) => s.applyColorStyle);
  const addTextStyle = useEditor((s) => s.addTextStyle);
  const removeTextStyle = useEditor((s) => s.removeTextStyle);
  const applyTextStyle = useEditor((s) => s.applyTextStyle);
  const [colorName, setColorName] = useState("");
  const [textName, setTextName] = useState("");
  const page = getPage(doc, pageId);
  const selected = selection.length === 1 ? page.nodes[selection[0]] : null;
  const textNode = selected?.type === "text" ? selected : null;
  const color = selected?.fill?.type === "solid" ? selected.fill.color : "#0ea5e9";
  const styles = doc.styles ?? { colors: [], texts: [] };

  const addColor = () => {
    addColorStyle(colorName || color, color);
    setColorName("");
    toast.success(t("Color style added"));
  };

  const addText = () => {
    if (!textNode) {
      toast.error(t("Select a text layer to capture its typography"));
      return;
    }
    addTextStyle(textName || textNode.name, {
      fontSize: textNode.fontSize,
      fontFamily: textNode.fontFamily,
      fontWeight: textNode.fontWeight,
      lineHeight: textNode.lineHeight,
      letterSpacing: textNode.letterSpacing,
    });
    setTextName("");
    toast.success(t("Text style added"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="size-4 text-primary" /> {t("Local styles")}
          </DialogTitle>
          <DialogDescription>{t("Reusable colors and typography, stored with this file.")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Palette className="size-3.5" /> {t("Color styles")}
            </div>
            <div className="flex gap-1.5">
              <Input value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder={t("Name")} className="h-8" />
              <Button size="sm" className="h-8 gap-1" onClick={addColor}><Plus className="size-3.5" /> {t("Add")}</Button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {styles.colors.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">{t("No color styles yet.")}</p>}
              {styles.colors.map((style) => (
                <div key={style.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="size-5 shrink-0 rounded border border-black/10" style={{ background: style.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{style.name}</div>
                    <div className="text-[9px] text-muted-foreground">{style.color}</div>
                  </div>
                  <button className="rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10" onClick={() => applyColorStyle(style.id)}>{t("Apply")}</button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm(t("Delete this color style?"))) removeColorStyle(style.id); }}><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Type className="size-3.5" /> {t("Text styles")}
            </div>
            <div className="flex gap-1.5">
              <Input value={textName} onChange={(e) => setTextName(e.target.value)} placeholder={t("Name")} className="h-8" />
              <Button size="sm" className="h-8 gap-1" onClick={addText}><Plus className="size-3.5" /> {t("Add")}</Button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {styles.texts.length === 0 && <p className="py-4 text-center text-[11px] text-muted-foreground">{t("Select a text layer and add its style.")}</p>}
              {styles.texts.map((style) => (
                <div key={style.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded bg-secondary text-[9px] font-semibold">Aa</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{style.name}</div>
                    <div className="text-[9px] text-muted-foreground">{style.fontFamily} · {style.fontSize}</div>
                  </div>
                  <button className="rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10" onClick={() => applyTextStyle(style.id)}>{t("Apply")}</button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm(t("Delete this text style?"))) removeTextStyle(style.id); }}><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
          </section>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("Styles are local to this file. Apply a color to any selected layer, or a text style to text layers.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
