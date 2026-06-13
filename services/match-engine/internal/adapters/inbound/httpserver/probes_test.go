package httpserver_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jedi-knights/touchline/services/match-engine/internal/adapters/inbound/httpserver"
)

type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func newProbeRouter(t *testing.T, p httpserver.Pinger) (http.Handler, *httpserver.Probes) {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	probes := httpserver.NewProbes(p)
	probes.SetReady(true)
	router := httpserver.NewRouter(httpserver.NewHandler(nil, logger), probes, logger)
	return router, probes
}

func get(t *testing.T, h http.Handler, path string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

// /health is a pure liveness probe — process is alive and serving.
// It must not depend on downstream state. Cascading a DB outage into pod
// restarts is worse than a degraded service.
func TestHealth_AliveEvenWhenPingFails(t *testing.T) {
	router, _ := newProbeRouter(t, fakePinger{err: errors.New("db down")})
	if got := get(t, router, "/health"); got != http.StatusOK {
		t.Errorf("GET /health: got %d, want %d", got, http.StatusOK)
	}
}

// /health returns 503 only while draining, so the LB can pull this instance
// out of rotation before srv.Shutdown actually closes the listener.
func TestHealth_503WhenDraining(t *testing.T) {
	router, probes := newProbeRouter(t, fakePinger{err: nil})
	probes.SetReady(false)
	if got := get(t, router, "/health"); got != http.StatusServiceUnavailable {
		t.Errorf("GET /health while draining: got %d, want %d", got, http.StatusServiceUnavailable)
	}
}

// /ready is the contract docker-compose `depends_on: service_healthy` should
// use: it returns 200 only when the DB is reachable AND we are not draining.
func TestReady_200WhenPingOK(t *testing.T) {
	router, _ := newProbeRouter(t, fakePinger{err: nil})
	if got := get(t, router, "/ready"); got != http.StatusOK {
		t.Errorf("GET /ready: got %d, want %d", got, http.StatusOK)
	}
}

func TestReady_503WhenPingFails(t *testing.T) {
	router, _ := newProbeRouter(t, fakePinger{err: errors.New("db down")})
	if got := get(t, router, "/ready"); got != http.StatusServiceUnavailable {
		t.Errorf("GET /ready: got %d, want %d", got, http.StatusServiceUnavailable)
	}
}

func TestReady_503WhenDraining(t *testing.T) {
	router, probes := newProbeRouter(t, fakePinger{err: nil})
	probes.SetReady(false)
	if got := get(t, router, "/ready"); got != http.StatusServiceUnavailable {
		t.Errorf("GET /ready while draining: got %d, want %d", got, http.StatusServiceUnavailable)
	}
}
