let dashboardPromise: Promise<unknown> | null = null;
let editorPromise: Promise<unknown> | null = null;

function connectionAllowsPrefetch() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return c.effectiveType !== "slow-2g" && c.effectiveType !== "2g";
}

/** Warm the next route during idle time without blocking the current screen. */
export function prefetchDashboard() {
  if (dashboardPromise || !connectionAllowsPrefetch()) return;
  dashboardPromise = import("@/pages/Dashboard");
}

export function prefetchEditor() {
  if (editorPromise || !connectionAllowsPrefetch()) return;
  editorPromise = import("@/pages/Editor");
}

export function whenIdle(fn: () => void, timeout = 2500) {
  if (typeof window === "undefined") return () => undefined;
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) {
    const id = ric(fn, { timeout });
    return () => {
      const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cancel?.(id);
    };
  }
  const id = window.setTimeout(fn, Math.min(timeout, 1200));
  return () => window.clearTimeout(id);
}
