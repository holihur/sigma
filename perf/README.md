# Sigma k6 page load test

```bash
BASE_URL=http://localhost:9000 /tmp/k6pkg/k6-v0.54.0-linux-amd64/k6 run perf/k6-page-load.js
```

Measures the HTML shell + its CSS/JS assets and the authenticated dashboard API shell.

Thresholds:

- page load p95 < 2 s
- page load p99 < 3 s
- failures < 1%

This is an HTTP-level test. Use Playwright/Lighthouse when DOM execution and LCP are required.
