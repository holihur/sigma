import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Cloud,
  CloudOff,
  History,
  Home,
  LogOut,
  Moon,
  MoreHorizontal,
  Play,
  Redo2,
  Share2,
  Sun,
  Undo2,
  Users,
  MessageCircle,
  Sparkles,
  Settings2,
  FileDown,
  BookOpen,
  Component as ComponentIcon,
  PanelLeft,
  SlidersHorizontal,
  Languages,
  Terminal,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { useI18n, useT } from "@/i18n";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useTheme } from "@/store/theme";
import { useEditor } from "@/store/editor";
import { cn, formatRelative, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileDialog } from "@/components/ProfileDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar({
  onShare,
  onVersions,
  onRename,
  onDuplicate,
  onOpenLayers,
  onOpenProperties,
  onOpenAI,
  onOpenAISettings,
  onOpenDeveloper,
  onExportFigma,
  onOpenComponents,
  onOpenAgentContext,
}: {
  onShare: () => void;
  onVersions: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onOpenLayers: () => void;
  onOpenProperties: () => void;
  onOpenAI: () => void;
  onOpenAISettings: () => void;
  onOpenDeveloper: () => void;
  onExportFigma: () => void;
  onOpenComponents: () => void;
  onOpenAgentContext: () => void;
}) {
  const file = useEditor((s) => s.file);
  const syncStatus = useEditor((s) => s.syncStatus);
  const lastSavedAt = useEditor((s) => s.lastSavedAt);
  const isReadOnly = useEditor((s) => s.isReadOnly);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const openPreview = useEditor((s) => s.openPreview);
  const showComments = useEditor((s) => s.showComments);
  const setShowComments = useEditor((s) => s.setShowComments);
  const collaborators = useEditor((s) => s.collaborators);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const navigate = useNavigate();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const toggleLocale = useI18n((s) => s.toggle);
  const [editing, setEditing] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draft, setDraft] = useState(file?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(file?.name ?? "");
  }, [file?.name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitName = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== file?.name && !isReadOnly) onRename(next);
    else setDraft(file?.name ?? "");
  };

  const uniqueUsers = Array.from(
    new Map(collaborators.filter((c) => c.userId && c.userId !== user?.id).map((c) => [c.userId, c])).values(),
  ).slice(0, 4);

  if (!file) return null;

  return (
    <TooltipProvider delayDuration={350}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-panel-border bg-panel px-1 sm:gap-2 sm:px-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/"
              className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white shadow-sm sm:flex"
            >
              <svg viewBox="0 0 32 32" className="size-5" fill="currentColor">
                <path d="M21.5 10.2c-1.3-.9-2.9-1.4-4.7-1.4-3 0-5 1.4-5 3.7 0 2 1.3 2.9 4.2 3.6 2.4.6 3.1 1 3.1 2 0 1-1 1.6-2.5 1.6-1.9 0-3.5-.7-4.8-1.8l-.9 2.2c1.5 1.3 3.5 2 5.7 2 3.4 0 5.4-1.5 5.4-4 0-2.2-1.4-3.2-4.4-3.9-2.3-.5-3-1-3-1.8 0-.9.9-1.4 2.3-1.4 1.6 0 3 .6 4.2 1.5l.4-2.3Z" />
              </svg>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Back to files</TooltipContent>
        </Tooltip>

        <div className="flex min-w-0 items-center gap-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setDraft(file.name);
                  setEditing(false);
                }
                e.stopPropagation();
              }}
              className="h-7 w-[48vw] max-w-64 rounded border border-ring bg-transparent px-1.5 text-[13px] font-medium outline-none sm:w-52"
            />
          ) : (
            <button
              className="max-w-[30vw] truncate rounded px-1 py-1 text-[13px] font-medium hover:bg-secondary sm:max-w-[46vw] sm:px-1.5"
              onClick={() => !isReadOnly && setEditing(true)}
              title={file.name}
            >
              {file.name}
            </button>
          )}
          {isReadOnly && (
            <span className="ml-1 hidden rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">View only</span>
          )}
          <div className="ml-1 hidden items-center gap-1 text-[10px] text-muted-foreground lg:flex">
            {syncStatus === "offline" ? (
              <>
                <CloudOff className="size-3" /> {t("Offline")}
              </>
            ) : syncStatus === "saving" ? (
              <>
                <Cloud className="size-3 animate-pulse" /> {t("Saving…")}
              </>
            ) : (
              <>
                <Cloud className="size-3" /> {t("Saved")}{lastSavedAt ? ` · ${formatRelative(new Date(lastSavedAt).toISOString())}` : ""}
              </>
            )}
          </div>
        </div>

        <div className="ml-1 hidden items-center gap-0.5 sm:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                title={t("Undo")}
                disabled={past === 0}
                onClick={undo}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                <Undo2 className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Undo ⌘Z</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                title={t("Redo")}
                disabled={future === 0}
                onClick={redo}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
              >
                <Redo2 className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Redo ⇧⌘Z</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        <div className="mr-1 hidden items-center -space-x-1.5 lg:flex">
          {uniqueUsers.map((u) => (
            <Tooltip key={u.clientId}>
              <TooltipTrigger asChild>
                <Avatar className="size-7 border-2 border-panel">
                  <AvatarFallback className="text-[9px] font-semibold text-white" style={{ background: u.color }}>
                    {initials(u.name)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{u.name} is here</TooltipContent>
            </Tooltip>
          ))}
          {uniqueUsers.length > 0 && <span className="pl-2 text-[10px] text-muted-foreground">{uniqueUsers.length} live</span>}
        </div>

        <button
          title={t("Pages & layers")}
          onClick={onOpenLayers}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground sm:size-8 lg:hidden"
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          title={t("Properties")}
          onClick={onOpenProperties}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground sm:size-8 xl:hidden"
        >
          <SlidersHorizontal className="size-4" />
        </button>

        <button
          title={t("AI assistant")}
          onClick={onOpenAI}
          className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white shadow-sm transition-transform hover:scale-105 sm:size-8"
        >
          <Sparkles className="size-4" />
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              title={t("Comments")}
              onClick={() => setShowComments(!showComments)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground sm:size-8",
                showComments && "bg-secondary text-foreground",
              )}
            >
              <MessageCircle className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Comments</TooltipContent>
        </Tooltip>

        <Button variant="outline" size="sm" onClick={onShare} className="h-7 gap-1.5 px-1.5 sm:h-8 sm:px-3">
          <Share2 className="size-3.5" />
          <span className="hidden sm:inline">{t("Share")}</span>
        </Button>

        <Button size="sm" className="h-7 gap-1.5 bg-gradient-to-b from-[#38bdf8] to-[#0284c7] px-1.5 shadow sm:h-8 sm:px-4" onClick={() => openPreview(null)}>
          <Play className="size-3.5 fill-current" />
          <span className="hidden sm:inline">{t("Present")}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button title={t("Account menu")} className="flex h-7 items-center gap-0.5 rounded-md px-0.5 hover:bg-secondary sm:h-8 sm:gap-1 sm:px-1">
              <Avatar className="size-6">
                {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                <AvatarFallback className="text-[9px] font-semibold text-white" style={{ background: user?.color }}>
                  {initials(user?.name ?? "?")}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="normal-case">
              <div className="text-[12px] font-medium text-foreground">{user?.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
              <UserRound className="size-4" /> {t("Personal settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAISettings}>
              <Settings2 className="size-4" /> {t("AI settings")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenComponents}>
              <ComponentIcon className="size-4" /> {t("Components")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAgentContext}>
              <BookOpen className="size-4" /> {t("Agent context & skills")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenDeveloper}>
              <Terminal className="size-4" /> {t("Developer & MCP")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportFigma}>
              <FileDown className="size-4" /> {t("Export Figma JSON")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onVersions}>
              <History className="size-4" /> {t("Version history")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Users className="size-4" /> {t("Duplicate file")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? t("Light theme") : t("Dark theme")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleLocale}>
              <Languages className="size-4" /> {locale === "en" ? "中文" : "English"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/")}>
              <Home className="size-4" /> {t("All designs")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut className="size-4" /> {t("Sign out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              title={t("Keyboard shortcuts")}
              onClick={() => setShortcutsOpen(true)}
              className="ml-0.5 hidden size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground sm:flex"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Shortcuts: V move · F frame · T text</TooltipContent>
        </Tooltip>
      </header>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </TooltipProvider>
  );
}
