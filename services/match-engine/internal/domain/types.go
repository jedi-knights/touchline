// Package domain holds the pure, framework-independent types and interfaces
// for match-engine. No imports of net/http, pgx, or the application layer.
// Anything here can be lifted into a different process or transport unchanged.
package domain

import (
	"context"
	"errors"
	"time"
)

// Side identifies which team an event is credited to.
type Side string

const (
	SideHome Side = "home"
	SideAway Side = "away"
)

// ClockControl describes how an event_type affects the match clock.
type ClockControl string

const (
	ClockStart ClockControl = "start"
	ClockStop  ClockControl = "stop"
	ClockNone  ClockControl = "none"
)

// MatchStatus is the lifecycle state of a match.
type MatchStatus string

const (
	StatusSetup    MatchStatus = "setup"
	StatusLive     MatchStatus = "live"
	StatusFinished MatchStatus = "finished"
)

// Match is the engine's view of a match row. Touchline's schema has more
// fields (user_id, sport_id, etc.) but match-engine only needs these.
type Match struct {
	ID               string
	SportID          string
	HomeTeamID       string
	Status           MatchStatus
	CurrentPeriod    int
	HomeScore        int
	AwayScore        int
	StartedAt        *time.Time
	FinishedAt       *time.Time
	SportPeriodCount int // from sports.config.periodCount
}

// EventType mirrors touchline's event_types row to the extent match-engine
// needs to apply state transitions.
type EventType struct {
	ID             string
	SportID        string
	Code           string
	ClockControl   ClockControl
	RequiresPlayer bool
	AffectsScore   int
	IsSubstitution bool
}

// MatchEvent is an immutable event log entry.
type MatchEvent struct {
	EventTypeID       string
	WallTime          time.Time
	MatchClockSeconds int
	PeriodNumber      int
	Side              *Side
	PlayerID          *string
	Metadata          []byte // raw JSON; nil for events with no metadata
}

// PlayerStint is a span of time a player was on the field.
type PlayerStint struct {
	PlayerID      string
	OnAtSeconds   int
	OffAtSeconds  *int
}

// ClockEvent is the minimal projection used by the pure clock derivation.
type ClockEvent struct {
	ClockControl ClockControl
	WallTime     time.Time
}

// Common errors. Translated to HTTP status codes in the inbound adapter.
var (
	ErrNotFound        = errors.New("not found")
	ErrInvalidRequest  = errors.New("invalid request")
	ErrConflict        = errors.New("conflict")
	ErrUnprocessable   = errors.New("unprocessable")
	ErrMatchFinished   = errors.New("match is already finished")
	ErrSportMismatch   = errors.New("event type does not match the sport")
	ErrSetupOnlyStart  = errors.New("start the match before recording other events")
	ErrRequiresPlayer  = errors.New("this event requires a player")
)

// MatchRepository defines persistence for the engine. Implementations live
// in adapters/outbound/{memory,postgres}.
type MatchRepository interface {
	// GetMatch returns just the match row. Returns ErrNotFound if absent.
	GetMatch(ctx context.Context, matchID string) (*Match, error)

	// GetEventType returns the catalog entry. Returns ErrNotFound if absent.
	GetEventType(ctx context.Context, eventTypeID string) (*EventType, error)

	// ListClockEvents returns the chronological clock-control events for a
	// match — used by the pure clock derivation.
	ListClockEvents(ctx context.Context, matchID string) ([]ClockEvent, error)

	// FindSubstitutionEventTypeForSport locates the event_type with
	// is_substitution=true for the given sport. Returns ErrNotFound if
	// the sport has no substitution event configured.
	FindSubstitutionEventTypeForSport(ctx context.Context, sportID string) (*EventType, error)

	// ValidateSubstitution checks that the OFF ids each have an open stint
	// for this match and that the ON ids are active team players without
	// an open stint. Returns ErrConflict / ErrUnprocessable on violations.
	ValidateSubstitution(ctx context.Context, matchID, teamID string, offIDs, onIDs []string) error

	// ListLineupPlayerIDs returns the starting-lineup player ids — used by
	// the first KICKOFF to open initial stints.
	ListLineupPlayerIDs(ctx context.Context, matchID string) ([]string, error)

	// ApplyTransaction performs all the side effects of a recorded event in
	// a single DB transaction. The implementation:
	//
	//   1. inserts the match_event row
	//   2. updates matches.{status,current_period,home_score,away_score,
	//      started_at,finished_at,updated_at}
	//   3. on isFirstStart: inserts player_stints rows for the starting
	//      lineup with on_at_seconds=0
	//   4. on closesFinalPeriod: closes every still-open stint at
	//      matchClockSeconds
	//   5. on substitution: closes the off stints, opens new stints for
	//      the on players
	//
	// The pure logic that decides WHAT to write lives in the application
	// layer; this method is the side-effect boundary.
	ApplyTransaction(ctx context.Context, tx TransactionInput) error
}

// TransactionInput bundles the side effects that ApplyTransaction must apply
// atomically. Built by the application service from the result of
// computeStateTransition.
type TransactionInput struct {
	MatchID         string
	Event           MatchEvent
	UpdatedMatch    *Match
	IsFirstStart    bool
	ClosesMatch     bool
	OpenStintForIDs []string // player ids to open a stint for
	OpenStintAtSecs int      // on_at_seconds for OpenStintForIDs
	CloseStintIDs   []string // player ids whose open stint to close (subs only)
	CloseAllOpen    bool     // when true, close every open stint at OpenStintAtSecs
}
