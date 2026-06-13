'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { matchLineupPlayers, matches, players, sports } from '@/db/schema';
import { createMatchSchema } from '@/lib/validation/matches';
import { assertOwnsTeam, requireUser } from '@/server/session';

export interface CreateMatchFormState {
  error?: string;
}

export async function createMatchAction(
  _prev: CreateMatchFormState,
  formData: FormData,
): Promise<CreateMatchFormState> {
  const user = await requireUser();

  // `lineupPlayerIds` arrives as multiple form fields with the same name; pull
  // them all via getAll.
  const parsed = createMatchSchema.safeParse({
    sportSlug: formData.get('sportSlug') ?? 'soccer',
    teamId: formData.get('teamId'),
    opponentName: formData.get('opponentName'),
    lineupPlayerIds: formData.getAll('lineupPlayerIds'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { sportSlug, teamId, opponentName, lineupPlayerIds } = parsed.data;

  await assertOwnsTeam(teamId, user.id);

  const [sport] = await db
    .select({ id: sports.id })
    .from(sports)
    .where(eq(sports.slug, sportSlug))
    .limit(1);
  if (!sport) return { error: 'Unknown sport.' };

  // Validate that every lineup id belongs to the chosen team AND is active.
  // This is the security boundary for the lineup field — without it a client
  // could submit player ids from another team.
  const validPlayers = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.teamId, teamId),
        eq(players.active, true),
        inArray(players.id, lineupPlayerIds),
      ),
    );
  if (validPlayers.length !== lineupPlayerIds.length) {
    return { error: 'Lineup includes players that are not on the selected team or are inactive.' };
  }

  // Insert match + lineup atomically. If either fails, the transaction rolls
  // back so we never get a half-created match without a lineup.
  const matchId = await db.transaction(async (tx) => {
    const [match] = await tx
      .insert(matches)
      .values({
        userId: user.id,
        sportId: sport.id,
        homeTeamId: teamId,
        opponentName,
        status: 'setup',
      })
      .returning({ id: matches.id });
    if (!match) throw new Error('Failed to create match');

    await tx
      .insert(matchLineupPlayers)
      .values(lineupPlayerIds.map((playerId) => ({ matchId: match.id, playerId })));

    return match.id;
  });

  revalidatePath('/matches');
  redirect(`/matches/${matchId}`);
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const matchId = formData.get('id');
  if (typeof matchId !== 'string' || matchId.length === 0) return;

  await db.delete(matches).where(and(eq(matches.id, matchId), eq(matches.userId, user.id)));

  revalidatePath('/matches');
  redirect('/matches');
}
