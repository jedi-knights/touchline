// Score delta. Mirrors src/domain/scoring.ts in touchline — same OWN_GOAL
// flip rule. Two ports of the same 12-line function is the tradeoff for the
// polyglot pattern.
package application

import "github.com/jedi-knights/touchline/services/match-engine/internal/domain"

// ScoreDelta returns the (home, away) delta this event contributes.
//
// Standard scoring events credit the side that performed the action. OWN_GOAL
// credits the opposing side — the only sport-specific rule baked into match-
// engine. New sports that need their own flip rules can opt in by extending
// this switch.
func ScoreDelta(eventCode string, affectsScore int, side *domain.Side) (home, away int) {
	if affectsScore == 0 || side == nil {
		return 0, 0
	}
	credited := *side
	if eventCode == "OWN_GOAL" {
		if credited == domain.SideHome {
			credited = domain.SideAway
		} else {
			credited = domain.SideHome
		}
	}
	if credited == domain.SideHome {
		return affectsScore, 0
	}
	return 0, affectsScore
}
