// Package postgres provides a Postgres-backed MatchRepository that reads
// and writes touchline's existing schema (matches, match_events, player_stints,
// match_lineup_players, event_types, sports, players, teams).
//
// No migrations live here — touchline still owns the schema via Drizzle.
// match-engine is a consumer of those tables, not the source of truth.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
)

var _ domain.MatchRepository = (*MatchRepository)(nil)

// MatchRepository is the production adapter.
type MatchRepository struct {
	pool *pgxpool.Pool
}

func NewMatchRepository(pool *pgxpool.Pool) *MatchRepository {
	return &MatchRepository{pool: pool}
}

// Connect opens a pgx pool and verifies reachability.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("opening pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging: %w", err)
	}
	return pool, nil
}

// GetMatch loads the match plus the sport's periodCount in one query.
func (r *MatchRepository) GetMatch(ctx context.Context, matchID string) (*domain.Match, error) {
	const q = `
		SELECT m.id, m.sport_id, m.home_team_id, m.status, m.current_period,
		       m.home_score, m.away_score, m.started_at, m.finished_at,
		       COALESCE((s.config->>'periodCount')::int, 2) AS period_count
		FROM matches m
		JOIN sports s ON s.id = m.sport_id
		WHERE m.id = $1
	`
	var m domain.Match
	var status string
	err := r.pool.QueryRow(ctx, q, matchID).Scan(
		&m.ID, &m.SportID, &m.HomeTeamID, &status, &m.CurrentPeriod,
		&m.HomeScore, &m.AwayScore, &m.StartedAt, &m.FinishedAt, &m.SportPeriodCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get match: %w", err)
	}
	m.Status = domain.MatchStatus(status)
	return &m, nil
}

func (r *MatchRepository) GetEventType(ctx context.Context, id string) (*domain.EventType, error) {
	const q = `
		SELECT id, sport_id, code, clock_control, requires_player, affects_score, is_substitution
		FROM event_types WHERE id = $1
	`
	var e domain.EventType
	var cc string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&e.ID, &e.SportID, &e.Code, &cc, &e.RequiresPlayer, &e.AffectsScore, &e.IsSubstitution,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get event_type: %w", err)
	}
	e.ClockControl = domain.ClockControl(cc)
	return &e, nil
}

func (r *MatchRepository) ListClockEvents(ctx context.Context, matchID string) ([]domain.ClockEvent, error) {
	const q = `
		SELECT et.clock_control, me.wall_time
		FROM match_events me
		JOIN event_types et ON et.id = me.event_type_id
		WHERE me.match_id = $1 AND et.clock_control IN ('start', 'stop')
		ORDER BY me.wall_time ASC
	`
	rows, err := r.pool.Query(ctx, q, matchID)
	if err != nil {
		return nil, fmt.Errorf("list clock events: %w", err)
	}
	defer rows.Close()
	out := []domain.ClockEvent{}
	for rows.Next() {
		var cc string
		var ev domain.ClockEvent
		if err := rows.Scan(&cc, &ev.WallTime); err != nil {
			return nil, fmt.Errorf("scan clock event: %w", err)
		}
		ev.ClockControl = domain.ClockControl(cc)
		out = append(out, ev)
	}
	return out, rows.Err()
}

func (r *MatchRepository) FindSubstitutionEventTypeForSport(ctx context.Context, sportID string) (*domain.EventType, error) {
	const q = `
		SELECT id, sport_id, code, clock_control, requires_player, affects_score, is_substitution
		FROM event_types WHERE sport_id = $1 AND is_substitution = true LIMIT 1
	`
	var e domain.EventType
	var cc string
	err := r.pool.QueryRow(ctx, q, sportID).Scan(
		&e.ID, &e.SportID, &e.Code, &cc, &e.RequiresPlayer, &e.AffectsScore, &e.IsSubstitution,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find sub event_type: %w", err)
	}
	e.ClockControl = domain.ClockControl(cc)
	return &e, nil
}

func (r *MatchRepository) ValidateSubstitution(ctx context.Context, matchID, teamID string, offIDs, onIDs []string) error {
	// Check OFF: every id has an open stint for this match.
	const offQ = `
		SELECT count(*) FROM player_stints
		WHERE match_id = $1 AND off_at_seconds IS NULL AND player_id = ANY($2)
	`
	var openOff int
	if err := r.pool.QueryRow(ctx, offQ, matchID, offIDs).Scan(&openOff); err != nil {
		return fmt.Errorf("validate off: %w", err)
	}
	if openOff != len(offIDs) {
		return domain.ErrUnprocessable
	}

	// Check ON (a): every id is on the home team and active.
	const onActiveQ = `
		SELECT count(*) FROM players
		WHERE team_id = $1 AND active = true AND id = ANY($2)
	`
	var activeOn int
	if err := r.pool.QueryRow(ctx, onActiveQ, teamID, onIDs).Scan(&activeOn); err != nil {
		return fmt.Errorf("validate on (active): %w", err)
	}
	if activeOn != len(onIDs) {
		return domain.ErrUnprocessable
	}

	// Check ON (b): no id is already on the field.
	const onAlreadyQ = `
		SELECT count(*) FROM player_stints
		WHERE match_id = $1 AND off_at_seconds IS NULL AND player_id = ANY($2)
	`
	var existingOpen int
	if err := r.pool.QueryRow(ctx, onAlreadyQ, matchID, onIDs).Scan(&existingOpen); err != nil {
		return fmt.Errorf("validate on (already open): %w", err)
	}
	if existingOpen > 0 {
		return domain.ErrUnprocessable
	}
	return nil
}

func (r *MatchRepository) ListLineupPlayerIDs(ctx context.Context, matchID string) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT player_id FROM match_lineup_players WHERE match_id = $1`, matchID)
	if err != nil {
		return nil, fmt.Errorf("list lineup: %w", err)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan lineup: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ApplyTransaction performs every side effect for an event in one DB tx.
// Mirrors recordEventAction in touchline's src/server/actions/events.ts.
func (r *MatchRepository) ApplyTransaction(ctx context.Context, tx domain.TransactionInput) error {
	dbTx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer dbTx.Rollback(ctx) //nolint:errcheck // benign — Commit makes Rollback a no-op

	// 1. insert match_event
	var metadata any
	if len(tx.Event.Metadata) > 0 {
		metadata = json.RawMessage(tx.Event.Metadata)
	}
	var sideArg any
	if tx.Event.Side != nil {
		sideArg = string(*tx.Event.Side)
	}
	const insertEventQ = `
		INSERT INTO match_events (
		  id, match_id, event_type_id, wall_time, match_clock_seconds,
		  period_number, side, player_id, metadata
		) VALUES (
		  gen_random_uuid()::text,
		  $1, $2, $3, $4, $5, $6, $7, $8
		)
	`
	if _, err := dbTx.Exec(ctx, insertEventQ,
		tx.MatchID, tx.Event.EventTypeID, tx.Event.WallTime, tx.Event.MatchClockSeconds,
		tx.Event.PeriodNumber, sideArg, tx.Event.PlayerID, metadata,
	); err != nil {
		return fmt.Errorf("insert match_event: %w", err)
	}

	// 2. update matches
	if tx.UpdatedMatch != nil {
		const updateMatchQ = `
			UPDATE matches SET
			  status = $2, current_period = $3,
			  home_score = $4, away_score = $5,
			  started_at = COALESCE($6, started_at),
			  finished_at = COALESCE($7, finished_at),
			  updated_at = now()
			WHERE id = $1
		`
		if _, err := dbTx.Exec(ctx, updateMatchQ,
			tx.MatchID,
			string(tx.UpdatedMatch.Status),
			tx.UpdatedMatch.CurrentPeriod,
			tx.UpdatedMatch.HomeScore,
			tx.UpdatedMatch.AwayScore,
			tx.UpdatedMatch.StartedAt,
			tx.UpdatedMatch.FinishedAt,
		); err != nil {
			return fmt.Errorf("update match: %w", err)
		}
	}

	// 3. open stints (first start or sub-in)
	if len(tx.OpenStintForIDs) > 0 {
		const insertStintQ = `
			INSERT INTO player_stints (id, match_id, player_id, on_at_seconds)
			VALUES (gen_random_uuid()::text, $1, $2, $3)
		`
		for _, pid := range tx.OpenStintForIDs {
			if _, err := dbTx.Exec(ctx, insertStintQ, tx.MatchID, pid, tx.OpenStintAtSecs); err != nil {
				return fmt.Errorf("open stint for %s: %w", pid, err)
			}
		}
	}

	// 4. close sub-out stints
	if len(tx.CloseStintIDs) > 0 {
		const closeStintQ = `
			UPDATE player_stints SET off_at_seconds = $3
			WHERE match_id = $1 AND off_at_seconds IS NULL AND player_id = ANY($2)
		`
		if _, err := dbTx.Exec(ctx, closeStintQ, tx.MatchID, tx.CloseStintIDs, tx.OpenStintAtSecs); err != nil {
			return fmt.Errorf("close stints: %w", err)
		}
	}

	// 5. close every still-open stint on match-end
	if tx.CloseAllOpen {
		const closeAllQ = `
			UPDATE player_stints SET off_at_seconds = $2
			WHERE match_id = $1 AND off_at_seconds IS NULL
		`
		if _, err := dbTx.Exec(ctx, closeAllQ, tx.MatchID, tx.OpenStintAtSecs); err != nil {
			return fmt.Errorf("close-all stints: %w", err)
		}
	}

	return dbTx.Commit(ctx)
}
