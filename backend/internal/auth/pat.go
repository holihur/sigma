package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
)

const PATPrefix = "sigma_pat_"

const (
	ScopeMCPRead  = "mcp:read"
	ScopeMCPWrite = "mcp:write"
)

// NewPAT returns the one-time raw token, its stable hash for storage and a
// short display prefix. The raw token is never persisted.
func NewPAT() (raw, hash, prefix string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", "", err
	}
	raw = PATPrefix + base64.RawURLEncoding.EncodeToString(b)
	hash = HashPAT(raw)
	prefix = raw
	if len(prefix) > len(PATPrefix)+8 {
		prefix = prefix[:len(PATPrefix)+8] + "…"
	}
	return raw, hash, prefix, nil
}

func HashPAT(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

func ParseScopes(s string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, v := range strings.Fields(s) {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func ScopeString(scopes []string) string {
	return strings.Join(ParseScopes(strings.Join(scopes, " ")), " ")
}

func ValidScopes(scopes []string) bool {
	if len(scopes) == 0 {
		return false
	}
	for _, s := range scopes {
		if s != ScopeMCPRead && s != ScopeMCPWrite {
			return false
		}
	}
	return true
}

func HasScope(scopes []string, want string) bool {
	for _, s := range scopes {
		if s == want {
			return true
		}
	}
	return false
}
