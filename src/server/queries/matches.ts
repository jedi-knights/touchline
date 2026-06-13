/**
 * User-scoped match queries. Like teams/players, every read filters by
 * `userId` and returns null / empty for cross-tenant requests.
 */
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { matchLineupPlayers, matches, players, teams } from '@/db/schema';

export interface MatchListRow {
  id: string;
  status: 'setup' | 'live' | 'finished';
  homeTeamName: string;
  opponentName: string;
  homeScore: number;
  awayScore: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export async function listMatches(userId: string): Promise<MatchListRow[]> {
  return db
    .select({
      id: matches.id,
      status: matches.status,
      homeTeamName: teams.name,
      opponentName: matches.opponentName,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      startedAt: matches.startedAt,
      finishedAt: matches.finishedAt,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .innerJoin(teams, eq(matches.homeTeamId, teams.id))
    .where(eq(matches.userId, userId))
    .orderBy(desc(matches.createdAt));
}

export interface LineupEntry {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  active: boolean;
}

/**
 * Returns the starting lineup for a match, in (number asc, name asc) order.
 * Caller must have already verified match ownership (via getMatch or
 * assertOwnsMatch); this query trusts that and joins by id only.
 */
export async function getLineupForMatch(matchId: string): Promise<LineupEntry[]> {
  return db
    .select({
      id: players.id,
      name: players.name,
      number: players.number,
      position: players.position,
      active: players.active,
    })
    .from(matchLineupPlayers)
    .innerJoin(players, eq(matchLineupPlayers.playerId, players.id))
    .where(eq(matchLineupPlayers.matchId, matchId))
    .orderBy(asc(players.number), asc(players.name));
}

/**
 * Players on the team that are NOT in the starting lineup — the bench plus
 * any other active roster members.
 */
export async function getBenchForMatch(matchId: string, teamId: string): Promise<LineupEntry[]> {
  // Two queries (lineup ids, then bench) — O(roster size) bounded by the team
  // roster. `notInArray` requires a non-empty list, hence the guard.
  const lineupIds = await db
    .select({ playerId: matchLineupPlayers.playerId })
    .from(matchLineupPlayers)
    .where(eq(matchLineupPlayers.matchId, matchId));

  const exclude = lineupIds.map((r) => r.playerId);

  const baseWhere = and(eq(players.teamId, teamId), eq(players.active, true));
  const where = exclude.length === 0 ? baseWhere : and(baseWhere, notInArray(players.id, exclude));

  return db
    .select({
      id: players.id,
      name: players.name,
      number: players.number,
      position: players.position,
      active: players.active,
    })
    .from(players)
    .where(where)
    .orderBy(asc(players.number), asc(players.name));
}

export interface TeamWithActiveRoster {
  id: string;
  name: string;
  color: string | null;
  players: { id: string; name: string; number: number | null; position: string | null }[];
}

/**
 * Used by /matches/new to populate the team picker and the lineup multi-
 * select in a single payload. Two queries (teams, then active players for
 * those teams) — total cost is O(teams + active players for user).
 */
export async function getTeamsWithActiveRosters(userId: string): Promise<TeamWithActiveRoster[]> {
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, color: teams.color })
    .from(teams)
    .where(eq(teams.userId, userId))
    .orderBy(asc(teams.name));

  if (teamRows.length === 0) return [];

  const teamIds = teamRows.map((t) => t.id);
  const playerRows = await db
    .select({
      id: players.id,
      teamId: players.teamId,
      name: players.name,
      number: players.number,
      position: players.position,
    })
    .from(players)
    .where(and(inArray(players.teamId, teamIds), eq(players.active, true)))
    .orderBy(asc(players.number), asc(players.name));

  // Group players under their team — O(p) single pass with a hash map.
  const byTeam = new Map<string, TeamWithActiveRoster['players']>();
  for (const p of playerRows) {
    const list = byTeam.get(p.teamId) ?? [];
    list.push({ id: p.id, name: p.name, number: p.number, position: p.position });
    byTeam.set(p.teamId, list);
  }

  return teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    players: byTeam.get(t.id) ?? [],
  }));
}
