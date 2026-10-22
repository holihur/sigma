import type {
  Comment,
  FileMeta,
  FigmaImportResult,
  Member,
  AIChatResponse,
  AIContext,
  AISettings,
  AISkill,
  Notification,
  OIDCConfig,
  OIDCExchange,
  PersonalAccessToken,
  CreatedPersonalAccessToken,
  SigmaDoc,
  TemplateMeta,
  UpdateStatus,
  User,
  VersionMeta,
} from "./types";

const TOKEN_KEY = "sigma.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new CustomEvent("sigma:unauthorized"));
    }
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---------- auth ----------

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } }),
  register: (name: string, email: string, password: string) =>
    api<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { name, email, password },
    }),
  me: () => api<{ user: User }>("/auth/me"),
  updateProfile: (body: { name: string; color: string; avatar: string }) =>
    api<{ user: User }>("/users/me", { method: "PATCH", body }),
  oidcConfig: () => api<OIDCConfig>("/auth/oidc/config"),
  oidcExchange: (code: string) =>
    api<OIDCExchange>("/auth/oidc/exchange", { method: "POST", body: { code } }),
};

// ---------- files ----------

export const filesApi = {
  list: () => api<{ files: FileMeta[] }>("/files"),
  templates: () => api<{ templates: TemplateMeta[] }>("/templates"),
  get: (id: string) => api<{ file: FileMeta; doc: SigmaDoc }>(`/files/${id}`),
  create: (name: string, template: string, folder = "") =>
    api<{ file: FileMeta; doc: SigmaDoc }>("/files", { method: "POST", body: { name, template, folder } }),
  patch: (id: string, patch: { name?: string; thumbnail?: string; starred?: boolean; folder?: string }) =>
    api<{ file: FileMeta }>(`/files/${id}`, { method: "PATCH", body: patch }),
  remove: (id: string) => api<{ ok: true }>(`/files/${id}`, { method: "DELETE" }),
  duplicate: (id: string) =>
    api<{ file: FileMeta }>(`/files/${id}/duplicate`, { method: "POST" }),
  getDoc: (id: string) => api<{ doc: SigmaDoc; version: number }>(`/files/${id}/doc`),
  putDoc: (id: string, doc: SigmaDoc) =>
    api<{ doc: SigmaDoc; version: number }>(`/files/${id}/doc`, { method: "PUT", body: { doc } }),
};

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const token = getToken();
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new ApiError(data.error ?? "Upload failed", res.status);
  return data.url;
}

// ---------- versions ----------

export const versionsApi = {
  list: (fileId: string) => api<{ versions: VersionMeta[] }>(`/files/${fileId}/versions`),
  create: (fileId: string, name: string) =>
    api<{ versions: VersionMeta[] }>(`/files/${fileId}/versions`, { method: "POST", body: { name } }),
  restore: (fileId: string, versionId: string) =>
    api<{ doc: SigmaDoc; version: number }>(`/files/${fileId}/versions/${versionId}/restore`, {
      method: "POST",
    }),
};

// ---------- comments ----------

export const commentsApi = {
  list: (fileId: string) => api<{ comments: Comment[] }>(`/files/${fileId}/comments`),
  create: (fileId: string, body: { pageId: string; nodeId?: string; parentId?: string; x: number; y: number; text: string }) =>
    api<{ comment: Comment }>(`/files/${fileId}/comments`, { method: "POST", body }),
  resolve: (commentId: string, resolved: boolean) =>
    api<{ comments: Comment[] }>(`/comments/${commentId}`, { method: "PATCH", body: { resolved } }),
  remove: (commentId: string) => api<{ ok: true }>(`/comments/${commentId}`, { method: "DELETE" }),
};

// ---------- AI / BYOK ----------

export const aiApi = {
  settings: () => api<AISettings>("/ai/settings"),
  save: (settings: { provider: string; baseUrl: string; model: string; apiKey?: string; clearKey?: boolean }) =>
    api<AISettings>("/ai/settings", { method: "PUT", body: settings }),
  test: () => api<{ ok: boolean; latencyMs: number; model: string; reply: string }>("/ai/test", { method: "POST" }),
  chat: (body: { fileId: string; pageId: string; message: string; sessionId?: string; selection?: string[] }) =>
    api<AIChatResponse>("/ai/chat", { method: "POST", body }),
  context: () => api<AIContext>("/ai/context"),
  saveContext: (body: { designMd: string; agentsMd: string }) =>
    api<{ ok: boolean }>("/ai/context", { method: "PUT", body }),
  skills: () => api<{ skills: AISkill[] }>("/ai/skills"),
  uploadSkill: (body: { filename: string; content: string }) =>
    api<{ skill: AISkill }>("/ai/skills", { method: "POST", body }),
  deleteSkill: (id: string) => api<{ ok: boolean }>(`/ai/skills/${id}`, { method: "DELETE" }),
};

// ---------- personal access tokens / MCP ----------

export const tokensApi = {
  list: () => api<{ tokens: PersonalAccessToken[] }>("/tokens"),
  create: (body: { name: string; scopes: string[]; expiresInDays: number }) =>
    api<CreatedPersonalAccessToken>("/tokens", { method: "POST", body }),
  remove: (id: string) => api<{ ok: true }>(`/tokens/${id}`, { method: "DELETE" }),
};

// ---------- Figma import / export ----------

export const figmaApi = {
  import: (body: { url: string; token: string; name?: string }) =>
    api<FigmaImportResult>("/figma/import", { method: "POST", body }),
  importJSON: async (data: string, name: string): Promise<FigmaImportResult> => {
    const token = getToken();
    const res = await fetch(`/api/figma/import-json?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: data,
    });
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text };
    }
    if (!res.ok) {
      if (res.status === 401 && token) {
        setToken(null);
        window.dispatchEvent(new CustomEvent("sigma:unauthorized"));
      }
      throw new ApiError((payload as { error?: string } | null)?.error ?? "Import failed", res.status);
    }
    return payload as FigmaImportResult;
  },
  exportJSON: async (id: string): Promise<{ text: string; filename: string }> => {
    const token = getToken();
    const res = await fetch(`/api/files/${id}/figma-json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError("Export failed", res.status);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    return { text: await res.text(), filename: match?.[1] ?? "sigma-design.sigma.json" };
  },
};

// ---------- system update ----------

export const systemApi = {
  updateStatus: () => api<UpdateStatus>("/system/update"),
  checkUpdate: () => api<UpdateStatus>("/system/update/check", { method: "POST" }),
  applyUpdate: () => api<{ ok: boolean; version: string; restarting: boolean }>("/system/update/apply", { method: "POST" }),
};

// ---------- public links & notifications ----------

export const publicApi = {
  link: (fileId: string) =>
    api<{ token: string; enabled: boolean }>(`/files/${fileId}/public-link`),
  set: (fileId: string, enabled: boolean) =>
    api<{ token: string; enabled: boolean }>(`/files/${fileId}/public-link`, { method: "POST", body: { enabled } }),
  get: (token: string) => api<{ file: FileMeta; doc: SigmaDoc }>(`/public/${token}`),
};

export const notificationsApi = {
  list: () => api<{ notifications: Notification[]; unread: number }>("/notifications"),
  read: () => api<{ ok: true }>("/notifications/read", { method: "POST" }),
};

// ---------- members ----------

export const membersApi = {
  list: (fileId: string) =>
    api<{ members: Member[]; owner: string; ownerId: string; role: string }>(`/files/${fileId}/members`),
  add: (fileId: string, email: string, role: string) =>
    api<{ members: Member[] }>(`/files/${fileId}/members`, { method: "POST", body: { email, role } }),
  remove: (fileId: string, userId: string) =>
    api<{ members: Member[] }>(`/files/${fileId}/members/${userId}`, { method: "DELETE" }),
};

export function wsUrl(fileId: string, clientId: string): string {
  const token = getToken() ?? "";
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const params = new URLSearchParams({ fileId, token, clientId });
  return `${proto}://${location.host}/api/ws?${params.toString()}`;
}
