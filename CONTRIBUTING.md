# Contributing to Sigma

Thanks for helping make Sigma better!

## Development

**Requirements**: Go 1.27+, Node 26+, pnpm 12+

```bash
mise install          # installs Go, Node, pnpm per mise.toml
cd frontend && pnpm install
cd ../backend && go test ./...   # vet + test (no build needed for audit)
make build            # full build (needs memory)
```

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `fix(security): enforce SIGMA_SECRET`
- `feat(canvas): virtualize layer tree`
- `docs(deploy): add backup instructions`

CI runs `go vet`, `go test`, `pnpm build` — keep `AUDIT_TOP100.md` updated.

### Pull Requests

1. Fork, branch off `main` (`fix/s01-secret`)
2. Reference issue `#1` in PR body
3. Add test if applicable (`doc_test.go`, `api_test.go`)
4. Update `CHANGELOG.md` under `[Unreleased]`

### Security

Report vulnerabilities privately to `security@sigma.design` — do not file public issue.

### Code of Conduct

Be respectful, inclusive. Enforced per Contributor Covenant.
