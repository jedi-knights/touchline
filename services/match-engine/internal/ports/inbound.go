// Package ports declares the inbound port interfaces that adapters depend on.
package ports

import (
	"context"

	"github.com/jedi-knights/touchline/services/match-engine/internal/application"
	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
)

// MatchEngine is the inbound port implemented by application.MatchService.
type MatchEngine interface {
	RecordEvent(ctx context.Context, in application.RecordEventInput) (*domain.Match, error)
	RecordSubstitution(ctx context.Context, in application.RecordSubstitutionInput) (*domain.Match, error)
}
