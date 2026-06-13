/**
 * User-scoped team queries. Every read takes `userId` as a parameter and
 * filters by it — there is no path here that returns another user's data.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { players, teams } from '@/db/schema';

export interface TeamRow {
  id: string;
  name: string;
  color: string | null;
  crestUrl: string | null;
  playerCount: number;
  activePlayerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * O(n) over the user's teams: a single GROUP BY query, one row per team.
 * Player counts are pushed into the DB so we don't N+1 over teams.
 */
export async function listTeams(userId: string): Promise<TeamRow[]> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      color: teams.color,
      crestUrl: teams.crestUrl,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
      playerCount: sql<number>`count(${players.id})::int`,
      activePlayerCount: sql<number>`count(${players.id}) filter (where ${players.active} = true)::int`,
    })
    .from(teams)
    .leftJoin(players, eq(players.teamId, teams.id))
    .where(eq(teams.userId, userId))
    .groupBy(teams.id)
    .orderBy(asc(teams.name));

  return rows;
}

export interface TeamDetail {
  id: string;
  name: string;
  color: string | null;
  crestUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Returns the team row only if it belongs to the user. Null otherwise. */
export async function getTeam(teamId: string, userId: string): Promise<TeamDetail | null> {
  const [row] = await db
    .select({
      id: teams.id,
      name: teams.name,
      color: teams.color,
      crestUrl: teams.crestUrl,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.userId, userId)))
    .limit(1);

  return row ?? null;
}
