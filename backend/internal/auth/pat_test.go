package auth

import "testing"

func TestPATGenerationAndScopes(t *testing.T) {
	raw, hash, prefix, err := NewPAT()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) < 40 || hash == "" || prefix == "" {
		t.Fatalf("bad pat: %q %q %q", raw, hash, prefix)
	}
	if raw == hash || hash != HashPAT(raw) {
		t.Fatal("hash mismatch")
	}
	if !ValidScopes([]string{ScopeMCPRead, ScopeMCPWrite}) {
		t.Fatal("valid scopes rejected")
	}
	if ValidScopes([]string{"admin"}) {
		t.Fatal("invalid scope accepted")
	}
	if !HasScope(ParseScopes("mcp:read  mcp:write mcp:read"), ScopeMCPWrite) {
		t.Fatal("scope parse failed")
	}
}
