package application_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/jedi-knights/touchline/services/match-engine/internal/adapters/outbound/memory"
	"github.com/jedi-knights/touchline/services/match-engine/internal/application"
	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
)

// --- helpers ---

// seedSoccer wires up a match with the catalog and lineup state the tests
// share. Mirrors the touchline soccer seed: 2 periods, kickoff/halftime/
// secondhalf/fulltime as clock controls; goal/own_goal/substitution as
// scoring/sub events.
func seedSoccer(t *testing.T) (*memory.MatchRepository, *application.MatchService, string) {
	t.Helper()
	repo := memory.NewMatchRepository()
	svc := application.NewMatchService(repo)

	repo.SeedMatch(&domain.Match{
		ID:               "m1",
		SportID:          "sport-soccer",
		HomeTeamID:       "team-1",
		Status:           domain.StatusSetup,
		SportPeriodCount: 2,
	})

	repo.SeedEventType(&domain.EventType{ID: "et-kickoff", SportID: "sport-soccer", Code: "KICKOFF", ClockControl: domain.ClockStart})
	repo.SeedEventType(&domain.EventType{ID: "et-halftime", SportID: "sport-soccer", Code: "HALF_TIME", ClockControl: domain.ClockStop})
	repo.SeedEventType(&domain.EventType{ID: "et-secondhalf", SportID: "sport-soccer", Code: "SECOND_HALF", ClockControl: domain.ClockStart})
	repo.SeedEventType(&domain.EventType{ID: "et-fulltime", SportID: "sport-soccer", Code: "FULL_TIME", ClockControl: domain.ClockStop})
	repo.SeedEventType(&domain.EventType{ID: "et-goal", SportID: "sport-soccer", Code: "GOAL", AffectsScore: 1, RequiresPlayer: true})
	repo.SeedEventType(&domain.EventType{ID: "et-owngoal", SportID: "sport-soccer", Code: "OWN_GOAL", AffectsScore: 1, RequiresPlayer: true})
	repo.SeedEventType(&domain.EventType{ID: "et-sub", SportID: "sport-soccer", Code: "SUBSTITUTION", IsSubstitution: true})

	// 11 starters + 3 bench
	lineup := []string{"p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"}
	bench := []string{"p12", "p13", "p14"}
	repo.SeedLineup("m1", lineup)
	repo.SeedTeamPlayers("team-1", append(append([]string{}, lineup...), bench...))

	return repo, svc, "m1"
}

func toPtr[T any](v T) *T { return &v }

// --- tests ---

func TestRecordEvent_FirstKickoff_TransitionsToLiveAndOpensStints(t *testing.T) {
	repo, svc, matchID := seedSoccer(t)
	ctx := context.Background()

	m, err := svc.RecordEvent(ctx, application.RecordEventInput{
		MatchID:     matchID,
		EventTypeID: "et-kickoff",
	})
	if err != nil {
		t.Fatalf("RecordEvent kickoff: %v", err)
	}
	if m.Status != domain.StatusLive {
		t.Errorf("status = %q, want live", m.Status)
	}
	if m.CurrentPeriod != 1 {
		t.Errorf("currentPeriod = %d, want 1", m.CurrentPeriod)
	}
	if m.StartedAt == nil {
		t.Errorf("startedAt should be set on first kickoff")
	}
	stints := repo.Stints(matchID)
	if len(stints) != 11 {
		t.Errorf("expected 11 stints opened, got %d", len(stints))
	}
	for _, s := range stints {
		if s.OnAtSeconds != 0 {
			t.Errorf("stint %s opened at %d, want 0", s.PlayerID, s.OnAtSeconds)
		}
		if s.OffAtSeconds != nil {
			t.Errorf("stint %s should be open, got off=%d", s.PlayerID, *s.OffAtSeconds)
		}
	}
}

func TestRecordEvent_GoalCreditsHome(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()

	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}
	m, err := svc.RecordEvent(ctx, application.RecordEventInput{
		MatchID:     matchID,
		EventTypeID: "et-goal",
		Side:        toPtr(domain.SideHome),
		PlayerID:    toPtr("p1"),
	})
	if err != nil {
		t.Fatalf("goal: %v", err)
	}
	if m.HomeScore != 1 || m.AwayScore != 0 {
		t.Errorf("score = %d-%d, want 1-0", m.HomeScore, m.AwayScore)
	}
}

func TestRecordEvent_OwnGoalCreditsOpposingSide(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()

	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}
	m, err := svc.RecordEvent(ctx, application.RecordEventInput{
		MatchID:     matchID,
		EventTypeID: "et-owngoal",
		Side:        toPtr(domain.SideHome),
		PlayerID:    toPtr("p1"),
	})
	if err != nil {
		t.Fatalf("own goal: %v", err)
	}
	if m.HomeScore != 0 || m.AwayScore != 1 {
		t.Errorf("score = %d-%d, want 0-1 (own goal flips credit)", m.HomeScore, m.AwayScore)
	}
}

func TestRecordEvent_FullTime_FinishesAndClosesAllStints(t *testing.T) {
	repo, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	for _, et := range []string{"et-kickoff", "et-halftime", "et-secondhalf", "et-fulltime"} {
		if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: et}); err != nil {
			t.Fatalf("%s: %v", et, err)
		}
	}
	m, _ := repo.GetMatch(ctx, matchID)
	if m.Status != domain.StatusFinished {
		t.Errorf("status = %q, want finished", m.Status)
	}
	if m.FinishedAt == nil {
		t.Errorf("finishedAt should be set on full time")
	}
	for _, s := range repo.Stints(matchID) {
		if s.OffAtSeconds == nil {
			t.Errorf("stint %s should be closed after full time", s.PlayerID)
		}
	}
}

func TestRecordEvent_SetupOnlyAllowsStart(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	_, err := svc.RecordEvent(ctx, application.RecordEventInput{
		MatchID:     matchID,
		EventTypeID: "et-goal",
		Side:        toPtr(domain.SideHome),
		PlayerID:    toPtr("p1"),
	})
	if !errors.Is(err, domain.ErrSetupOnlyStart) {
		t.Fatalf("expected ErrSetupOnlyStart, got %v", err)
	}
}

func TestRecordEvent_RejectsAfterFinished(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	for _, et := range []string{"et-kickoff", "et-halftime", "et-secondhalf", "et-fulltime"} {
		if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: et}); err != nil {
			t.Fatalf("%s: %v", et, err)
		}
	}
	_, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"})
	if !errors.Is(err, domain.ErrMatchFinished) {
		t.Fatalf("expected ErrMatchFinished, got %v", err)
	}
}

func TestRecordEvent_RequiresPlayerWhenFlagSet(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}
	_, err := svc.RecordEvent(ctx, application.RecordEventInput{
		MatchID:     matchID,
		EventTypeID: "et-goal",
		Side:        toPtr(domain.SideHome),
	})
	if !errors.Is(err, domain.ErrRequiresPlayer) {
		t.Fatalf("expected ErrRequiresPlayer, got %v", err)
	}
}

func TestRecordSubstitution_HappyPath_FlipsStints(t *testing.T) {
	repo, svc, matchID := seedSoccer(t)
	ctx := context.Background()

	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}

	// p1 OFF, p12 ON
	if _, err := svc.RecordSubstitution(ctx, application.RecordSubstitutionInput{
		MatchID:      matchID,
		OffPlayerIDs: []string{"p1"},
		OnPlayerIDs:  []string{"p12"},
	}); err != nil {
		t.Fatalf("substitution: %v", err)
	}

	openByPlayer := map[string]bool{}
	for _, s := range repo.Stints(matchID) {
		if s.OffAtSeconds == nil {
			openByPlayer[s.PlayerID] = true
		}
	}
	if openByPlayer["p1"] {
		t.Errorf("p1 should be subbed off (no open stint)")
	}
	if !openByPlayer["p12"] {
		t.Errorf("p12 should be subbed on (open stint)")
	}
}

func TestRecordSubstitution_WritesMetadata(t *testing.T) {
	repo, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}
	if _, err := svc.RecordSubstitution(ctx, application.RecordSubstitutionInput{
		MatchID: matchID, OffPlayerIDs: []string{"p1"}, OnPlayerIDs: []string{"p12"},
	}); err != nil {
		t.Fatalf("sub: %v", err)
	}
	events := repo.InsertedEvents(matchID)
	subEvent := events[len(events)-1]
	if subEvent.EventTypeID != "et-sub" {
		t.Fatalf("last event = %q, want et-sub", subEvent.EventTypeID)
	}
	var meta map[string][]string
	if err := json.Unmarshal(subEvent.Metadata, &meta); err != nil {
		t.Fatalf("metadata: %v", err)
	}
	if len(meta["off"]) != 1 || meta["off"][0] != "p1" {
		t.Errorf("metadata.off = %v, want [p1]", meta["off"])
	}
	if len(meta["on"]) != 1 || meta["on"][0] != "p12" {
		t.Errorf("metadata.on = %v, want [p12]", meta["on"])
	}
}

func TestRecordSubstitution_RejectsUnequalCounts(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}
	_, err := svc.RecordSubstitution(ctx, application.RecordSubstitutionInput{
		MatchID: matchID, OffPlayerIDs: []string{"p1", "p2"}, OnPlayerIDs: []string{"p12"},
	})
	if !errors.Is(err, domain.ErrInvalidRequest) {
		t.Fatalf("expected ErrInvalidRequest, got %v", err)
	}
}

func TestRecordSubstitution_RejectsOverlap(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	if _, err := svc.RecordEvent(ctx, application.RecordEventInput{MatchID: matchID, EventTypeID: "et-kickoff"}); err != nil {
		t.Fatalf("kickoff: %v", err)
	}
	_, err := svc.RecordSubstitution(ctx, application.RecordSubstitutionInput{
		MatchID: matchID, OffPlayerIDs: []string{"p1"}, OnPlayerIDs: []string{"p1"},
	})
	if !errors.Is(err, domain.ErrInvalidRequest) {
		t.Fatalf("expected ErrInvalidRequest for overlap, got %v", err)
	}
}

func TestRecordSubstitution_OnlyWhileLive(t *testing.T) {
	_, svc, matchID := seedSoccer(t)
	ctx := context.Background()
	_, err := svc.RecordSubstitution(ctx, application.RecordSubstitutionInput{
		MatchID: matchID, OffPlayerIDs: []string{"p1"}, OnPlayerIDs: []string{"p12"},
	})
	if !errors.Is(err, domain.ErrInvalidRequest) {
		t.Fatalf("substitution before kickoff should reject, got %v", err)
	}
}

// Smoke test for the clock derivation invariants the engine depends on.
// Full coverage lives in the dedicated clock_test.go below.
func TestElapsedSeconds_RunningSecondHalf(t *testing.T) {
	now := time.Date(2026, 6, 13, 12, 30, 0, 0, time.UTC)
	events := []domain.ClockEvent{
		{ClockControl: domain.ClockStart, WallTime: now.Add(-90 * time.Minute)},
		{ClockControl: domain.ClockStop, WallTime: now.Add(-45 * time.Minute)},
		{ClockControl: domain.ClockStart, WallTime: now.Add(-30 * time.Minute)},
	}
	got := application.ElapsedSeconds(events, now)
	want := 45*60 + 30*60 // first half 45m + running 30m
	if got != want {
		t.Errorf("ElapsedSeconds = %d, want %d", got, want)
	}
}
