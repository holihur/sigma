import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe2, Link2, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { appUrl, membersApi, publicApi } from "@/lib/api";
import type { Member } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { copyText, initials, formatRelative } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

function toLocalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const file = useEditor((s) => s.file);
  const user = useAuth((s) => s.user);
  const [members, setMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("edit");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publicToken, setPublicToken] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicExpiresAt, setPublicExpiresAt] = useState("");
  const [publicPassword, setPublicPassword] = useState("");
  const [publicHasPassword, setPublicHasPassword] = useState(false);
  const [removePublicPassword, setRemovePublicPassword] = useState(false);

  useEffect(() => {
    if (!open || !file) return;
    setLoading(true);
    membersApi
      .list(file.id)
      .then((data) => {
        setMembers(data.members);
        setOwner(data.owner);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    if (file.role === "owner") {
      publicApi
        .link(file.id)
        .then((data) => {
          setPublicToken(data.token);
          setPublicEnabled(data.enabled);
          setPublicExpiresAt(data.expiresAt ? toLocalDateTime(data.expiresAt) : "");
          setPublicHasPassword(data.hasPassword);
        })
        .catch(() => undefined);
    }
  }, [open, file?.id]);

  if (!file) return null;
  const isOwner = file.role === "owner";

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const data = await membersApi.add(file.id, email.trim(), role);
      setMembers(data.members);
      setEmail("");
      toast.success(t("Collaborator added"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const remove = async (member: Member) => {
    try {
      const data = await membersApi.remove(file.id, member.userId);
      setMembers(data.members);
      toast.success(t("Removed collaborator"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copyLink = async () => {
    await copyText(window.location.href);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1800);
  };

  const publicUrl = publicToken ? appUrl(`p/${publicToken}`) : "";

  const savePublic = async (enabled = publicEnabled) => {
    setPublicBusy(true);
    try {
      const data = await publicApi.set(file.id, {
        enabled,
        expiresAt: publicExpiresAt ? new Date(publicExpiresAt).getTime() : 0,
        password: publicPassword,
        removePassword: removePublicPassword,
      });
      setPublicToken(data.token);
      setPublicEnabled(data.enabled);
      setPublicHasPassword(data.hasPassword);
      setPublicPassword("");
      setRemovePublicPassword(false);
      if (!data.enabled) setPublicExpiresAt("");
      toast.success(enabled ? t("Public link saved") : t("Public link disabled"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublicBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" /> {t("Share")} “{file.name}”
          </DialogTitle>
          <DialogDescription>
            {t("Invite teammates to edit or review this design. Collaborators need a Sigma account.")}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") invite();
                  e.stopPropagation();
                }}
                placeholder="teammate@company.com"
                className="pl-8"
                type="email"
              />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="edit">{t("Can edit")}</SelectItem>
                <SelectItem value="view">{t("Can view")}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={invite} disabled={inviting || !email.includes("@")}>
              <UserPlus className="size-4" /> {t("Invite")}
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Shield className="size-3.5" /> {t("People with access")}
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
              <Avatar className="size-8">
                {user?.name === (owner || file.ownerName) && user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                <AvatarFallback className="text-[10px] font-semibold text-white" style={{ background: user?.color }}>
                  {initials(owner || file.ownerName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">
                  {owner || file.ownerName} {user?.name === (owner || file.ownerName) && <span className="text-muted-foreground">{t("(you)")}</span>}
                </div>
                <div className="text-[10px] text-muted-foreground">Owner</div>
              </div>
              <Badge variant="secondary">{t("Owner")}</Badge>
            </div>
            {loading && <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">Loading collaborators…</div>}
            {!loading && members.length === 0 && (
              <div className="px-3 py-5 text-center text-[11px] text-muted-foreground">
                {t("No collaborators yet. Invite someone by email.")}
              </div>
            )}
            {members.map((m) => (
              <div key={m.userId} className="group flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-secondary/50">
                <Avatar className="size-8">
                  {m.avatar && <AvatarImage src={m.avatar} alt={m.name} />}
                  <AvatarFallback className="text-[10px] font-semibold text-white" style={{ background: m.color }}>
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-[13px]">
                    {m.name}
                    {m.userId === user?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">{m.email}</div>
                </div>
                <Badge variant="outline">{m.role === "edit" ? "Can edit" : "Can view"}</Badge>
                {isOwner && (
                  <button
                    onClick={() => remove(m)}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-secondary hover:text-destructive group-hover:opacity-100"
                    title="Remove access"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {isOwner && (
          <div className="rounded-lg border border-border">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <Globe2 className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12px] font-medium">
                  {t("Public prototype")}
                  {publicEnabled && <Badge variant="success">{t("Live")}</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {t("Anyone with the link can view the click-through prototype, no account needed.")}
                </div>
              </div>
              <Switch checked={publicEnabled} onCheckedChange={(value) => void savePublic(value)} disabled={publicBusy} />
            </div>
            {publicEnabled && (
              <div className="space-y-2 border-t border-border px-3 py-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    <span>{t("Expires")}</span>
                    <Input type="datetime-local" value={publicExpiresAt} onChange={(e) => setPublicExpiresAt(e.target.value)} className="h-8 text-[11px]" />
                  </label>
                  <label className="space-y-1 text-[10px] text-muted-foreground">
                    <span>{publicHasPassword ? t("New password (optional)") : t("Password (optional)")}</span>
                    <Input type="password" value={publicPassword} onChange={(e) => { setPublicPassword(e.target.value); setRemovePublicPassword(false); }} placeholder={publicHasPassword ? "••••••••" : t("Leave empty for public access")} className="h-8 text-[11px]" />
                  </label>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {publicHasPassword && !removePublicPassword ? t("Password protection is on") : t("Anyone with the link can view")}
                  </span>
                  <div className="flex gap-1.5">
                    {publicHasPassword && (
                      <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setRemovePublicPassword(true); setPublicPassword(""); }}>
                        {t("Remove password")}
                      </Button>
                    )}
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => void savePublic()} disabled={publicBusy}>
                      {t("Save link settings")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {publicEnabled && publicUrl && (
              <div className="flex items-center gap-2 border-t border-border bg-secondary/30 px-3 py-2">
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{publicUrl}</span>
                <Button variant="ghost" size="iconXs" onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")} title="Open prototype">
                  <ExternalLink className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await copyText(publicUrl);
                    toast.success(t("Public link copied"));
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2">
          <Link2 className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{window.location.href}</span>
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("Copied") : t("Editor link")}
          </Button>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("Tip: for a quick review, invite the demo account demo@sigma.design. Only people with access can open this file.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
