// Package application contains the match-engine state machine.
//
// MatchService.RecordEvent and MatchService.RecordSubstitution are the only
// state-changing operations the engine exposes. Each one:
//
//  1. validates the inbound request against the domain rules
//  2. loads the minimum amount of state needed to compute the transition
//  3. derives the new state (clock seconds, period, status, score, stints)
//      using pure functions
//  4. hands a single TransactionInput to the repository to apply atomically
//
// All side effects are confined to step 4. The functions in steps 1–3 are
// pure and can be unit-tested without a database.
package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
)

// MatchService implements the inbound port.
type MatchService struct {
	repo domain.MatchRepository
	now  func() time.Time
}

// NewMatchService constructs the service.
func NewMatchService(repo domain.MatchRepository) *MatchService {
	return &MatchService{repo: repo, now: time.Now}
}

// RecordEventInput is the inbound shape for POST /matches/{id}/events.
type RecordEventInput struct {
	MatchID     string
	EventTypeID string
	Side        *domain.Side // nil for clock-control events
	PlayerID    *string      // required when EventType.RequiresPlayer
}

// RecordEvent applies a single match event and returns the updated match.
//
// Mirrors touchline's recordEventAction in src/server/actions/events.ts: on
// the first clock-start event it transitions setup→live and opens stints for
// the starting lineup; on the stop that closes the final period it sets
// status=finished, finished_at, and closes every still-open stint.
func (s *MatchService) RecordEvent(ctx context.Context, in RecordEventInput) (*domain.Match, error) {
	if in.MatchID == "" || in.EventTypeID == "" {
		return nil, fmt.Errorf("%w: match_id and event_type_id are required", domain.ErrInvalidRequest)
	}

	match, err := s.repo.GetMatch(ctx, in.MatchID)
	if err != nil {
		return nil, err
	}
	if match.Status == domain.StatusFinished {
		return nil, domain.ErrMatchFinished
	}

	eventType, err := s.repo.GetEventType(ctx, in.EventTypeID)
	if err != nil {
		return nil, err
	}
	if eventType.SportID != match.SportID {
		return nil, domain.ErrSportMismatch
	}
	if match.Status == domain.StatusSetup && eventType.ClockControl != domain.ClockStart {
		return nil, domain.ErrSetupOnlyStart
	}
	if eventType.RequiresPlayer && (in.PlayerID == nil || *in.PlayerID == "") {
		return nil, domain.ErrRequiresPlayer
	}

	priorClock, err := s.repo.ListClockEvents(ctx, in.MatchID)
	if err != nil {
		return nil, err
	}

	now := s.now()
	matchClockSeconds := ElapsedSeconds(priorClock, now)
	priorStarts := CountStarts(priorClock)
	priorStops := CountStops(priorClock)

	periodNumber := priorStarts
	if eventType.ClockControl == domain.ClockStart {
		periodNumber = priorStarts + 1
	}
	if periodNumber < 1 {
		periodNumber = 1
	}

	homeDelta, awayDelta := ScoreDelta(eventType.Code, eventType.AffectsScore, in.Side)

	startsAfter := priorStarts
	stopsAfter := priorStops
	switch eventType.ClockControl {
	case domain.ClockStart:
		startsAfter++
	case domain.ClockStop:
		stopsAfter++
	}

	isFirstStart := eventType.ClockControl == domain.ClockStart &&
		match.Status == domain.StatusSetup &&
		priorStarts == 0
	closesFinalPeriod := eventType.ClockControl == domain.ClockStop &&
		stopsAfter == startsAfter &&
		stopsAfter >= match.SportPeriodCount

	updated := *match
	updated.HomeScore += homeDelta
	updated.AwayScore += awayDelta
	if eventType.ClockControl == domain.ClockStart {
		updated.Status = domain.StatusLive
		updated.CurrentPeriod = startsAfter
		if isFirstStart {
			n := now
			updated.StartedAt = &n
		}
	}
	if closesFinalPeriod {
		updated.Status = domain.StatusFinished
		n := now
		updated.FinishedAt = &n
	}

	tx := domain.TransactionInput{
		MatchID: in.MatchID,
		Event: domain.MatchEvent{
			EventTypeID:       in.EventTypeID,
			WallTime:          now,
			MatchClockSeconds: matchClockSeconds,
			PeriodNumber:      periodNumber,
			Side:              in.Side,
			PlayerID:          in.PlayerID,
		},
		UpdatedMatch: &updated,
		IsFirstStart: isFirstStart,
		ClosesMatch:  closesFinalPeriod,
		// For the first start we open stints for the lineup; the lineup ids
		// are fetched lazily inside ApplyTransaction so the application
		// layer doesn't need a second adapter call.
		OpenStintAtSecs: 0, // first-start stints always open at second 0
		CloseAllOpen:    closesFinalPeriod,
	}
	if closesFinalPeriod {
		tx.OpenStintAtSecs = matchClockSeconds
	}

	if isFirstStart {
		lineupIDs, err := s.repo.ListLineupPlayerIDs(ctx, in.MatchID)
		if err != nil {
			return nil, err
		}
		tx.OpenStintForIDs = lineupIDs
	}

	if err := s.repo.ApplyTransaction(ctx, tx); err != nil {
		return nil, err
	}
	return &updated, nil
}

// RecordSubstitutionInput is the inbound shape for POST /matches/{id}/substitutions.
type RecordSubstitutionInput struct {
	MatchID      string
	OffPlayerIDs []string
	OnPlayerIDs  []string
}

// RecordSubstitution closes the outgoing players' stints and opens new ones
// for the incoming players in a single transaction, alongside the substitution
// event row.
//
// Mirrors touchline's recordSubstitutionAction: same equal-count guard, same
// "no overlap" check, same single-transaction guarantee.
func (s *MatchService) RecordSubstitution(ctx context.Context, in RecordSubstitutionInput) (*domain.Match, error) {
	if err := validateSubInput(in); err != nil {
		return nil, err
	}

	match, err := s.repo.GetMatch(ctx, in.MatchID)
	if err != nil {
		return nil, err
	}
	if match.Status != domain.StatusLive {
		return nil, fmt.Errorf("%w: substitutions only during a live match", domain.ErrInvalidRequest)
	}

	subEventType, err := s.repo.FindSubstitutionEventTypeForSport(ctx, match.SportID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("%w: no substitution event type configured for sport", domain.ErrInvalidRequest)
		}
		return nil, err
	}

	if err := s.repo.ValidateSubstitution(ctx, in.MatchID, match.HomeTeamID, in.OffPlayerIDs, in.OnPlayerIDs); err != nil {
		return nil, err
	}

	priorClock, err := s.repo.ListClockEvents(ctx, in.MatchID)
	if err != nil {
		return nil, err
	}
	now := s.now()
	matchClockSeconds := ElapsedSeconds(priorClock, now)
	periodNumber := CountStarts(priorClock)
	if periodNumber < 1 {
		periodNumber = 1
	}

	metadataBytes, err := json.Marshal(map[string][]string{
		"off": in.OffPlayerIDs,
		"on":  in.OnPlayerIDs,
	})
	if err != nil {
		return nil, fmt.Errorf("encoding sub metadata: %w", err)
	}

	homeSide := domain.SideHome
	updated := *match
	tx := domain.TransactionInput{
		MatchID: in.MatchID,
		Event: domain.MatchEvent{
			EventTypeID:       subEventType.ID,
			WallTime:          now,
			MatchClockSeconds: matchClockSeconds,
			PeriodNumber:      periodNumber,
			Side:              &homeSide,
			Metadata:          metadataBytes,
		},
		UpdatedMatch:    &updated,
		CloseStintIDs:   in.OffPlayerIDs,
		OpenStintForIDs: in.OnPlayerIDs,
		OpenStintAtSecs: matchClockSeconds,
	}

	if err := s.repo.ApplyTransaction(ctx, tx); err != nil {
		return nil, err
	}
	return &updated, nil
}

func validateSubInput(in RecordSubstitutionInput) error {
	if in.MatchID == "" {
		return fmt.Errorf("%w: match_id is required", domain.ErrInvalidRequest)
	}
	if len(in.OffPlayerIDs) == 0 || len(in.OnPlayerIDs) == 0 {
		return fmt.Errorf("%w: pick at least one OFF and one ON player", domain.ErrInvalidRequest)
	}
	if len(in.OffPlayerIDs) != len(in.OnPlayerIDs) {
		return fmt.Errorf("%w: pick the same number of players coming off and coming on", domain.ErrInvalidRequest)
	}
	if hasDup(in.OffPlayerIDs) || hasDup(in.OnPlayerIDs) {
		return fmt.Errorf("%w: duplicate player ids in OFF or ON list", domain.ErrInvalidRequest)
	}
	off := make(map[string]struct{}, len(in.OffPlayerIDs))
	for _, id := range in.OffPlayerIDs {
		off[id] = struct{}{}
	}
	for _, id := range in.OnPlayerIDs {
		if _, overlap := off[id]; overlap {
			return fmt.Errorf("%w: a player cannot be in both lists", domain.ErrInvalidRequest)
		}
	}
	return nil
}

func hasDup(ids []string) bool {
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			return true
		}
		seen[id] = struct{}{}
	}
	return false
}
