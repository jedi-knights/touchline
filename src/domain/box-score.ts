/**
 * Box-score aggregation, derived from match_events.
 *
 * Per-player rows are emitted only for events with a player_id (touchline
 * tracks the home roster but has no rows for opponent players, so away-side
 * stats live in team totals only). Clock-control events (KICKOFF, HALF_TIME,
 * SECOND_HALF, FULL_TIME) and substitutions belong to other tables — minutes
 * come from player_stints, period transitions from the clock event log — so
 * they're skipped here.
 *
 * OWN_GOAL: the team-totals credit follows scoreDelta (opposing side scores),
 * but the per-player stat is attributed as `ownGoals` on the player who put
 * it in their own net.
 *
 * O(n) single pass over events; hash-map keyed by playerId for per-player rows.
 */
import type { Side } from './scoring';

export interface BoxScoreEvent {
  /** Canonical code from event_types.code (e.g. 'GOAL', 'YELLOW_CARD'). */
  code: string;
  /** The side that performed the action. Null for system events. */
  side: Side | null;
  /** Attribution to a player. Null for team-only stats (corners, saves, offsides) and opponent events. */
  playerId: string | null;
}

export interface PlayerStats {
  playerId: string;
  goals: number;
  ownGoals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  saves: number;
  fouls: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
}

export interface BoxScore {
  perPlayer: PlayerStats[];
  teamTotals: { home: TeamStats; away: TeamStats };
}

function zeroTeam(): TeamStats {
  return {
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    saves: 0,
    fouls: 0,
    offsides: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

function zeroPlayer(playerId: string): PlayerStats {
  return {
    playerId,
    goals: 0,
    ownGoals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

export function aggregateBoxScore(events: readonly BoxScoreEvent[]): BoxScore {
  const home = zeroTeam();
  const away = zeroTeam();
  const perPlayer = new Map<string, PlayerStats>();

  const playerOf = (pid: string): PlayerStats => {
    let row = perPlayer.get(pid);
    if (!row) {
      row = zeroPlayer(pid);
      perPlayer.set(pid, row);
    }
    return row;
  };

  for (const e of events) {
    const team = e.side === 'home' ? home : e.side === 'away' ? away : null;

    switch (e.code) {
      case 'GOAL':
        if (team) team.goals += 1;
        if (e.playerId) playerOf(e.playerId).goals += 1;
        break;
      case 'OWN_GOAL':
        // Team credit flips to the opposing side (matches scoreDelta).
        if (e.side) {
          const credited = e.side === 'home' ? away : home;
          credited.goals += 1;
        }
        // Player stat stays on the scorer (the home player who scored against themselves).
        if (e.playerId) playerOf(e.playerId).ownGoals += 1;
        break;
      case 'ASSIST':
        if (e.playerId) playerOf(e.playerId).assists += 1;
        break;
      case 'SHOT':
        if (team) team.shots += 1;
        if (e.playerId) playerOf(e.playerId).shots += 1;
        break;
      case 'SHOT_ON_TARGET':
        if (team) {
          team.shots += 1;
          team.shotsOnTarget += 1;
        }
        if (e.playerId) {
          const p = playerOf(e.playerId);
          p.shots += 1;
          p.shotsOnTarget += 1;
        }
        break;
      case 'SAVE':
        if (team) team.saves += 1;
        break;
      case 'CORNER':
        if (team) team.corners += 1;
        break;
      case 'FOUL':
        if (team) team.fouls += 1;
        if (e.playerId) playerOf(e.playerId).fouls += 1;
        break;
      case 'OFFSIDE':
        if (team) team.offsides += 1;
        break;
      case 'YELLOW_CARD':
        if (team) team.yellowCards += 1;
        if (e.playerId) playerOf(e.playerId).yellowCards += 1;
        break;
      case 'RED_CARD':
        if (team) team.redCards += 1;
        if (e.playerId) playerOf(e.playerId).redCards += 1;
        break;
      default:
        // Clock controls, substitutions, and any unrecognized codes — skip.
        // Score/minutes/period transitions are handled elsewhere.
        break;
    }
  }

  return { perPlayer: [...perPlayer.values()], teamTotals: { home, away } };
}
