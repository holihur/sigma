import React from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "./controls";
import { useT } from "@/i18n";

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: "Tools",
    rows: [
      { keys: ["V"], label: "Move" },
      { keys: ["H"], label: "Hand / pan" },
      { keys: ["F"], label: "Frame" },
      { keys: ["R"], label: "Rectangle" },
      { keys: ["O"], label: "Ellipse" },
      { keys: ["L"], label: "Line" },
      { keys: ["T"], label: "Text" },
      { keys: ["C"], label: "Comment" },
    ],
  },
  {
    title: "Edit",
    rows: [
      { keys: ["⌘", "Z"], label: "Undo" },
      { keys: ["⇧", "⌘", "Z"], label: "Redo" },
      { keys: ["⌘", "C"], label: "Copy" },
      { keys: ["⌘", "V"], label: "Paste" },
      { keys: ["⌘", "D"], label: "Duplicate" },
      { keys: ["⌘", "G"], label: "Group" },
      { keys: ["⇧", "⌘", "G"], label: "Ungroup" },
      { keys: ["⌫"], label: "Delete selection" },
    ],
  },
  {
    title: "View",
    rows: [
      { keys: ["Space"], label: "Pan canvas" },
      { keys: ["⌘", "scroll"], label: "Zoom" },
      { keys: ["⇧", "1"], label: "Zoom to fit" },
      { keys: ["⇧", "0"], label: "Zoom to 100%" },
      { keys: ["⌘", "0"], label: "Fit page" },
    ],
  },
  {
    title: "Arrange",
    rows: [
      { keys: ["←", "→", "↑", "↓"], label: "Nudge by 1px" },
      { keys: ["⇧", "arrows"], label: "Nudge by 10px" },
      { keys: ["⌘", "]"], label: "Bring forward" },
      { keys: ["⌘", "["], label: "Send backward" },
      { keys: ["⇧", "⌘", "]"], label: "Bring to front" },
      { keys: ["⇧", "⌘", "["], label: "Send to back" },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-primary" /> {t("Keyboard shortcuts")}
          </DialogTitle>
          <DialogDescription>{t("Work faster with the canvas at your fingertips.")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t(group.title)}</div>
              <div className="space-y-0.5">
                {group.rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-secondary/40">
                    <span className="text-[12px] text-foreground/90">{t(row.label)}</span>
                    <span className="flex items-center gap-1">
                      {row.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
