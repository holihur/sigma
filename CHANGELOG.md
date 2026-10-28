# Changelog

All notable changes to Sigma are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Enforce `SIGMA_SECRET` (refuse default in production) — fixes #1
- JWT 30d→24h + jti — fixes #2
- CORS whitelist (`APP_ALLOWED_ORIGINS` / `APP_BASE_URL`) — fixes #3
- WebSocket `CheckOrigin` strict — fixes #4
- Rate-limit 5/min for auth/figma — fixes #5
- Password 10+ chars — fixes #6
- HKDF for AES-GCM key — fixes #8
- Doc size limits + WS ReadLimit 2MB — fixes #9 #10 #11
- OIDC `email_verified` — fixes #14
- Security headers CSP/HSTS — fixes #18
- Downgrade protection in updater — fixes #25
- `docker-compose` requires `SIGMA_SECRET` — fixes #27
- SQLite concurrency 1→4 + WAL — fixes #31 #46

### Performance
- Large pages now mount only visible/nearby canvas nodes; selected, hovered and editing branches stay mounted

### Fixed
- Chinese locale now lazy-loads as a separate chunk before first paint — fixes #64
- Vector editing: correct compound-point deletion, tiny-path bounds, edge smooth handles, closest-point insertion, asymmetric handle mirroring, pen zoom/touch deadzone, user stroke/fill presets and grouped pen-cancel undo — fixes #103 #104 #105 #106 #107 #108 #109 #111 #112 #113
- Vector rendering/engine: scale path viewBox to node bounds and clear Paper.js project residue — fixes #110 #114
- Font picker remains a bounded 8-family list; documented the non-virtualized constraint — fixes #61
- Prototype hotspot hover now shows target and transition preview — fixes #65
- Thumbnails are now stored as files with lazy authenticated URLs; legacy inline data URLs migrate on first read — fixes #63
- Undo history now keeps 120 steps and groups sustained nudges without merging across other edits — fixes #62
- Public prototype links now serve dynamic title/description/OGP/Twitter metadata and a public thumbnail image — fixes #55
- Comment placement now snaps to nearby layer edges with visible guides — fixes #57
- Text editing now shares the rendered line-height/font metrics and auto-grows inside the same vertical-alignment container — fixes #58
- Dashboard empty state now guides new users through template, canvas and sharing steps — fixes #49
- Notification read state now rolls back and resurfaces an error if the API call fails — fixes #54
- Mobile editor fit now measures the actual toolbar position and safe-area offset instead of a fixed 120px bottom pad — fixes #51
- Safer design deletion: show last edit/collaborator/comment counts and require typing the design name — fixes #50
- WCAG AA contrast for primary text, primary buttons, selection handles/labels and focus rings in light/dark themes — fixes #47
- `pruneTombstones` GC 30d (was no-op) — fixes #32
- `gzip` pool reuse — fixes #37
- WebSocket broadcast copy-then-unlock — fixes #38
- Added `LICENSE` (MIT) — fixes #100

## [0.99.1] — 2026-10-28
- Baseline from audit `AUDIT_TOP100.md` (100 issues filed #1-#100)

## [0.99.0] — prior
- See git log `e5cdd8e..35d9f44`
