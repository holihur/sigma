# Contributing to Sigma

Thanks for helping make Sigma better!

## Development

**Requirements**: Go 1.27+, Node 26+, pnpm 12+, MongoDB 7+

```bash
mise install          # installs Go, Node, pnpm per mise.toml
cd frontend && pnpm install
cd ../backend && go test ./...   # requires MONGO_URI (default mongodb://127.0.0.1:27017)
make build            # full build (needs memory)

# Browser critical-path smoke test
cd frontend
pnpm exec playwright install chromium   # one-time browser install
pnpm test:e2e
```

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `fix(security): enforce SIGMA_SECRET`
- `feat(canvas): virtualize layer tree`
- `docs(deploy): add backup instructions`

CI runs `go vet`, `go test`, `pnpm build`, and the Playwright critical-path smoke test. Keep `AUDIT_TOP100.md` updated.

### Pull Requests

1. Fork, branch off `main` (`fix/s01-secret`)
2. Reference issue `#1` in PR body
3. Add test if applicable (`doc_test.go`, `api_test.go`)
4. Update `CHANGELOG.md` under `[Unreleased]`

### Security

Report vulnerabilities privately to `security@sigma.design` — do not file public issue.

### Code of Conduct

Be respectful, inclusive. Enforced per Contributor Covenant.
