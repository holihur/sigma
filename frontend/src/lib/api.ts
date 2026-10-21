import type {
  Comment,
  FileMeta,
  Member,
  Notification,
  SigmaDoc,
  TemplateMeta,
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
};

// ---------- files ----------

export const filesApi = {
  list: () => api<{ files: FileMeta[] }>("/files"),
  templates: () => api<{ templates: TemplateMeta[] }>("/templates"),
  get: (id: string) => api<{ file: FileMeta; doc: SigmaDoc }>(`/files/${id}`),
  create: (name: string, template: string) =>
    api<{ file: FileMeta; doc: SigmaDoc }>("/files", { method: "POST", body: { name, template } }),
  patch: (id: string, patch: { name?: string; thumbnail?: string; starred?: boolean }) =>
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
  create: (fileId: string, body: { pageId: string; nodeId?: string; x: number; y: number; text: string }) =>
    api<{ comment: Comment }>(`/files/${fileId}/comments`, { method: "POST", body }),
  resolve: (commentId: string, resolved: boolean) =>
    api<{ comments: Comment[] }>(`/comments/${commentId}`, { method: "PATCH", body: { resolved } }),
  remove: (commentId: string) => api<{ ok: true }>(`/comments/${commentId}`, { method: "DELETE" }),
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
