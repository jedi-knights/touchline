'use server';

import { revalidatePath } from 'next/cache';
import { recordEventSchema, substitutionSchema } from '@/lib/validation/events';
import { recordEventViaEngine, recordSubstitutionViaEngine } from '@/server/match-engine-client';
import { assertOwnsMatch, requireUser } from '@/server/session';

export interface RecordEventState {
  error?: string;
}

/**
 * Thin shim over the vendored match-engine service. Auth + tenant scoping
 * stay in Next.js (`requireUser`, `assertOwnsMatch`); the state machine —
 * deriving the match clock, transitioning status, opening/closing stints,
 * applying score deltas — lives in services/match-engine and writes the
 * touchline schema directly.
 *
 * The optimistic-UI work in src/components/live/live-tracker.tsx still
 * applies: the action returns the new match state (status, score, period)
 * and revalidatePath fires so the page re-renders with authoritative data.
 */
export async function recordEventAction(input: {
  matchId: string;
  eventTypeId: string;
  side?: 'home' | 'away' | null;
  playerId?: string;
}): Promise<RecordEventState> {
  const user = await requireUser();

  const parsed = recordEventSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  const { matchId, eventTypeId, side, playerId } = parsed.data;

  await assertOwnsMatch(matchId, user.id);

  const result = await recordEventViaEngine({ matchId, eventTypeId, side, playerId });
  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath(`/matches/${matchId}/live`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath('/matches');
  return {};
}

export interface SubstitutionState {
  error?: string;
}

/**
 * Atomic substitution. Same shape as before; the engine owns the
 * "validate, close off-stints, open on-stints, write event" sequence
 * in one DB transaction.
 */
export async function recordSubstitutionAction(input: {
  matchId: string;
  offPlayerIds: string[];
  onPlayerIds: string[];
}): Promise<SubstitutionState> {
  const user = await requireUser();

  const parsed = substitutionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  const { matchId, offPlayerIds, onPlayerIds } = parsed.data;

  await assertOwnsMatch(matchId, user.id);

  const result = await recordSubstitutionViaEngine({
    matchId,
    offPlayerIds,
    onPlayerIds,
  });
  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath(`/matches/${matchId}/live`);
  revalidatePath(`/matches/${matchId}`);
  return {};
}
