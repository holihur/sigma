import type { SceneNode, SigmaDoc } from "./types";

/**
 * Computes a partial document containing only pages/nodes that changed since
 * `base`. Removed nodes are expressed as tombstones; removed pages use
 * deletedPages. The result can be sent over the wire and merged with the same
 * LWW rules as a full document.
 */
export function diffDocs(base: SigmaDoc | null, next: SigmaDoc): SigmaDoc | null {
  if (!base) return next;
  const now = Date.now();
  const pages: SigmaDoc["pages"] = [];
  const tombstones: Record<string, number> = {};
  const topTombstones = next.tombstones ?? {};
  const baseTombstones = base.tombstones ?? {};
  const basePages = new Map(base.pages.map((p) => [p.id, p]));
  const nextPageIds = new Set(next.pages.map((p) => p.id));

  for (const page of next.pages) {
    const previous = basePages.get(page.id);
    if (!previous) {
      pages.push(structuredClone(page));
      continue;
    }
    const upserts: Record<string, SceneNode> = {};
    for (const [id, node] of Object.entries(page.nodes)) {
      const old = previous.nodes[id];
      if (!old || old.ts !== node.ts) {
        upserts[id] = node;
      }
    }
    for (const [id, old] of Object.entries(previous.nodes)) {
      if (page.nodes[id]) continue;
      // Use the deleted node's own timestamp so a stale delete can never
      // outlive a newer node that happens to reuse the same id.
      tombstones[id] = Math.max(topTombstones[id] ?? 0, baseTombstones[id] ?? 0, old.ts || now);
    }
    const orderChanged = previous.rootIds.join("|") !== page.rootIds.join("|");
    const metaChanged = orderChanged || previous.name !== page.name || previous.ts !== page.ts;
    if (Object.keys(upserts).length > 0 || metaChanged) {
      pages.push({
        id: page.id,
        name: page.name,
        ts: page.ts,
        rootIds: [...page.rootIds],
        nodes: upserts,
      });
    }
  }

  const deletedPages: Record<string, number> = {};
  for (const page of base.pages) {
    if (nextPageIds.has(page.id)) continue;
    deletedPages[page.id] = Math.max(next.deletedPages?.[page.id] ?? 0, now);
  }

  const stylesChanged = JSON.stringify(base.styles ?? { colors: [], texts: [] }) !== JSON.stringify(next.styles ?? { colors: [], texts: [] });
  if (pages.length === 0 && Object.keys(tombstones).length === 0 && Object.keys(deletedPages).length === 0 && !stylesChanged) {
    return null;
  }
  return { pages, tombstones, deletedPages, styles: stylesChanged ? next.styles : undefined };
}
