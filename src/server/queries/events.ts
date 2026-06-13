/**
 * Live-state queries. The expensive part — turning the event log into an
 * elapsed-seconds value — happens here at the boundary and is then handed to
 * the pure `elapsedSeconds()` function in `src/domain/clock.ts`.
 */
import { and, asc, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  eventTypes,
  matchEvents,
  matches,
  playerStints,
  players,
  sports,
  teams,
} from '@/db/schema';
import { elapsedSeconds, isClockRunning, type ClockEvent } from '@/domain/clock';

export interface SportConfig {
  periodCount: number;
  periodLengthSeconds: number;
}

export interface MatchLiveState {
  id: string;
  status: 'setup' | 'live' | 'finished';
  sportId: string;
  sportConfig: SportConfig;
  team: { id: string; name: string; color: string | null };
  opponentName: string;
  homeScore: number;
  awayScore: number;
  currentPeriod: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  // Derived from the clock-control event log:
  elapsedAtServerNow: number;
  serverNowMs: number;
  running: boolean;
}

const DEFAULT_SPORT_CONFIG: SportConfig = { periodCount: 2, periodLengthSeconds: 2700 };

/**
 * Loads the match plus the sport config and the derived clock state. Returns
 * null when the match either doesn't exist or doesn't belong to the user —
 * the caller should `notFound()` on null.
 */
export async function getMatchLiveState(
  matchId: string,
  userId: string,
): Promise<MatchLiveState | null> {
  const [row] = await db
    .select({
      id: matches.id,
      status: matches.status,
      sportId: matches.sportId,
      sportConfig: sports.config,
      teamId: teams.id,
      teamName: teams.name,
      teamColor: teams.color,
      opponentName: matches.opponentName,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      currentPeriod: matches.currentPeriod,
      startedAt: matches.startedAt,
      finishedAt: matches.finishedAt,
    })
    .from(matches)
    .innerJoin(teams, eq(matches.homeTeamId, teams.id))
    .innerJoin(sports, eq(matches.sportId, sports.id))
    .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
    .limit(1);

  if (!row) return null;

  const clockEvents = await listClockEvents(matchId);
  const now = new Date();
  const elapsedAtServerNow = elapsedSeconds(clockEvents, now);
  const running = isClockRunning(clockEvents);

  const cfg = parseSportConfig(row.sportConfig);

  return {
    id: row.id,
    status: row.status,
    sportId: row.sportId,
    sportConfig: cfg,
    team: { id: row.teamId, name: row.teamName, color: row.teamColor },
    opponentName: row.opponentName,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    currentPeriod: row.currentPeriod,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    elapsedAtServerNow,
    serverNowMs: now.getTime(),
    running,
  };
}

function parseSportConfig(raw: unknown): SportConfig {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const pc =
      typeof obj.periodCount === 'number' ? obj.periodCount : DEFAULT_SPORT_CONFIG.periodCount;
    const pl =
      typeof obj.periodLengthSeconds === 'number'
        ? obj.periodLengthSeconds
        : DEFAULT_SPORT_CONFIG.periodLengthSeconds;
    return { periodCount: pc, periodLengthSeconds: pl };
  }
  return DEFAULT_SPORT_CONFIG;
}

/**
 * Returns just the clock-control events (in chronological order) needed to
 * derive elapsed seconds and the running flag. O(n) over the match's event
 * log, bounded by the event count for a single match.
 */
export async function listClockEvents(matchId: string): Promise<ClockEvent[]> {
  const rows = await db
    .select({
      clockControl: eventTypes.clockControl,
      wallTime: matchEvents.wallTime,
    })
    .from(matchEvents)
    .innerJoin(eventTypes, eq(matchEvents.eventTypeId, eventTypes.id))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.wallTime));

  // Filter to start/stop in JS — pushing this filter into SQL would lose the
  // index-friendly `where match_id = ?` ordering. Bounded by event count.
  return rows
    .filter((r) => r.clockControl === 'start' || r.clockControl === 'stop')
    .map((r) => ({ clockControl: r.clockControl, wallTime: r.wallTime }));
}

export interface EventTypeOption {
  id: string;
  code: string;
  label: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  clockControl: 'start' | 'stop' | 'none';
  requiresPlayer: boolean;
  affectsScore: number;
  isSubstitution: boolean;
}

/** Catalog of event types for a sport, render order. */
export async function listEventTypesForSport(sportId: string): Promise<EventTypeOption[]> {
  return db
    .select({
      id: eventTypes.id,
      code: eventTypes.code,
      label: eventTypes.label,
      icon: eventTypes.icon,
      color: eventTypes.color,
      sortOrder: eventTypes.sortOrder,
      clockControl: eventTypes.clockControl,
      requiresPlayer: eventTypes.requiresPlayer,
      affectsScore: eventTypes.affectsScore,
      isSubstitution: eventTypes.isSubstitution,
    })
    .from(eventTypes)
    .where(eq(eventTypes.sportId, sportId))
    .orderBy(asc(eventTypes.sortOrder), asc(eventTypes.code));
}

export interface OnFieldPlayer {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
}

/**
 * Players currently on the field, derived from open `player_stints`. Empty
 * before match start; equals the starting lineup once the match goes live;
 * shrinks/expands as substitutions happen.
 */
export async function getOnFieldPlayers(matchId: string): Promise<OnFieldPlayer[]> {
  return db
    .select({
      id: players.id,
      name: players.name,
      number: players.number,
      position: players.position,
    })
    .from(playerStints)
    .innerJoin(players, eq(playerStints.playerId, players.id))
    .where(and(eq(playerStints.matchId, matchId), isNull(playerStints.offAtSeconds)))
    .orderBy(asc(players.number), asc(players.name));
}

/**
 * Roster players currently NOT on the field — the live bench, used by the
 * substitution sheet. Includes starters who've been subbed off and reserves
 * who haven't been brought on yet.
 */
export async function getLiveBench(matchId: string, teamId: string): Promise<OnFieldPlayer[]> {
  const onFieldRows = await db
    .select({ playerId: playerStints.playerId })
    .from(playerStints)
    .where(and(eq(playerStints.matchId, matchId), isNull(playerStints.offAtSeconds)));

  const exclude = onFieldRows.map((r) => r.playerId);
  const baseWhere = and(eq(players.teamId, teamId), eq(players.active, true));
  const where = exclude.length === 0 ? baseWhere : and(baseWhere, notInArray(players.id, exclude));

  return db
    .select({
      id: players.id,
      name: players.name,
      number: players.number,
      position: players.position,
    })
    .from(players)
    .where(where)
    .orderBy(asc(players.number), asc(players.name));
}

export interface StintWithPlayer {
  playerId: string;
  playerName: string;
  playerNumber: number | null;
  position: string | null;
  onAtSeconds: number;
  offAtSeconds: number | null;
}

/**
 * All stints for a match with the player row joined in. Order is (onAt asc,
 * number asc) so timeline-style readers see them chronologically.
 */
export async function listStintsForMatch(matchId: string): Promise<StintWithPlayer[]> {
  return db
    .select({
      playerId: playerStints.playerId,
      playerName: players.name,
      playerNumber: players.number,
      position: players.position,
      onAtSeconds: playerStints.onAtSeconds,
      offAtSeconds: playerStints.offAtSeconds,
    })
    .from(playerStints)
    .innerJoin(players, eq(playerStints.playerId, players.id))
    .where(eq(playerStints.matchId, matchId))
    .orderBy(asc(playerStints.onAtSeconds), asc(players.number));
}

export interface TimelineEvent {
  id: string;
  matchClockSeconds: number;
  periodNumber: number;
  side: 'home' | 'away' | null;
  code: string;
  label: string;
  color: string | null;
  affectsScore: number;
  isSubstitution: boolean;
  playerName: string | null;
  playerNumber: number | null;
}

/** Newest-first match timeline for display. */
export async function listTimeline(matchId: string): Promise<TimelineEvent[]> {
  const rows = await db
    .select({
      id: matchEvents.id,
      matchClockSeconds: matchEvents.matchClockSeconds,
      periodNumber: matchEvents.periodNumber,
      side: matchEvents.side,
      code: eventTypes.code,
      label: eventTypes.label,
      color: eventTypes.color,
      affectsScore: eventTypes.affectsScore,
      isSubstitution: eventTypes.isSubstitution,
      playerName: players.name,
      playerNumber: players.number,
      wallTime: matchEvents.wallTime,
    })
    .from(matchEvents)
    .innerJoin(eventTypes, eq(matchEvents.eventTypeId, eventTypes.id))
    .leftJoin(players, eq(matchEvents.playerId, players.id))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.wallTime));

  return rows.reverse().map((r) => ({
    id: r.id,
    matchClockSeconds: r.matchClockSeconds,
    periodNumber: r.periodNumber,
    side: r.side,
    code: r.code,
    label: r.label,
    color: r.color,
    affectsScore: r.affectsScore,
    isSubstitution: r.isSubstitution,
    playerName: r.playerName,
    playerNumber: r.playerNumber,
  }));
}
