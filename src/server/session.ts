/**
 * Server-side session and tenant-scoping helpers.
 *
 * EVERY read or write of a user-owned resource (team, player, match) MUST go
 * through one of these helpers. The DB itself does not enforce ownership —
 * isolation is a server-side invariant.
 *
 *   - `requireUser()` aborts with a redirect to /sign-in if there is no session.
 *   - `assertOwns*()` aborts with notFound() (a 404, not a 403) if the row
 *     either doesn't exist or belongs to a different user. Returning 404 hides
 *     the existence of other users' resources from probing.
 */
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { matches, players, teams } from '@/db/schema';
import { auth } from './auth';

export interface AuthedUser {
  id: string;
  email: string;
  name: string | null;
}

export async function requireUser(): Promise<AuthedUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect('/sign-in');
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
}

export async function assertOwnsTeam(teamId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.userId, userId)))
    .limit(1);
  if (!row) notFound();
}

export async function assertOwnsPlayer(playerId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ id: players.id })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(and(eq(players.id, playerId), eq(teams.userId, userId)))
    .limit(1);
  if (!row) notFound();
}

export async function assertOwnsMatch(matchId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
    .limit(1);
  if (!row) notFound();
}
