import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  Copy,
  Figma,
  Folder,
  Globe2,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Bell,
  Languages,
  Menu,
  X,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  Square,
  Star,
  Sun,
  Trash2,
  Users,
  Component,
  Presentation,
  ArrowUpRight,
  Loader2,
  AlertTriangle,
  Terminal,
  UserRound,
  Check,
  ChevronDown,
  FolderOpen,
  List,
  MoveRight,
  CheckSquare,
  Square as SquareIcon,
} from "lucide-react";
import { toast } from "sonner";
import { filesApi, notificationsApi } from "@/lib/api";
import type { FileMeta, Notification, TemplateMeta } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useTheme } from "@/store/theme";
import { useI18n, useT } from "@/i18n";
import { cn, formatRelative, initials, isEditableTarget } from "@/lib/utils";
import { prefetchEditor, whenIdle } from "@/lib/prefetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileDialog } from "@/components/ProfileDialog";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
const DeveloperDialog = React.lazy(() =>
  import("@/components/editor/DeveloperDialog").then((m) => ({ default: m.DeveloperDialog })),
);
const FigmaImportDialog = React.lazy(() =>
  import("@/components/editor/FigmaImportDialog").then((m) => ({ default: m.FigmaImportDialog })),
);

type Nav = "all" | "starred" | "shared";

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const theme = useTheme((s) => s.theme);
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const toggleLocale = useI18n((s) => s.toggle);
  const toggleTheme = useTheme((s) => s.toggle);
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>("all");
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const normalizeFolder = (value: string) => value.trim().replace(/\s+/g, " ");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">("grid");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveFolder, setMoveFolder] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<"updated" | "name" | "created">("updated");
  const [newOpen, setNewOpen] = useState(false);
  const [template, setTemplate] = useState("blank");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FileMeta | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [figmaOpen, setFigmaOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [filesRes, templatesRes] = await Promise.all([filesApi.list(), filesApi.templates()]);
      setFiles(filesRes.files);
      setTemplates(templatesRes.templates);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      /* notifications are non-critical */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadNotifications();
  }, [load, loadNotifications]);

  // Prefetch the editor once the dashboard is interactive. Hovering a card is
  // an even stronger signal, so FileCard also calls prefetchEditor directly.
  useEffect(() => whenIdle(prefetchEditor, 3200), []);

  useEffect(() => {
    const onFocus = () => {
      void load();
      void loadNotifications();
    };
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => void loadNotifications(), 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [load, loadNotifications]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [nav, folderFilter, search]);

  const counts = useMemo(
    () => ({
      all: files.length,
      starred: files.filter((f) => f.starred).length,
      shared: files.filter((f) => f.role !== "owner").length,
    }),
    [files],
  );

  const folders = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) {
      const name = (f.folder ?? "").trim();
      if (name) map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [files]);

  const visible = useMemo(() => {
    let list = files;
    if (nav === "starred") list = list.filter((f) => f.starred);
    if (nav === "shared") list = list.filter((f) => f.role !== "owner");
    if (folderFilter !== null) list = list.filter((f) => (f.folder ?? "") === folderFilter);
    const q = deferredSearch.trim().toLowerCase();
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q) || f.ownerName.toLowerCase().includes(q));
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "created") sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    else sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return sorted;
  }, [files, nav, deferredSearch, sort, folderFilter]);

  const templateMap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const openNew = (preset?: string) => {
    setSidebarOpen(false);
    setTemplate(preset ?? "blank");
    setNewName("");
    setNewOpen(true);
  };

  const create = async () => {
    setCreating(true);
    try {
      const t = templateMap.get(template);
      const name = newName.trim() || t?.name || "Untitled design";
      const data = await filesApi.create(name, template, folderFilter && folderFilter !== "" ? folderFilter : "");
      toast.success("Design created");
      navigate(`/file/${data.file.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  };

  const toggleStar = async (file: FileMeta) => {
    const next = !file.starred;
    setFiles((list) => list.map((f) => (f.id === file.id ? { ...f, starred: next } : f)));
    try {
      await filesApi.patch(file.id, { starred: next });
    } catch (e) {
      setFiles((list) => list.map((f) => (f.id === file.id ? { ...f, starred: !next } : f)));
      toast.error((e as Error).message);
    }
  };

  const rename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      const data = await filesApi.patch(renameTarget.id, { name: renameValue.trim() });
      setFiles((list) => list.map((f) => (f.id === renameTarget.id ? data.file : f)));
      setRenameTarget(null);
      toast.success("Renamed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await filesApi.remove(deleteTarget.id);
      setFiles((list) => list.filter((f) => f.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Design deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const duplicate = async (file: FileMeta) => {
    try {
      const data = await filesApi.duplicate(file.id);
      setFiles((list) => [data.file, ...list]);
      toast.success("Design duplicated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleFileSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedFiles = files.filter((f) => selectedIds.has(f.id));

  const bulkStar = async () => {
    if (!selectedFiles.length) return;
    const starred = !selectedFiles.every((f) => f.starred);
    try {
      await Promise.all(selectedFiles.map((f) => filesApi.patch(f.id, { starred })));
      setFiles((list) => list.map((f) => (selectedIds.has(f.id) ? { ...f, starred } : f)));
      toast.success(starred ? t("Starred {count} designs", { count: selectedFiles.length }) : t("Removed stars"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const bulkMove = async () => {
    if (!selectedFiles.length) return;
    const typed = normalizeFolder(moveFolder);
    const folder = folders.find(([name]) => name.toLowerCase() === typed.toLowerCase())?.[0] ?? typed;
    try {
      await Promise.all(selectedFiles.map((f) => filesApi.patch(f.id, { folder })));
      setFiles((list) => list.map((f) => (selectedIds.has(f.id) ? { ...f, folder } : f)));
      setMoveOpen(false);
      setSelectedIds(new Set());
      toast.success(t("Moved {count} designs", { count: selectedFiles.length }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const bulkRemove = async () => {
    const owned = selectedFiles.filter((f) => f.role === "owner");
    try {
      await Promise.all(owned.map((f) => filesApi.remove(f.id)));
      const ids = new Set(owned.map((f) => f.id));
      setFiles((list) => list.filter((f) => !ids.has(f.id)));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast.success(t("Deleted {count} designs", { count: owned.length }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openNotifications = async () => {
    setNotificationsOpen(true);
    if (unread > 0) {
      setUnread(0);
      setNotifications((list) => list.map((n) => ({ ...n, read: true })));
      await notificationsApi.read().catch(() => undefined);
    }
  };

  const greeting = new Date().getHours() < 12 ? t("Good morning") : new Date().getHours() < 18 ? t("Good afternoon") : t("Good evening");
  const heading = folderFilter !== null ? folderFilter || t("Unfiled designs") : nav === "all" ? t("Recent designs") : nav === "starred" ? t("Starred designs") : t("Shared with you");

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[90] flex w-[272px] shrink-0 flex-col border-r border-panel-border bg-panel/95 backdrop-blur transition-transform duration-200 md:static md:z-auto md:w-[232px] md:translate-x-0 md:bg-panel/60 md:backdrop-blur-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white shadow-sm">
            <svg viewBox="0 0 32 32" className="size-4.5" fill="currentColor">
              <path d="M21.5 10.2c-1.3-.9-2.9-1.4-4.7-1.4-3 0-5 1.4-5 3.7 0 2 1.3 2.9 4.2 3.6 2.4.6 3.1 1 3.1 2 0 1-1 1.6-2.5 1.6-1.9 0-3.5-.7-4.8-1.8l-.9 2.2c1.5 1.3 3.5 2 5.7 2 3.4 0 5.4-1.5 5.4-4 0-2.2-1.4-3.2-4.4-3.9-2.3-.5-3-1-3-1.8 0-.9.9-1.4 2.3-1.4 1.6 0 3 .6 4.2 1.5l.4-2.3Z" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Sigma</span>
          <Badge variant="outline" className="ml-auto text-[9px]">
            beta
          </Badge>
          <button
            title={t("Notifications")}
            onClick={() => void openNotifications()}
            className="relative flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold leading-3.5 text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <button
            title={t("Close menu")}
            onClick={() => setSidebarOpen(false)}
            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1.5 px-3 pb-2">
          <Button className="w-full justify-start shadow-sm" onClick={() => openNew()}>
            <SigmaMark className="size-4" /> {t("New design")}
            <span className="ml-auto rounded bg-white/15 px-1 text-[9px] font-medium">N</span>
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => { setFigmaOpen(true); setSidebarOpen(false); }}>
            <Figma className="size-4" /> {t("Import from Figma")}
          </Button>
        </div>

        <nav className="space-y-0.5 px-2 pt-2">
          <NavItem icon={<LayoutGrid className="size-4" />} label={t("All designs")} count={counts.all} active={nav === "all" && folderFilter === null} onClick={() => { setNav("all"); setFolderFilter(null); setSidebarOpen(false); }} />
          <NavItem icon={<Star className="size-4" />} label={t("Starred")} count={counts.starred} active={nav === "starred"} onClick={() => { setNav("starred"); setFolderFilter(null); setSidebarOpen(false); }} />
          <NavItem icon={<Users className="size-4" />} label={t("Shared with me")} count={counts.shared} active={nav === "shared"} onClick={() => { setNav("shared"); setFolderFilter(null); setSidebarOpen(false); }} />
        </nav>

        <div className="mt-5 flex items-center justify-between px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{t("Folders")}</span>
          <span>{folders.length}</span>
        </div>
        <div className="mt-1 max-h-36 space-y-0.5 overflow-y-auto px-2">
          {folders.length === 0 && <p className="px-2 py-1 text-[10px] leading-relaxed text-muted-foreground">{t("Select designs and move them into a folder.")}</p>}
          {folders.map(([name, count]) => (
            <button
              key={name}
              onClick={() => { setNav("all"); setFolderFilter(name); setSidebarOpen(false); }}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                folderFilter === name && "bg-secondary text-foreground",
              )}
            >
              <FolderOpen className="size-3.5 shrink-0" />
              <span className="truncate">{name}</span>
              <span className="ml-auto text-[10px]">{count}</span>
            </button>
          ))}
          {files.some((f) => !(f.folder ?? "").trim()) && (
            <button
              onClick={() => { setNav("all"); setFolderFilter(""); setSidebarOpen(false); }}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                folderFilter === "" && "bg-secondary text-foreground",
              )}
            >
              <Folder className="size-3.5 shrink-0" />
              <span>{t("Unfiled")}</span>
              <span className="ml-auto text-[10px]">{files.filter((f) => !(f.folder ?? "").trim()).length}</span>
            </button>
          )}
        </div>

        <div className="mt-5 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Templates")}</div>
        <div className="mt-2 space-y-0.5 px-2">
          {templates
            .filter((tpl) => tpl.id !== "blank")
            .slice(0, 4)
            .map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => openNew(tpl.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {tpl.logo ? (
                  <img src={tpl.logo} alt="" className="size-5 shrink-0 rounded-[5px] object-cover" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded text-white" style={{ background: tpl.accent }}>
                    <TemplateIcon icon={tpl.icon} className="size-3" />
                  </span>
                )}
                <span className="truncate">{t(tpl.name)}</span>
              </button>
            ))}
        </div>

        <div className="flex-1" />

        <div className="m-2 rounded-xl border border-panel-border bg-background/60 p-2">
          <div className="flex items-center gap-2 px-1 py-1">
            <Avatar className="size-8">
              {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="text-[10px] font-semibold text-white" style={{ background: user?.color }}>
                {initials(user?.name ?? "?")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium">{user?.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onClick={toggleTheme}>
                  {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {theme === "dark" ? t("Light theme") : t("Dark theme")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleLocale}>
                  <Languages className="size-4" /> {locale === "en" ? "中文" : "English"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                  <UserRound className="size-4" /> {t("Personal settings")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeveloperOpen(true)}>
                  <Terminal className="size-4" /> {t("Developer & MCP")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-[85] bg-black/55 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-panel-border bg-background/90 px-4 backdrop-blur md:hidden">
          <button
            title={t("Open menu")}
            onClick={() => setSidebarOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#38bdf8] to-[#0284c7] text-white">
            <svg viewBox="0 0 32 32" className="size-4" fill="currentColor">
              <path d="M21.5 10.2c-1.3-.9-2.9-1.4-4.7-1.4-3 0-5 1.4-5 3.7 0 2 1.3 2.9 4.2 3.6 2.4.6 3.1 1 3.1 2 0 1-1 1.6-2.5 1.6-1.9 0-3.5-.7-4.8-1.8l-.9 2.2c1.5 1.3 3.5 2 5.7 2 3.4 0 5.4-1.5 5.4-4 0-2.2-1.4-3.2-4.4-3.9-2.3-.5-3-1-3-1.8 0-.9.9-1.4 2.3-1.4 1.6 0 3 .6 4.2 1.5l.4-2.3Z" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Sigma</span>
          <button
            title={t("Notifications")}
            onClick={() => void openNotifications()}
            className="relative ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Bell className="size-4.5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold leading-3.5 text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <button
            title={t("Import from Figma")}
            onClick={() => setFigmaOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Figma className="size-4" />
          </button>
          <Button size="sm" className="h-8" onClick={() => openNew()}>
            <SigmaMark className="size-4" /> {t("New")}
          </Button>
        </div>
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-8 sm:py-5 lg:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search designs…")}
                className="h-9 rounded-lg bg-panel pl-9 pr-12"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-secondary px-1 text-[9px] text-muted-foreground">
                /
              </kbd>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hidden h-9 items-center gap-1.5 rounded-lg border border-border bg-panel px-3 text-[12px] text-muted-foreground hover:text-foreground sm:flex">
                    <Clock className="size-3.5" />
                    {sort === "updated" ? t("Last updated") : sort === "created" ? t("Date created") : t("Name")}
                    <ChevronDown className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSort("updated")}>{t("Last updated")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSort("created")}>{t("Date created")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSort("name")}>{t("Name")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="hidden items-center gap-0.5 rounded-md border border-border p-0.5 sm:flex">
                <button
                  onClick={() => setView("grid")}
                  className={cn("flex size-7 items-center justify-center rounded", view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                  title={t("Grid view")}
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn("flex size-7 items-center justify-center rounded", view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
                  title={t("List view")}
                >
                  <List className="size-3.5" />
                </button>
              </div>
              <Button variant="outline" className="h-9 gap-1.5" onClick={() => setFigmaOpen(true)}>
                <Figma className="size-4" /> <span className="hidden sm:inline">{t("Import")}</span>
              </Button>
              <Button className="hidden h-9 sm:inline-flex" onClick={() => openNew()}>
                <Plus className="size-4" /> {t("New design")}
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 sm:mt-8">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">
                {greeting}, {user?.name?.split(" ")[0]}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {counts.all === 0
                  ? t("Let’s turn your next idea into an interactive prototype.")
                  : t("You have {count} designs in your workspace.", { count: counts.all })}
              </p>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <SummaryChip icon={<Folder className="size-3.5" />} label={t("Designs")} value={counts.all} />
              <SummaryChip icon={<Star className="size-3.5" />} label={t("Starred")} value={counts.starred} />
              <SummaryChip icon={<Users className="size-3.5" />} label={t("Shared")} value={counts.shared} />
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 sm:mt-7">
            <h2 className="text-[13px] font-semibold">{heading}</h2>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{visible.length}</span>
            <button
              onClick={() => setSelectedIds((prev) => {
                if (visible.length > 0 && visible.every((f) => prev.has(f.id))) return new Set();
                return new Set(visible.map((f) => f.id));
              })}
              className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {visible.length > 0 && visible.every((f) => selectedIds.has(f.id)) ? t("Clear selection") : t("Select all")}
            </button>
            {nav !== "all" && (
              <button onClick={() => setNav("all")} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
                {t("View all designs")} <ArrowUpRight className="inline size-3" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[16/10] rounded-xl bg-secondary/70" />
                  <div className="mt-3 h-3 w-2/3 rounded bg-secondary/70" />
                  <div className="mt-2 h-2.5 w-1/3 rounded bg-secondary/50" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
              <AlertTriangle className="size-6 text-destructive" />
              <p className="text-sm font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                {t("Try again")}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <EmptyState nav={nav} search={search} onCreate={() => openNew()} onClear={() => setSearch("")} />
          ) : view === "grid" ? (
            <div className="mt-4 grid grid-cols-1 gap-4 pb-24 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  template={templateMap.get(file.template)}
                  selected={selectedIds.has(file.id)}
                  onToggleSelect={() => toggleFileSelected(file.id)}
                  onOpen={() => navigate(`/file/${file.id}`)}
                  onStar={() => toggleStar(file)}
                  onRename={() => {
                    setRenameTarget(file);
                    setRenameValue(file.name);
                  }}
                  onDuplicate={() => duplicate(file)}
                  onDelete={() => setDeleteTarget(file)}
                  onShare={() => navigate(`/file/${file.id}?share=1`)}
                  onMove={() => { setMoveFolder(file.folder ?? ""); setSelectedIds(new Set([file.id])); setMoveOpen(true); }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-1.5 pb-24">
              {visible.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  template={templateMap.get(file.template)}
                  selected={selectedIds.has(file.id)}
                  onToggleSelect={() => toggleFileSelected(file.id)}
                  onOpen={() => navigate(`/file/${file.id}`)}
                  onStar={() => toggleStar(file)}
                  onRename={() => { setRenameTarget(file); setRenameValue(file.name); }}
                  onDuplicate={() => duplicate(file)}
                  onDelete={() => setDeleteTarget(file)}
                  onShare={() => navigate(`/file/${file.id}?share=1`)}
                  onMove={() => { setMoveFolder(file.folder ?? ""); setSelectedIds(new Set([file.id])); setMoveOpen(true); }}
                />
              ))}
            </div>
          )}

          {!loading && !error && visible.length > 0 && (
            <div className="pb-10 text-center text-[10px] text-muted-foreground">
              {t("{count} designs · Press N for a new canvas", { count: visible.length })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="size-4 text-primary" /> {t("Notifications")}
            </DialogTitle>
            <DialogDescription>{t("Comments and activity across your designs.")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border">
            {notifications.length === 0 ? (
              <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                {t("You’re all caught up. New comments will show up here.")}
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate(`/file/${n.fileId}?comments=1`);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-secondary/40",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <Avatar className="mt-0.5 size-7 shrink-0">
                    {n.avatar && <AvatarImage src={n.avatar} alt={n.actor} />}
                    <AvatarFallback className="text-[9px] font-semibold text-white" style={{ background: n.color }}>
                      {initials(n.actor)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] leading-relaxed">
                      <span className="font-medium">{n.actor}</span> {t("commented on")}{" "}
                      <span className="font-medium">{n.fileName}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.text}</div>
                    <div className="mt-1 text-[9px] text-muted-foreground">{formatRelative(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotificationsOpen(false)}>
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New design dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> {t("Create a new design")}
            </DialogTitle>
            <DialogDescription>{t("Pick a starting point or begin with a blank canvas.")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(templates.length ? templates : [{ id: "blank", name: "Blank canvas", description: "", accent: "#0ea5e9", icon: "square" }]).map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setTemplate(tpl.id)}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                  template === tpl.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30 hover:bg-secondary/40",
                )}
              >
                {tpl.logo ? (
                  <img src={tpl.logo} alt="" className="size-10 shrink-0 rounded-lg object-cover shadow-sm" />
                ) : (
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${tpl.accent}, color-mix(in oklch, ${tpl.accent} 55%, #111))` }}
                  >
                    <TemplateIcon icon={tpl.icon} className="size-4.5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    {t(tpl.name)}
                    {template === tpl.id && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{t(tpl.description)}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground" htmlFor="design-name">
              {t("Design name")}
            </label>
            <Input
              id="design-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                e.stopPropagation();
              }}
              placeholder={templateMap.get(template)?.name || t("Untitled design")}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={create} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create design
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Rename design")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void rename();
              e.stopPropagation();
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={rename} disabled={!renameValue.trim()}>
              {t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Delete design")} “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              {t("This permanently deletes the design, its pages, comments and version history. This action cannot be undone.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button variant="destructive" onClick={remove}>
              <Trash2 className="size-4" /> {t("Delete design")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-panel-border bg-panel/95 px-2 py-1.5 shadow-2xl backdrop-blur sm:bottom-6">
          <span className="px-2 text-[11px] font-medium">{t("{count} selected", { count: selectedIds.size })}</span>
          <span className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => void bulkStar()}>
            <Star className="size-3.5" /> {t("Star")}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => { setMoveFolder(""); setMoveOpen(true); }}>
            <MoveRight className="size-3.5" /> {t("Move")}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px] text-destructive hover:text-destructive" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="size-3.5" /> {t("Delete")}
          </Button>
          <span className="h-4 w-px bg-border" />
          <button onClick={() => setSelectedIds(new Set())} className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground" title={t("Clear selection")}>
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Move to folder")}</DialogTitle>
            <DialogDescription>{t("Move {count} designs. Type a new name to create a folder.", { count: selectedIds.size })}</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={moveFolder} onChange={(e) => setMoveFolder(e.target.value)} placeholder={t("Folder name")} onKeyDown={(e) => { if (e.key === "Enter") void bulkMove(); e.stopPropagation(); }} />
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {folders.map(([name]) => (
                <button key={name} onClick={() => setMoveFolder(name)} className={cn("rounded-md border border-border px-2 py-1 text-[11px]", moveFolder === name && "border-primary bg-primary/10 text-primary")}>
                  {name}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={() => void bulkMove()}>{t("Move")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Delete {count} designs?", { count: selectedIds.size })}</DialogTitle>
            <DialogDescription>{t("Only designs you own can be deleted. This cannot be undone.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>{t("Cancel")}</Button>
            <Button variant="destructive" onClick={() => void bulkRemove()}><Trash2 className="size-4" /> {t("Delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {figmaOpen && (
        <React.Suspense fallback={null}>
          <FigmaImportDialog open={figmaOpen} onOpenChange={setFigmaOpen} onImported={(file) => { void load(); navigate(`/file/${file.id}`); }} />
        </React.Suspense>
      )}
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      {developerOpen && (
        <React.Suspense fallback={null}>
          <DeveloperDialog open={developerOpen} onOpenChange={setDeveloperOpen} />
        </React.Suspense>
      )}
    </div>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
      <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
    </button>
  );
}

function SummaryChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-panel px-2.5 py-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-none">
        <div className="text-[13px] font-semibold">{value}</div>
        <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function SigmaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M21.5 10.2c-1.3-.9-2.9-1.4-4.7-1.4-3 0-5 1.4-5 3.7 0 2 1.3 2.9 4.2 3.6 2.4.6 3.1 1 3.1 2 0 1-1 1.6-2.5 1.6-1.9 0-3.5-.7-4.8-1.8l-.9 2.2c1.5 1.3 3.5 2 5.7 2 3.4 0 5.4-1.5 5.4-4 0-2.2-1.4-3.2-4.4-3.9-2.3-.5-3-1-3-1.8 0-.9.9-1.4 2.3-1.4 1.6 0 3 .6 4.2 1.5l.4-2.3Z" />
    </svg>
  );
}

function TemplateIcon({ icon, className }: { icon: string; className?: string }) {
  switch (icon) {
    case "smartphone":
      return <Smartphone className={className} />;
    case "globe":
      return <Globe2 className={className} />;
    case "layout-dashboard":
      return <LayoutDashboard className={className} />;
    case "presentation":
      return <Presentation className={className} />;
    case "component":
      return <Component className={className} />;
    default:
      return <Square className={className} />;
  }
}

function FileCard({
  file,
  template,
  selected,
  onToggleSelect,
  onOpen,
  onStar,
  onRename,
  onDuplicate,
  onDelete,
  onShare,
  onMove,
}: {
  file: FileMeta;
  template?: TemplateMeta;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onStar: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShare: () => void;
  onMove: () => void;
}) {
  const t = useT();
  return (
    <div
      className={cn("group relative rounded-xl", selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
      onMouseEnter={prefetchEditor}
      onTouchStart={prefetchEditor}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={cn(
          "absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-md border-2 shadow-sm transition-all",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-white/70 bg-black/25 text-transparent opacity-100 backdrop-blur md:opacity-0 md:group-hover:opacity-100",
        )}
        title={t("Select design")}
      >
        <Check className="size-3.5" />
      </button>
      <button
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-xl border border-panel-border bg-panel text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-muted-foreground/25 hover:shadow-xl"
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
          {file.thumbnail ? (
            <img src={file.thumbnail} alt={file.name} loading="lazy" decoding="async" className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02]" />
          ) : (
            <TemplatePreview file={file} template={template} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="absolute bottom-2 left-2 flex translate-y-2 items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 backdrop-blur transition-all group-hover:translate-y-0 group-hover:opacity-100">
            {t("Open in editor")} <ArrowUpRight className="size-3" />
          </div>
          {file.role !== "owner" && (
            <div className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur">
              {file.role === "edit" ? t("Can edit") : t("View only")}
            </div>
          )}
        </div>
      </button>

      <div className="mt-2.5 flex items-start gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block w-full truncate text-left text-[13px] font-medium hover:underline">
            {file.name}
          </button>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{file.role === "owner" ? t("You") : file.ownerName}</span>
            <span>·</span>
            <span>{formatRelative(file.updatedAt)}</span>
            {file.folder && (
              <>
                <span>·</span>
                <span className="max-w-24 truncate">{file.folder}</span>
              </>
            )}
            {file.template && file.template !== "blank" && (
              <>
                <span>·</span>
                <span className="capitalize">{file.template}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground",
            file.starred && "text-amber-400 hover:text-amber-300",
          )}
          title={file.starred ? "Remove star" : "Add star"}
        >
          <Star className={cn("size-3.5", file.starred && "fill-current")} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>{t("Open")}</DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="size-4" /> {t("Rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" /> {t("Duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShare}>
              <Users className="size-4" /> {t("Share")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <MoveRight className="size-4" /> {t("Move to folder")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onStar}>
              <Star className="size-4" /> {file.starred ? t("Remove star") : t("Star")}
            </DropdownMenuItem>
            {file.role === "owner" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash2 className="size-4" /> {t("Delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FileRow({
  file,
  template,
  selected,
  onToggleSelect,
  onOpen,
  onStar,
  onRename,
  onDuplicate,
  onDelete,
  onShare,
  onMove,
}: {
  file: FileMeta;
  template?: TemplateMeta;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onStar: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShare: () => void;
  onMove: () => void;
}) {
  const t = useT();
  return (
    <div className={cn("group flex items-center gap-3 rounded-xl border border-panel-border bg-panel px-3 py-2.5", selected && "ring-1 ring-primary")}>
      <button
        onClick={onToggleSelect}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent hover:border-muted-foreground",
        )}
      >
        <Check className="size-3" />
      </button>
      <button onClick={onOpen} className="size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
        {file.thumbnail ? (
          <img src={file.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-0.5" />
        ) : (
          <div className="flex h-full items-center justify-center" style={{ background: `${template?.accent ?? "#0ea5e9"}18` }}>
            <TemplateIcon icon={template?.icon ?? "square"} className="size-5" />
          </div>
        )}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-[13px] font-medium">{file.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
          <span>{file.role === "owner" ? t("You") : file.ownerName}</span>
          <span>·</span>
          <span>{formatRelative(file.updatedAt)}</span>
          {file.folder && <><span>·</span><span className="truncate">{file.folder}</span></>}
        </div>
      </button>
      {file.role !== "owner" && <Badge variant="outline" className="hidden text-[9px] sm:inline-flex">{file.role === "edit" ? t("Can edit") : t("View only")}</Badge>}
      <button onClick={onStar} className={cn("flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary", file.starred && "text-amber-400")}>
        <Star className={cn("size-3.5", file.starred && "fill-current")} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary">
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>{t("Open")}</DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}><Pencil className="size-4" /> {t("Rename")}</DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}><Copy className="size-4" /> {t("Duplicate")}</DropdownMenuItem>
          <DropdownMenuItem onClick={onShare}><Users className="size-4" /> {t("Share")}</DropdownMenuItem>
          <DropdownMenuItem onClick={onMove}><MoveRight className="size-4" /> {t("Move to folder")}</DropdownMenuItem>
          <DropdownMenuItem onClick={onStar}><Star className="size-4" /> {file.starred ? t("Remove star") : t("Star")}</DropdownMenuItem>
          {file.role === "owner" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="size-4" /> {t("Delete")}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TemplatePreview({ file, template }: { file: FileMeta; template?: TemplateMeta }) {
  const t = useT();
  const accent = template?.accent ?? "#0ea5e9";
  return (
    <div className="relative flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(140deg, ${accent}33, ${accent}0d 45%, transparent 75%)` }}>
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,.16) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      <div className="relative flex w-[70%] max-w-[220px] flex-col gap-1.5 rounded-lg border border-white/10 bg-black/10 p-2.5 shadow-lg backdrop-blur-[1px]">
        <div className="flex items-center gap-1">
          <div className="size-1.5 rounded-full" style={{ background: accent }} />
          <div className="h-1 w-10 rounded-full bg-white/30" />
          <div className="ml-auto h-2 w-2 rounded-sm bg-white/20" />
        </div>
        <div className="mt-1 h-8 rounded" style={{ background: `linear-gradient(120deg, ${accent}, ${accent}66)` }} />
        <div className="h-1 w-3/4 rounded bg-white/25" />
        <div className="h-1 w-1/2 rounded bg-white/15" />
        <div className="mt-1 flex gap-1">
          <div className="h-3 flex-1 rounded-sm bg-white/10" />
          <div className="h-3 w-6 rounded-sm" style={{ background: accent }} />
        </div>
      </div>
      <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[9px] font-medium" style={{ color: accent }}>
        <TemplateIcon icon={template?.icon ?? "square"} className="size-2.5" />
        {template ? t(template.name) : t("Design")}
      </div>
    </div>
  );
}

function EmptyState({ nav, search, onCreate, onClear }: { nav: Nav; search: string; onCreate: () => void; onClear: () => void }) {
  const t = useT();
  if (search) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
        <Search className="size-7 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">{t("No designs match")} “{search}”</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{t("Try a different name or clear the search.")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          {t("Clear search")}
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#38bdf8]/20 to-[#0284c7]/5">
        {nav === "starred" ? <Star className="size-6 text-primary" /> : nav === "shared" ? <Users className="size-6 text-primary" /> : <Sparkles className="size-6 text-primary" />}
      </div>
      <div>
        <h3 className="text-sm font-semibold">
          {nav === "starred" ? t("No starred designs yet") : nav === "shared" ? t("Nothing shared with you yet") : t("Your canvas is waiting")}
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          {nav === "starred"
            ? t("Star the designs you want to keep close — they’ll show up here.")
            : nav === "shared"
              ? t("When a teammate invites you to a design, it will appear here.")
              : t("Start from a template or a blank canvas and turn your idea into a clickable prototype.")}
        </p>
      </div>
      {nav !== "shared" && (
        <Button onClick={onCreate}>
          <Plus className="size-4" /> {t("Create your first design")}
        </Button>
      )}
    </div>
  );
}
