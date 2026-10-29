import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const indexFile = path.join(dist, "index.html");
const html = await readFile(indexFile, "utf8");

const tags = [...html.matchAll(/<(script|link)\b[^>]*?(?:src|href)="(\/assets\/[^"]+)"[^>]*>/g)];
let out = html;
for (const tag of tags) {
  const [full, , asset] = tag;
  if (/\bintegrity=/.test(full)) continue;
  const file = path.join(dist, asset.replace(/^\//, ""));
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    continue;
  }
  const digest = createHash("sha384").update(bytes).digest("base64");
  const withIntegrity = full
    .replace(/\s*\/?>$/, "")
    .replace(/\s+crossorigin(?:="[^"]*")?/, "")
    + ` integrity="sha384-${digest}" crossorigin="anonymous">`;
  out = out.replace(full, withIntegrity);
}
await writeFile(indexFile, out);
console.log(`SRI: ${tags.length} asset tag(s) checked`);
