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

	handler := httpserver.NewRouter(c.Handler, logger)
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

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

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	return nil
}
