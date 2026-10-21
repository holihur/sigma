import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { filesApi, getToken, wsUrl } from "@/lib/api";
import { diffDocs } from "@/lib/delta";
import { mergeDocs } from "@/lib/merge";
import type { Comment, Point, PresenceUser, SigmaDoc } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useAuth } from "@/store/auth";
import { uid } from "@/lib/utils";

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
      const st = useEditor.getState();
      sendRaw({
        type: "presence",
        cursor: lastCursor.current ?? undefined,
        selection: selection ?? st.selection,
      });
    },
    [sendRaw],
  );

  const sendDoc = useCallback(async () => {
    const st = useEditor.getState();
    if (!st.file || st.isReadOnly || !st.dirty) return;
    const fileId = st.file.id;
    const snapshot = st.doc;
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
        const res = await filesApi.putDoc(fileId, snapshot);
        baseDocRef.current = res.doc;
        useEditor.getState().applyRemoteDoc(res.doc, res.version);
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
          const latest = await filesApi.getDoc(fileId);
          baseDocRef.current = latest.doc;
          useEditor.getState().applyRemoteDoc(latest.doc, latest.version);
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
          baseDocRef.current = msg.doc;
          useEditor.getState().applyRemoteDoc(msg.doc, msg.version);
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
      void fetch(`/api/files/${st.file.id}/doc`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ doc: st.doc }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return { sendDoc, sendPresence, connected: !!wsRef.current, clientId: clientId.current };
}
