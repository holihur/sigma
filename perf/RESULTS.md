# Page element load test — 2026-10-27

Environment: local Sigma on `:9000`, k6 v0.54.0, 1.6 GB RAM.
Test: HTML shell + entry JS/CSS/favicon + authenticated dashboard API shell.

## 10 VUs (35 s, 399 page loads)

| Metric | Value |
| --- | --- |
| page load p95 | **151 ms** |
| page load p99 | **221 ms** |
| page load max | 276 ms |
| checks | 100% |
| failures | 0 |
| iterations | 11.35/s |

## 20 VUs capacity run (35 s, 269 page loads)

| Metric | Value |
| --- | --- |
| page load p95 | **327 ms** |
| page load p99 | **439 ms** |
| page load max | 615 ms |
| page load average | 152 ms |
| page loads | 7.62/s |
| HTTP requests | 45.76/s |
| checks | 100% |
| HTTP failures | 0% |

## Memory

| Load | Server RSS peak | k6 RSS peak | Available RAM min | Swap peak |
| --- | ---: | ---: | ---: | ---: |
| 10 VUs | 31.8 MB | 51.4 MB | 563 MB | 1.40 GB |
| 20 VUs | 34.2 MB | 58.2 MB | 404 MB | 1.43 GB |

Server memory grows ~2.4 MB from 10 → 20 VUs, no leak signal. The host is swap-heavy; do not exceed 20 VUs without adding RAM.

## Important finding

Static page elements stay far below the 2 s target even at 20 VUs.

The full iteration (including `/api/files/{id}` returning the complete document) reaches **p95 = 3.28 s** at 20 VUs. The bottleneck is now the full design document API, not the JS/CSS shell. Page-level document loading is the next optimization.
