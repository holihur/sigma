import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { uploadImage } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { cn, initials } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLORS = ["#0ea5e9", "#0284c7", "#7c5cff", "#ec4899", "#f97316", "#22c55e", "#eab308", "#ef4444"];

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  const [avatar, setAvatar] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name);
    setColor(user.color || "#0ea5e9");
    setAvatar(user.avatar ?? "");
  }, [open, user]);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      setAvatar(await uploadImage(file));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error(t("Name must be between 2 and 60 characters"));
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), color, avatar });
      toast.success(t("Profile updated"));
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-white shadow">
              <UserRound className="size-4" />
            </span>
            {t("Personal settings")}
          </DialogTitle>
          <DialogDescription>{t("Update how you appear to collaborators across Sigma.")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-secondary/30 p-4">
          <button type="button" className="relative shrink-0" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Avatar className="size-20 text-[24px]">
              {avatar && <AvatarImage src={avatar} alt={name} />}
              <AvatarFallback className="text-[24px] font-semibold text-white" style={{ background: color }}>
                {initials(name || "?")}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium">{t("Profile picture")}</div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{t("PNG, JPG, GIF or WebP. Uploaded to this Sigma instance.")}</p>
            <div className="mt-2 flex gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Camera className="size-3" /> {t("Upload avatar")}
              </Button>
              {avatar && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[10px] text-destructive" onClick={() => setAvatar("")}>
                  <Trash2 className="size-3" /> {t("Remove")}
                </Button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="profile-name">{t("Display name")}</Label>
          <Input id="profile-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <p className="text-[10px] text-muted-foreground">{t("Shown on comments, cursors and collaborator lists.")}</p>
        </div>

        <div className="space-y-1.5">
          <Label>{t("Profile color")}</Label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => setColor(c)}
                className={cn("size-7 rounded-full border-2 transition-transform hover:scale-110", color === c ? "border-foreground" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <p className="rounded-md bg-secondary/50 px-2.5 py-2 text-[10px] text-muted-foreground">
          {t("Email")}: {user?.email}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t("Cancel")}</Button>
          <Button onClick={save} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />} {t("Save profile")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
