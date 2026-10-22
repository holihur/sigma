package api

import (
	"net/http"
	"time"

	"sigma/internal/model"
	"sigma/internal/update"
)

func (a *API) SetUpdater(u *update.Manager) { a.updater = u }

func (a *API) handleUpdateStatus(w http.ResponseWriter, r *http.Request, _ model.User) {
	if a.updater == nil {
		writeJSON(w, http.StatusOK, update.Status{CurrentVersion: "dev", AutoUpdate: false})
		return
	}
	writeJSON(w, http.StatusOK, a.updater.Status())
}

func (a *API) handleUpdateCheck(w http.ResponseWriter, r *http.Request, _ model.User) {
	if a.updater == nil {
		writeError(w, http.StatusServiceUnavailable, "Auto-update is not available in this build")
		return
	}
	st, err := a.updater.Check(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error(), "status": st})
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (a *API) handleUpdateApply(w http.ResponseWriter, r *http.Request, _ model.User) {
	if a.updater == nil {
		writeError(w, http.StatusServiceUnavailable, "Auto-update is not available in this build")
		return
	}
	st := a.updater.Status()
	if !st.UpdateAvailable {
		writeError(w, http.StatusBadRequest, "No update available")
		return
	}
	if err := a.updater.Apply(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "version": st.LatestVersion, "restarting": true})
	// Let the response flush before replacing the process image.
	go func() {
		time.Sleep(700 * time.Millisecond)
		_ = update.Restart()
	}()
}
