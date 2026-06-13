package httpserver

import (
	"context"
	"net/http"
	"sync/atomic"
	"time"
)

// Pinger is the smallest surface a readiness probe needs from a backing
// store — does a round-trip succeed within the given context. The pgx pool's
// Ping(ctx) satisfies it; the in-memory adapter satisfies it with a no-op.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Probes owns /health (liveness) and /ready (readiness) and the atomic
// ready-flag that flips during graceful shutdown.
//
// The split follows the k8s convention:
//   - /health stays alive whenever the process is up. It does NOT depend on
//     the DB — a DB outage should not cascade into pod restarts.
//   - /ready answers "can I serve a real request right now": DB pingable
//     AND not draining. This is the endpoint orchestrators (k8s, compose)
//     should gate traffic on.
//
// During shutdown the ready-flag flips to false. Both probes start failing
// (with 503) so the LB drains this instance before srv.Shutdown closes the
// listener and in-flight work is given the drain window to complete.
type Probes struct {
	pinger Pinger
	ready  atomic.Bool

	// pingTimeout bounds the DB ping so a hung pool can't wedge the probe.
	pingTimeout time.Duration
}

func NewProbes(p Pinger) *Probes {
	return &Probes{pinger: p, pingTimeout: 2 * time.Second}
}

// SetReady flips the readiness flag. The shutdown path calls SetReady(false)
// before the drain delay, which causes /ready and /health to start returning
// 503 while in-flight requests finish.
func (p *Probes) SetReady(ready bool) { p.ready.Store(ready) }

// Live is the liveness handler. 200 while the process is alive and not
// draining; 503 once draining begins. Does not consult the pinger — a DB
// outage should not cause pod restarts.
func (p *Probes) Live(w http.ResponseWriter, _ *http.Request) {
	if !p.ready.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "draining"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready is the readiness handler. 200 only when the DB pings successfully
// AND the service is not draining. This is the endpoint to wire into
// docker-compose healthcheck and k8s readinessProbe.
func (p *Probes) Ready(w http.ResponseWriter, r *http.Request) {
	if !p.ready.Load() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "draining"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), p.pingTimeout)
	defer cancel()
	if err := p.pinger.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "db_unreachable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
