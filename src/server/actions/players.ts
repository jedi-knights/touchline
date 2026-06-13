'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { players } from '@/db/schema';
import { playerSchema } from '@/lib/validation/players';
import { assertOwnsTeam, requireUser } from '@/server/session';

export interface PlayerFormState {
  error?: string;
}

const idSchema = z.string().min(1);

function parsePlayerForm(formData: FormData) {
  const number = formData.get('number');
  const position = formData.get('position');
  return playerSchema.safeParse({
    name: formData.get('name'),
    number: typeof number === 'string' && number.length > 0 ? number : undefined,
    position: typeof position === 'string' && position.length > 0 ? position : undefined,
    active: formData.get('active') === 'on' ? true : undefined,
  });
}

export async function createPlayerAction(
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const user = await requireUser();

  const teamIdParsed = idSchema.safeParse(formData.get('teamId'));
  if (!teamIdParsed.success) return { error: 'Invalid team id.' };
  await assertOwnsTeam(teamIdParsed.data, user.id);

  const parsed = parsePlayerForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  await db.insert(players).values({
    teamId: teamIdParsed.data,
    name: parsed.data.name,
    number: parsed.data.number ?? null,
    position: parsed.data.position ?? null,
    active: parsed.data.active ?? true,
  });

  revalidatePath(`/teams/${teamIdParsed.data}`);
  return {};
}

export async function updatePlayerAction(
  _prev: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const user = await requireUser();

  const playerIdParsed = idSchema.safeParse(formData.get('id'));
  const teamIdParsed = idSchema.safeParse(formData.get('teamId'));
  if (!playerIdParsed.success || !teamIdParsed.success) {
    return { error: 'Invalid identifiers.' };
  }
  await assertOwnsTeam(teamIdParsed.data, user.id);

  const parsed = parsePlayerForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  // Compound WHERE ties the player to the (owned) team — no cross-team writes.
  const result = await db
    .update(players)
    .set({
      name: parsed.data.name,
      number: parsed.data.number ?? null,
      position: parsed.data.position ?? null,
      active: parsed.data.active ?? false,
      updatedAt: new Date(),
    })
    .where(and(eq(players.id, playerIdParsed.data), eq(players.teamId, teamIdParsed.data)))
    .returning({ id: players.id });

  if (result.length === 0) return { error: 'Player not found.' };

  revalidatePath(`/teams/${teamIdParsed.data}`);
  return {};
}

export async function deletePlayerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const playerIdParsed = idSchema.safeParse(formData.get('id'));
  const teamIdParsed = idSchema.safeParse(formData.get('teamId'));
  if (!playerIdParsed.success || !teamIdParsed.success) return;
  await assertOwnsTeam(teamIdParsed.data, user.id);

  await db
    .delete(players)
    .where(and(eq(players.id, playerIdParsed.data), eq(players.teamId, teamIdParsed.data)));

  revalidatePath(`/teams/${teamIdParsed.data}`);
}

export async function togglePlayerActiveAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const playerIdParsed = idSchema.safeParse(formData.get('id'));
  const teamIdParsed = idSchema.safeParse(formData.get('teamId'));
  if (!playerIdParsed.success || !teamIdParsed.success) return;
  await assertOwnsTeam(teamIdParsed.data, user.id);

  // Read-then-write — fine here because the row is small and we want to flip
  // a single boolean. Avoiding it would mean a CASE expression in SQL.
  const [row] = await db
    .select({ active: players.active })
    .from(players)
    .where(and(eq(players.id, playerIdParsed.data), eq(players.teamId, teamIdParsed.data)))
    .limit(1);
  if (!row) return;

  await db
    .update(players)
    .set({ active: !row.active, updatedAt: new Date() })
    .where(and(eq(players.id, playerIdParsed.data), eq(players.teamId, teamIdParsed.data)));

  revalidatePath(`/teams/${teamIdParsed.data}`);
}
