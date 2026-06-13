'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { teams } from '@/db/schema';
import { teamSchema } from '@/lib/validation/teams';
import { requireUser } from '@/server/session';

export interface TeamFormState {
  error?: string;
}

const idSchema = z.string().min(1);

function parseTeamForm(formData: FormData) {
  const color = formData.get('color');
  const crestUrl = formData.get('crestUrl');
  return teamSchema.safeParse({
    name: formData.get('name'),
    color: typeof color === 'string' && color.length > 0 ? color : undefined,
    crestUrl: typeof crestUrl === 'string' && crestUrl.length > 0 ? crestUrl : undefined,
  });
}

export async function createTeamAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await requireUser();
  const parsed = parseTeamForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const [row] = await db
    .insert(teams)
    .values({
      userId: user.id,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      crestUrl: parsed.data.crestUrl ?? null,
    })
    .returning({ id: teams.id });

  revalidatePath('/teams');
  redirect(`/teams/${row?.id}`);
}

export async function updateTeamAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await requireUser();

  const idParsed = idSchema.safeParse(formData.get('id'));
  const parsed = parseTeamForm(formData);
  if (!idParsed.success || !parsed.success) {
    return {
      error: parsed.success
        ? 'Invalid team id.'
        : (parsed.error.issues[0]?.message ?? 'Invalid input.'),
    };
  }

  // Compound WHERE enforces ownership at the row level — no separate read needed.
  const result = await db
    .update(teams)
    .set({
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      crestUrl: parsed.data.crestUrl ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(teams.id, idParsed.data), eq(teams.userId, user.id)))
    .returning({ id: teams.id });

  if (result.length === 0) return { error: 'Team not found.' };

  revalidatePath('/teams');
  revalidatePath(`/teams/${idParsed.data}`);
  redirect(`/teams/${idParsed.data}`);
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const idParsed = idSchema.safeParse(formData.get('id'));
  if (!idParsed.success) return;

  await db.delete(teams).where(and(eq(teams.id, idParsed.data), eq(teams.userId, user.id)));

  revalidatePath('/teams');
  redirect('/teams');
}
