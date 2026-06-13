// Package container wires the dependency graph for match-engine.
package container

import (
	"context"
	"fmt"
	"log/slog"

	httpadapter "github.com/jedi-knights/touchline/services/match-engine/internal/adapters/inbound/httpserver"
	"github.com/jedi-knights/touchline/services/match-engine/internal/adapters/outbound/postgres"
	"github.com/jedi-knights/touchline/services/match-engine/internal/application"
	"github.com/jedi-knights/touchline/services/match-engine/internal/config"
)

type Container struct {
	Handler *httpadapter.Handler
	closer  func()
}

func (c *Container) Close() {
	if c.closer != nil {
		c.closer()
	}
}

func New(ctx context.Context, cfg *config.Config, logger *slog.Logger) (*Container, error) {
	pool, err := postgres.Connect(ctx, cfg.Database.URL)
	if err != nil {
		return nil, fmt.Errorf("connect db: %w", err)
	}
	repo := postgres.NewMatchRepository(pool)
	svc := application.NewMatchService(repo)
	handler := httpadapter.NewHandler(svc, logger)
	return &Container{
		Handler: handler,
		closer:  pool.Close,
	}, nil
}
