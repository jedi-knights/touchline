// Package httpserver wraps the inbound port in a small REST surface.
//
// Routes:
//
//   POST  /matches/{match_id}/events
//   POST  /matches/{match_id}/substitutions
//   GET   /health   (liveness — process up, not draining)
//   GET   /ready    (readiness — DB pingable, not draining)
//
// Errors are mapped from the domain sentinel values to HTTP status codes.
// Probes are implemented separately in probes.go so the readiness path
// can fail independently of the engine.
package httpserver

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jedi-knights/touchline/services/match-engine/internal/application"
	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
	"github.com/jedi-knights/touchline/services/match-engine/internal/ports"
)

// Handler holds the inbound port + logger.
type Handler struct {
	engine ports.MatchEngine
	logger *slog.Logger
}

func NewHandler(engine ports.MatchEngine, logger *slog.Logger) *Handler {
	return &Handler{engine: engine, logger: logger}
}

// NewRouter wires the handler + probes onto a stdlib mux. Method+path
// syntax requires Go 1.22+.
func NewRouter(h *Handler, probes *Probes, _ *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /matches/{match_id}/events", h.RecordEvent)
	mux.HandleFunc("POST /matches/{match_id}/substitutions", h.RecordSubstitution)
	mux.HandleFunc("GET /health", probes.Live)
	mux.HandleFunc("GET /ready", probes.Ready)
	return mux
}

// Body shapes — JSON tags pinned for the HTTP API contract.

type recordEventBody struct {
	EventTypeID string  `json:"event_type_id"`
	Side        *string `json:"side"`
	PlayerID    *string `json:"player_id"`
}

type recordSubstitutionBody struct {
	OffPlayerIDs []string `json:"off_player_ids"`
	OnPlayerIDs  []string `json:"on_player_ids"`
}

type matchResponse struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	CurrentPeriod int    `json:"current_period"`
	HomeScore     int    `json:"home_score"`
	AwayScore     int    `json:"away_score"`
	StartedAt     string `json:"started_at,omitempty"`
	FinishedAt    string `json:"finished_at,omitempty"`
}

type errorResponse struct {
	Error string `json:"error"`
}

// --- handlers ---

func (h *Handler) RecordEvent(w http.ResponseWriter, r *http.Request) {
	matchID := r.PathValue("match_id")
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "match_id is required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body recordEventBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	in := application.RecordEventInput{
		MatchID:     matchID,
		EventTypeID: body.EventTypeID,
		PlayerID:    body.PlayerID,
	}
	if body.Side != nil {
		s := domain.Side(*body.Side)
		if s != domain.SideHome && s != domain.SideAway {
			writeError(w, http.StatusBadRequest, "side must be 'home' or 'away'")
			return
		}
		in.Side = &s
	}

	match, err := h.engine.RecordEvent(r.Context(), in)
	if err != nil {
		h.writeDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMatchResponse(match))
}

func (h *Handler) RecordSubstitution(w http.ResponseWriter, r *http.Request) {
	matchID := r.PathValue("match_id")
	if matchID == "" {
		writeError(w, http.StatusBadRequest, "match_id is required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body recordSubstitutionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	match, err := h.engine.RecordSubstitution(r.Context(), application.RecordSubstitutionInput{
		MatchID:      matchID,
		OffPlayerIDs: body.OffPlayerIDs,
		OnPlayerIDs:  body.OnPlayerIDs,
	})
	if err != nil {
		h.writeDomainError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMatchResponse(match))
}

// --- helpers ---

func (h *Handler) writeDomainError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, domain.ErrInvalidRequest),
		errors.Is(err, domain.ErrRequiresPlayer),
		errors.Is(err, domain.ErrSetupOnlyStart),
		errors.Is(err, domain.ErrSportMismatch):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, domain.ErrConflict):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, domain.ErrUnprocessable):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, domain.ErrMatchFinished):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	default:
		h.logger.Error("unhandled engine error", "error", err.Error())
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func toMatchResponse(m *domain.Match) matchResponse {
	resp := matchResponse{
		ID:            m.ID,
		Status:        string(m.Status),
		CurrentPeriod: m.CurrentPeriod,
		HomeScore:     m.HomeScore,
		AwayScore:     m.AwayScore,
	}
	if m.StartedAt != nil {
		resp.StartedAt = m.StartedAt.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	if m.FinishedAt != nil {
		resp.FinishedAt = m.FinishedAt.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	return resp
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}
