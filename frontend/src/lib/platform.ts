export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

export function keyLabel(key: string): string {
  if (isMac) return key;
  return key
    .replace(/⌘/g, "Ctrl")
    .replace(/⌥/g, "Alt")
    .replace(/⇧/g, "Shift")
    .replace(/⌫/g, "Backspace");
}

export function shortcutLabel(keys: string[]): string {
  return keys.map(keyLabel).join(isMac ? "" : "+");
}
