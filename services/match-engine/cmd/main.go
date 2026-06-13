// Package main is the entry point for match-engine, the Go service that
// owns touchline's match state machine. It is a thin shell around the
// container — wiring lives in internal/container.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jedi-knights/touchline/services/match-engine/internal/adapters/inbound/httpserver"
	"github.com/jedi-knights/touchline/services/match-engine/internal/config"
	"github.com/jedi-knights/touchline/services/match-engine/internal/container"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel(),
	}))

	c, err := container.New(context.Background(), cfg, logger)
	if err != nil {
		return fmt.Errorf("wiring container: %w", err)
	}
	defer c.Close()

	handler := httpserver.NewRouter(c.Handler, c.Probes, logger)
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Mark ready as soon as the container is wired — pool.Ping was already
	// verified in container.New, so /ready will answer 200 immediately.
	c.Probes.SetReady(true)

	// Run the listener in a goroutine so the main thread can wait for signals.
	errCh := make(chan error, 1)
	go func() {
		logger.Info("starting match-engine", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	// Block on SIGINT / SIGTERM (Docker compose `down`) or a listener error.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	case sig := <-sigCh:
		logger.Info("shutting down", "signal", sig.String())
	}

	// Two-phase shutdown: flip the readiness flag first so the LB stops
	// sending new requests, sleep the drain window so in-flight requests
	// finish, then close the listener.
	c.Probes.SetReady(false)
	logger.Info("draining", "duration", drainDuration.String())
	time.Sleep(drainDuration)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	return nil
}

// drainDuration is the gap between SIGTERM and srv.Shutdown. It must exceed
// the worst-case LB poll interval (k8s default ~10s, compose healthcheck
// interval is 5s) plus the longest realistic handler. 5s is enough for
// compose; raise via env if running behind a slower LB.
const drainDuration = 5 * time.Second
