import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { apiRoot, filesApi, getToken, wsUrl } from "@/lib/api";
import { diffDocs } from "@/lib/delta";
import { mergeDocs } from "@/lib/merge";
import type { Comment, Point, PresenceUser, SigmaDoc } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useAuth } from "@/store/auth";
import { uid } from "@/lib/utils";

function loadedDoc(doc: SigmaDoc, loaded: Set<string>): SigmaDoc {
  return { ...doc, pages: doc.pages.filter((p) => loaded.has(p.id)) };
}

interface WsMessage {
  type: "welcome" | "presence" | "doc" | "doc-delta" | "comment" | "error";
  users?: PresenceUser[];
  doc?: SigmaDoc;
  delta?: SigmaDoc;
  comment?: Comment;
  version?: number;
  message?: string;
}

/**
 * WebSocket collaboration: presence + debounced incremental document sync with
 * an HTTP fallback. Only changed pages/nodes are sent after the initial load.
 */
export function useCollaboration(fileId: string | null, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const clientId = useRef(uid("client"));
  const lastCursor = useRef<Point | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const baseDocRef = useRef<SigmaDoc | null>(null);
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPresenceSent = useRef(0);

  const sendRaw = useCallback((payload: unknown): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendPresence = useCallback(
    (cursor?: Point, selection?: string[]) => {
      if (cursor) lastCursor.current = cursor;
      const emit = (nextSelection?: string[]) => {
        lastPresenceSent.current = Date.now();
        const st = useEditor.getState();
        sendRaw({
          type: "presence",
          cursor: lastCursor.current ?? undefined,
          selection: nextSelection ?? st.selection,
        });
      };
      // Selection changes are rare and should feel instant. Cursor updates are
      // frequent, so coalesce them to ~16/s instead of one frame per mousemove.
      const immediate = selection !== undefined;
      if (immediate || Date.now() - lastPresenceSent.current >= 60) {
        if (presenceTimer.current) {
          clearTimeout(presenceTimer.current);
          presenceTimer.current = null;
        }
        emit(selection);
        return;
      }
      if (!presenceTimer.current) {
        presenceTimer.current = setTimeout(() => {
          presenceTimer.current = null;
          emit();
        }, 60);
      }
    },
    [sendRaw],
  );

  useEffect(() => () => {
    if (presenceTimer.current) clearTimeout(presenceTimer.current);
  }, []);

  const sendDoc = useCallback(async () => {
    const st = useEditor.getState();
    if (!st.file || st.isReadOnly || !st.dirty) return;
    const fileId = st.file.id;
    const snapshot = loadedDoc(st.doc, st.loadedPages);
    const base = baseDocRef.current;
    const delta = base ? diffDocs(base, snapshot) : null;
    if (base && !delta) {
      baseDocRef.current = snapshot;
      useEditor.getState().confirmSync(st.version);
      return;
    }

    st.beginSync();
    const syncSeq = useEditor.getState().syncSeq;
    const persisted = async () => {
      try {
        const res = await filesApi.putPartialDoc(fileId, snapshot);
        baseDocRef.current = mergeDocs(baseDocRef.current, res.doc);
        useEditor.getState().applyRemoteDelta(res.doc, res.version);
      } catch {
        useEditor.getState().failSync();
      }
    };

    const payload = delta ? { type: "delta", delta } : { type: "doc", doc: snapshot };
    const sent = sendRaw(payload);
    if (sent) {
      baseDocRef.current = snapshot;
      // If the server never acknowledges (e.g. a dropped socket message),
      // persist over HTTP as a safety net.
      setTimeout(() => {
        const now = useEditor.getState();
        if (now.saving && now.syncSeq === syncSeq && now.file?.id === fileId) {
          void persisted();
        }
      }, 6000);
      return;
    }
    await persisted();
  }, [sendRaw]);

  // Establish and maintain the socket.
  useEffect(() => {
    if (!fileId || !enabled) return;
    stopped.current = false;
    baseDocRef.current = null;

    const connect = () => {
      if (stopped.current) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(fileId, clientId.current));
      } catch {
        reconnectTimer.current = setTimeout(connect, 2000);
        return;
      }
      wsRef.current = ws;

      ws.onopen = async () => {
        useEditor.setState({ syncStatus: useEditor.getState().dirty ? "saving" : "saved" });
        // Catch up on anything that changed while we were offline before
        // broadcasting local edits back to the room.
        try {
          const before = useEditor.getState();
          const latest = await filesApi.getPages(fileId, [...before.loadedPages]);
          useEditor.getState().applyRemoteDelta(latest.doc, latest.version);
          const current = useEditor.getState();
          baseDocRef.current = loadedDoc(before.dirty ? before.doc : current.doc, current.loadedPages);
        } catch {
          /* the socket may still be usable even if the catch-up fetch failed */
        }
        sendPresence();
        if (useEditor.getState().dirty) void sendDoc();
      };

      ws.onmessage = (event) => {
        let msg: WsMessage;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.type === "welcome" || msg.type === "presence") {
          useEditor.getState().setCollaborators(msg.users ?? []);
        } else if (msg.type === "doc" && msg.doc && typeof msg.version === "number") {
          useEditor.getState().applyRemoteDoc(msg.doc, msg.version);
          baseDocRef.current = loadedDoc(msg.doc, useEditor.getState().loadedPages);
        } else if (msg.type === "doc-delta" && msg.delta && typeof msg.version === "number") {
          if (baseDocRef.current) baseDocRef.current = mergeDocs(baseDocRef.current, msg.delta);
          useEditor.getState().applyRemoteDelta(msg.delta, msg.version);
        } else if (msg.type === "comment" && msg.comment) {
          const author = msg.comment.authorId === useAuth.getState().user?.id;
          useEditor.getState().appendComment(msg.comment);
          if (!author) {
            toast.message("New comment", {
              description: `${msg.comment.author}: ${msg.comment.text}`,
            });
          }
        } else if (msg.type === "error") {
          useEditor.getState().failSync();
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (stopped.current) return;
        useEditor.getState().failSync();
        reconnectTimer.current = setTimeout(connect, 1800);
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      stopped.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      baseDocRef.current = null;
      useEditor.getState().setCollaborators([]);
    };
  }, [fileId, enabled, sendDoc, sendPresence]);

  // Broadcast selection changes.
  const selection = useEditor((s) => s.selection);
  useEffect(() => {
    if (!enabled) return;
    sendPresence(undefined, selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, enabled]);

  // Debounced autosave whenever local edits happen.
  const dirty = useEditor((s) => s.dirty);
  const changeSeq = useEditor((s) => s.changeSeq);
  const isReadOnly = useEditor((s) => s.isReadOnly);
  useEffect(() => {
    if (!dirty || !enabled || isReadOnly) return;
    const timer = setTimeout(() => {
      void sendDoc();
    }, 650);
    return () => clearTimeout(timer);
  }, [dirty, changeSeq, enabled, isReadOnly, sendDoc]);

  // Best-effort flush when the page is closed.
  useEffect(() => {
    const onUnload = () => {
      const st = useEditor.getState();
      if (!st.dirty || !st.file || st.isReadOnly) return;
      const token = getToken();
      const snapshot = loadedDoc(st.doc, st.loadedPages);
      const body = JSON.stringify({ doc: snapshot });
      // sendBeacon is the most reliable unload transport for same-origin
      // deployments and does not require CORS preflight. Fall back to a
      // keepalive request when the API lives on another origin.
      if (apiRoot().startsWith("/") && typeof navigator.sendBeacon === "function") {
        const query = token ? `?token=${encodeURIComponent(token)}` : "";
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(`${apiRoot()}/files/${st.file.id}/partial-doc${query}`, blob)) return;
      }
      void fetch(`${apiRoot()}/files/${st.file.id}/partial-doc`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return { sendDoc, sendPresence, connected: !!wsRef.current, clientId: clientId.current };
}
