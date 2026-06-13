// Pure clock derivation. Mirrors src/domain/clock.ts in touchline — same
// algorithm, same edge cases (ignores duplicate starts while running, ignores
// stops while stopped, clamps fractional seconds). A direct port keeps the
// engine's view of "what time is it on the match clock?" in sync with the
// client's locally-ticking GameClock.
package application

import (
	"math"
	"time"

	"github.com/jedi-knights/touchline/services/match-engine/internal/domain"
)

// ElapsedSeconds returns the match-clock seconds at `now`, given the
// chronological clock-control event log.
//
// O(n) single pass. Out-of-order events are tolerated: if a stop precedes
// its start due to clock skew, the segment is clamped to zero.
func ElapsedSeconds(events []domain.ClockEvent, now time.Time) int {
	openSince, closed := reduceClock(events)
	if openSince == nil {
		return clampInt(closed)
	}
	open := now.Sub(*openSince).Seconds()
	if open < 0 {
		open = 0
	}
	return clampInt(closed + open)
}

// IsClockRunning reports whether the clock is currently running.
func IsClockRunning(events []domain.ClockEvent) bool {
	openSince, _ := reduceClock(events)
	return openSince != nil
}

// CountStarts returns the number of clock_control=start events in the log.
// Used by the state transition logic to determine the current period.
func CountStarts(events []domain.ClockEvent) int {
	n := 0
	for _, e := range events {
		if e.ClockControl == domain.ClockStart {
			n++
		}
	}
	return n
}

// CountStops returns the number of clock_control=stop events in the log.
func CountStops(events []domain.ClockEvent) int {
	n := 0
	for _, e := range events {
		if e.ClockControl == domain.ClockStop {
			n++
		}
	}
	return n
}

// reduceClock walks the events and returns (openSince, closedSeconds). It
// tolerates the same edge cases as touchline's clock.ts:
//
//   - duplicate start while already running → ignored
//   - stop while not running                → ignored
func reduceClock(events []domain.ClockEvent) (*time.Time, float64) {
	var openSince *time.Time
	closed := 0.0
	for _, e := range events {
		switch e.ClockControl {
		case domain.ClockStart:
			if openSince == nil {
				t := e.WallTime
				openSince = &t
			}
		case domain.ClockStop:
			if openSince != nil {
				closed += e.WallTime.Sub(*openSince).Seconds()
				openSince = nil
			}
		case domain.ClockNone:
			// no effect
		}
	}
	return openSince, closed
}

func clampInt(f float64) int {
	if f < 0 {
		return 0
	}
	return int(math.Floor(f))
}
