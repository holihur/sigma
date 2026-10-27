import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:9000";
const MAX_VUS = Number(__ENV.MAX_VUS || 10);
const pageLoad = new Trend("page_load_duration", true);
const pageOk = new Rate("page_load_ok");

export const options = {
  scenarios: {
    page_load: {
      executor: "ramping-vus",
      startVUs: 2,
      stages: [
        { duration: "5s", target: Math.min(5, MAX_VUS) },
        { duration: "10s", target: MAX_VUS },
        { duration: "15s", target: MAX_VUS },
        { duration: "5s", target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    page_load_duration: ["p(95)<2000", "p(99)<3000"],
    page_load_ok: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup() {
  const login = http.post(
    `${BASE}/api/auth/login`,
    JSON.stringify({ email: __ENV.EMAIL || "demo@sigma.design", password: __ENV.PASSWORD || "demo1234" }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(login, { "login ok": (r) => r.status === 200 });
  let token = "";
  try { token = login.json("token") || ""; } catch (_) {}
  return { token };
}

function shellAssets(body) {
  const urls = new Set();
  for (const match of body.matchAll(/(?:src|href)="(\/(?:assets|brand)\/[^"]+)"/g)) {
    urls.add(`${BASE}${match[1]}`);
  }
  return [...urls];
}

export default function (data) {
  group("page elements", () => {
    const started = Date.now();
    const shell = http.get(`${BASE}/`, { tags: { element: "html" } });
    const body = shell.body || "";
    const assets = shellAssets(body);
    const responses = assets.length
      ? http.batch(assets.map((url) => ({ method: "GET", url, tags: { element: "asset" } })))
      : [];
    const elapsed = Date.now() - started;
    pageLoad.add(elapsed);
    const ok = shell.status === 200 && responses.every((r) => r.status >= 200 && r.status < 400);
    pageOk.add(ok);
    check(shell, { "index 200": (r) => r.status === 200 });
    check(/id="root"/.test(body), { "root element": (ok) => ok });
    check(/type="module"/.test(body), { "module entry": (ok) => ok });
    check(responses.filter((r) => r.status >= 400).length, { "all assets < 400": (n) => n === 0 });
  });

  if (data.token) {
    group("api shell", () => {
      const headers = { headers: { Authorization: `Bearer ${data.token}` } };
      const files = http.get(`${BASE}/api/files`, { ...headers, tags: { element: "api" } });
      http.get(`${BASE}/api/templates`, { ...headers, tags: { element: "api" } });
      const list = files.json("files") || [];
      if (list.length) {
        http.get(`${BASE}/api/files/${list[0].id}`, { ...headers, tags: { element: "api" } });
      }
    });
  }
  sleep(0.2);
}
