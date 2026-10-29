package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sigma/internal/doc"
)

func TestValidateDocRejectsOutOfRangeVectorPoints(t *testing.T) {
	bad := doc.Doc{Pages: []doc.Page{{
		ID: "p1",
		Nodes: map[string]json.RawMessage{
			"v1": json.RawMessage(`{"id":"v1","type":"vector","x":0,"y":0,"width":10,"height":10,"points":[{"x":2,"y":0.5}],"ts":1}`),
		},
	}}}
	if err := validateDocLimits(&bad); err == nil || !strings.Contains(err.Error(), "vector point") {
		t.Fatalf("expected out-of-range point error, got %v", err)
	}

	good := doc.Doc{Pages: []doc.Page{{
		ID: "p1",
		Nodes: map[string]json.RawMessage{
			"v1": json.RawMessage(`{"id":"v1","type":"vector","x":0,"y":0,"width":10,"height":10,"points":[{"x":1,"y":0.5,"in":{"x":0.5,"y":0},"out":{"x":0.5,"y":1}}],"ts":1}`),
		},
	}}}
	if err := validateDocLimits(&good); err != nil {
		t.Fatalf("valid vector rejected: %v", err)
	}
}

func TestCreateCommentRejectsNonFiniteOrDistantCoordinates(t *testing.T) {
	a, fileID := newPageTestAPI(t)
	u, _ := a.st.UserByID("u_pages")

	req := httptest.NewRequest(http.MethodPost, "/api/files/"+fileID+"/comments", strings.NewReader(
		`{"pageId":"p1","x":1e9,"y":0,"text":"hello"}`,
	))
	req.SetPathValue("id", fileID)
	rec := httptest.NewRecorder()
	a.handleCreateComment(rec, req, u)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for distant comment, got %d: %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/files/"+fileID+"/comments", strings.NewReader(
		`{"pageId":"p1","x":120,"y":80,"text":"hello"}`,
	))
	req.SetPathValue("id", fileID)
	rec = httptest.NewRecorder()
	a.handleCreateComment(rec, req, u)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid comment, got %d: %s", rec.Code, rec.Body.String())
	}
}
