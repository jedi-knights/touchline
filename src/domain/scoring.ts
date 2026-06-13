/**
 * Score deltas derived from match events.
 *
 * The engine is sport-agnostic: each event carries a numeric `affectsScore`
 * (from its `event_type` row) and a `side`. Own goals are a special case —
 * the credit flips to the opposing side. We discriminate on the canonical
 * code 'OWN_GOAL'; any other event whose `affectsScore` is non-zero credits
 * the side that took the action.
 *
 * O(n) single pass over events.
 */

export type Side = 'home' | 'away';

export interface ScoringEvent {
  /** Canonical code from event_types.code, e.g. 'GOAL', 'OWN_GOAL'. */
  eventCode: string;
  /** From event_types.affects_score. Zero for non-scoring events. */
  affectsScore: number;
  /** Side that performed the action. Null for system events. */
  side: Side | null;
}

export interface Score {
  home: number;
  away: number;
}

const OPPOSITE: Record<Side, Side> = { home: 'away', away: 'home' };

export function scoreDelta(event: ScoringEvent): Score {
  if (event.affectsScore === 0 || event.side === null) {
    return { home: 0, away: 0 };
  }
  const credited: Side = event.eventCode === 'OWN_GOAL' ? OPPOSITE[event.side] : event.side;
  return credited === 'home'
    ? { home: event.affectsScore, away: 0 }
    : { home: 0, away: event.affectsScore };
}

export function aggregateScore(events: readonly ScoringEvent[]): Score {
  let home = 0;
  let away = 0;
  for (const ev of events) {
    const d = scoreDelta(ev);
    home += d.home;
    away += d.away;
  }
  return { home, away };
}
