/**
 * Player queries scoped to the team's owner. Callers must have already
 * verified team ownership via `assertOwnsTeam` (or pass `userId` so the
 * query enforces it transitively via JOIN).
 */
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { players, teams } from '@/db/schema';

export interface PlayerRow {
  id: string;
  teamId: string;
  name: string;
  number: number | null;
  position: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * O(n) over the team's roster. Ordered by number (nulls last) then name so
 * the live UI's player picker is predictable.
 */
export async function listPlayersForTeam(teamId: string, userId: string): Promise<PlayerRow[]> {
  return db
    .select({
      id: players.id,
      teamId: players.teamId,
      name: players.name,
      number: players.number,
      position: players.position,
      active: players.active,
      createdAt: players.createdAt,
      updatedAt: players.updatedAt,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(and(eq(players.teamId, teamId), eq(teams.userId, userId)))
    .orderBy(asc(players.number), asc(players.name));
}
