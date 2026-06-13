// Package memory provides an in-memory MatchRepository for tests. It mirrors
// the shape of the postgres adapter precisely enough that unit tests against
// the application service exercise the same state machine the production
// stack runs.
package memory

import (
	"context"
	"sync"
	"time"

	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
)

var _ domain.MatchRepository = (*MatchRepository)(nil)

// MatchRepository is an in-memory store.
type MatchRepository struct {
	mu                  sync.RWMutex
	matches             map[string]*domain.Match
	eventTypes          map[string]*domain.EventType
	clockEvents         map[string][]domain.ClockEvent
	stints              map[string][]*domain.PlayerStint     // keyed by match_id
	lineup              map[string][]string                  // keyed by match_id
	teamActivePlayers   map[string]map[string]struct{}       // keyed by team_id
	subEventTypeBySport map[string]*domain.EventType
	insertedEvents      map[string][]domain.MatchEvent
}

func NewMatchRepository() *MatchRepository {
	return &MatchRepository{
		matches:             make(map[string]*domain.Match),
		eventTypes:          make(map[string]*domain.EventType),
		clockEvents:         make(map[string][]domain.ClockEvent),
		stints:              make(map[string][]*domain.PlayerStint),
		lineup:              make(map[string][]string),
		teamActivePlayers:   make(map[string]map[string]struct{}),
		subEventTypeBySport: make(map[string]*domain.EventType),
		insertedEvents:      make(map[string][]domain.MatchEvent),
	}
}

// --- seed helpers (test-only) ---

func (r *MatchRepository) SeedMatch(m *domain.Match) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *m
	r.matches[m.ID] = &cp
}

func (r *MatchRepository) SeedEventType(e *domain.EventType) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *e
	r.eventTypes[e.ID] = &cp
	if e.IsSubstitution {
		r.subEventTypeBySport[e.SportID] = &cp
	}
}

func (r *MatchRepository) SeedLineup(matchID string, playerIDs []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lineup[matchID] = append([]string(nil), playerIDs...)
}

func (r *MatchRepository) SeedTeamPlayers(teamID string, playerIDs []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	set := make(map[string]struct{}, len(playerIDs))
	for _, id := range playerIDs {
		set[id] = struct{}{}
	}
	r.teamActivePlayers[teamID] = set
}

// --- inspection helpers (test-only) ---

func (r *MatchRepository) InsertedEvents(matchID string) []domain.MatchEvent {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := append([]domain.MatchEvent(nil), r.insertedEvents[matchID]...)
	return out
}

func (r *MatchRepository) Stints(matchID string) []*domain.PlayerStint {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*domain.PlayerStint, 0, len(r.stints[matchID]))
	for _, s := range r.stints[matchID] {
		cp := *s
		out = append(out, &cp)
	}
	return out
}

// --- MatchRepository interface ---

func (r *MatchRepository) GetMatch(_ context.Context, matchID string) (*domain.Match, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.matches[matchID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *m
	return &cp, nil
}

func (r *MatchRepository) GetEventType(_ context.Context, id string) (*domain.EventType, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.eventTypes[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *e
	return &cp, nil
}

func (r *MatchRepository) ListClockEvents(_ context.Context, matchID string) ([]domain.ClockEvent, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := append([]domain.ClockEvent(nil), r.clockEvents[matchID]...)
	return out, nil
}

func (r *MatchRepository) FindSubstitutionEventTypeForSport(_ context.Context, sportID string) (*domain.EventType, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.subEventTypeBySport[sportID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	cp := *e
	return &cp, nil
}

func (r *MatchRepository) ValidateSubstitution(_ context.Context, matchID, teamID string, offIDs, onIDs []string) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	open := openStintMap(r.stints[matchID])
	for _, id := range offIDs {
		if _, ok := open[id]; !ok {
			return domain.ErrUnprocessable
		}
	}
	active, ok := r.teamActivePlayers[teamID]
	if !ok {
		return domain.ErrUnprocessable
	}
	for _, id := range onIDs {
		if _, ok := active[id]; !ok {
			return domain.ErrUnprocessable
		}
		if _, alreadyOn := open[id]; alreadyOn {
			return domain.ErrUnprocessable
		}
	}
	return nil
}

func (r *MatchRepository) ListLineupPlayerIDs(_ context.Context, matchID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return append([]string(nil), r.lineup[matchID]...), nil
}

func (r *MatchRepository) ApplyTransaction(_ context.Context, tx domain.TransactionInput) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// 1. insert match_event
	r.insertedEvents[tx.MatchID] = append(r.insertedEvents[tx.MatchID], tx.Event)

	// 2. mirror the event into the clock-control log so subsequent calls
	// see it (the postgres adapter does this automatically via a SELECT).
	if etID := tx.Event.EventTypeID; etID != "" {
		if et, ok := r.eventTypes[etID]; ok && et.ClockControl != domain.ClockNone {
			r.clockEvents[tx.MatchID] = append(r.clockEvents[tx.MatchID], domain.ClockEvent{
				ClockControl: et.ClockControl,
				WallTime:     tx.Event.WallTime,
			})
		}
	}

	// 3. update match
	if tx.UpdatedMatch != nil {
		cp := *tx.UpdatedMatch
		r.matches[tx.MatchID] = &cp
	}

	// 4. open stints for the first-start lineup OR for incoming sub players
	for _, pid := range tx.OpenStintForIDs {
		r.stints[tx.MatchID] = append(r.stints[tx.MatchID], &domain.PlayerStint{
			PlayerID:    pid,
			OnAtSeconds: tx.OpenStintAtSecs,
		})
	}

	// 5. close out-going sub players' stints
	if len(tx.CloseStintIDs) > 0 {
		closeSet := make(map[string]struct{}, len(tx.CloseStintIDs))
		for _, id := range tx.CloseStintIDs {
			closeSet[id] = struct{}{}
		}
		off := tx.OpenStintAtSecs
		for _, s := range r.stints[tx.MatchID] {
			if s.OffAtSeconds != nil {
				continue
			}
			if _, ok := closeSet[s.PlayerID]; ok {
				v := off
				s.OffAtSeconds = &v
			}
		}
	}

	// 6. on final stop, close everything still open
	if tx.CloseAllOpen {
		off := tx.OpenStintAtSecs
		for _, s := range r.stints[tx.MatchID] {
			if s.OffAtSeconds == nil {
				v := off
				s.OffAtSeconds = &v
			}
		}
	}
	return nil
}

func openStintMap(stints []*domain.PlayerStint) map[string]struct{} {
	out := make(map[string]struct{})
	for _, s := range stints {
		if s.OffAtSeconds == nil {
			out[s.PlayerID] = struct{}{}
		}
	}
	return out
}

// _ silences the unused-import warning when this file is compiled without
// using time directly; postgres adapter mirrors this shape.
var _ = time.Time{}
