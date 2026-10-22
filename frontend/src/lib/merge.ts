import type { Page, SceneNode, SigmaDoc } from "./types";

function cloneDoc(doc: SigmaDoc): SigmaDoc {
  return structuredClone(doc);
}

function pageById(doc: SigmaDoc, id: string): Page | undefined {
  return doc.pages.find((p) => p.id === id);
}

/**
 * Client-side mirror of the server merge: per-node last-writer-wins using
 * node.ts plus tombstones. Keeps concurrent edits to different layers intact.
 */
export function mergeDocs(base: SigmaDoc | null, incoming: SigmaDoc | null): SigmaDoc {
  if (!base) return incoming ? cloneDoc(incoming) : { pages: [], tombstones: {}, deletedPages: {} };
  if (!incoming) return cloneDoc(base);

  const out = cloneDoc(base);
  if (incoming.styles) out.styles = structuredClone(incoming.styles);
  out.tombstones = { ...(out.tombstones ?? {}) };
  out.deletedPages = { ...(out.deletedPages ?? {}) };
  for (const [id, ts] of Object.entries(incoming.tombstones ?? {})) {
    if (ts > (out.tombstones[id] ?? 0)) out.tombstones[id] = ts;
  }
  for (const [id, ts] of Object.entries(incoming.deletedPages ?? {})) {
    if (ts > (out.deletedPages[id] ?? 0)) out.deletedPages[id] = ts;
  }

  const index = new Map(out.pages.map((p, i) => [p.id, i]));
  for (const ip of incoming.pages) {
    const at = index.get(ip.id);
    if (at === undefined) {
      out.pages.push(cloneDoc({ pages: [ip] }).pages[0]);
      index.set(ip.id, out.pages.length - 1);
      continue;
    }
    const bp = out.pages[at];
    if ((ip.ts ?? 0) > (bp.ts ?? 0)) {
      bp.name = ip.name;
      bp.ts = ip.ts;
      bp.rootIds = [...ip.rootIds];
    }
    for (const [id, node] of Object.entries(ip.nodes)) {
      const existing = bp.nodes[id];
      if (!existing) {
        bp.nodes[id] = structuredClone(node);
        continue;
      }
      if ((node.ts ?? 0) >= (existing.ts ?? 0)) {
        bp.nodes[id] = structuredClone(node);
      }
    }
  }

  out.pages = out.pages.filter((page) => {
    const dead = out.deletedPages?.[page.id];
    return dead === undefined || dead < (page.ts ?? 0);
  });

  for (const page of out.pages) {
    for (const [id, node] of Object.entries(page.nodes)) {
      const dead = out.tombstones?.[id];
      if (dead !== undefined && dead >= (node.ts ?? 0)) {
        delete page.nodes[id];
      }
    }

    const seen = new Set<string>();
    const roots: string[] = [];
    for (const id of page.rootIds) {
      if (seen.has(id) || !page.nodes[id]) continue;
      seen.add(id);
      roots.push(id);
    }
    const orphans = Object.entries(page.nodes)
      .filter(([id, node]) => !seen.has(id) && node.parentId == null)
      .sort((a, b) => (a[1].ts ?? 0) - (b[1].ts ?? 0) || a[0].localeCompare(b[0]));
    for (const [id] of orphans) roots.push(id);
    page.rootIds = roots;

    for (const node of Object.values(page.nodes) as SceneNode[]) {
      if (node.children?.length) {
        node.children = node.children.filter((kid) => page.nodes[kid]);
      }
    }
  }

  return out;
}

export function collectSubtree(page: Page, rootIds: string[]): { roots: string[]; nodes: Record<string, SceneNode> } {
  const nodes: Record<string, SceneNode> = {};
  const walk = (id: string) => {
    const node = page.nodes[id];
    if (!node) return;
    nodes[id] = structuredClone(node);
    for (const kid of node.children) walk(kid);
  };
  for (const id of rootIds) walk(id);
  return { roots: [...rootIds], nodes };
}

/** Inserts a copied subtree with fresh ids. */
export function instantiateSubtree(
  page: Page,
  clipboard: { roots: string[]; nodes: Record<string, SceneNode> },
  idFactory: () => string,
): { roots: string[]; nodes: Record<string, SceneNode> } {
  const mapping = new Map<string, string>();
  for (const id of Object.keys(clipboard.nodes)) mapping.set(id, idFactory());
  const nodes: Record<string, SceneNode> = {};
  const now = Date.now();
  for (const [oldId, original] of Object.entries(clipboard.nodes)) {
    const node: SceneNode = structuredClone(original);
    node.id = mapping.get(oldId)!;
    node.ts = now;
    node.children = node.children.map((kid) => mapping.get(kid) ?? kid).filter(Boolean);
    node.parentId = original.parentId ? mapping.get(original.parentId) ?? null : null;
    nodes[node.id] = node;
  }
  void page;
  return { roots: clipboard.roots.map((id) => mapping.get(id)!).filter(Boolean), nodes };
}
