'use server';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import {
  eventTypes,
  matchEvents,
  matchLineupPlayers,
  matches,
  playerStints,
  players,
  sports,
  teams,
} from '@/db/schema';
import { elapsedSeconds, type ClockEvent } from '@/domain/clock';
import { scoreDelta } from '@/domain/scoring';
import { recordEventSchema, substitutionSchema } from '@/lib/validation/events';
import { assertOwnsMatch, requireUser } from '@/server/session';

export interface RecordEventState {
  error?: string;
}

/**
 * Records a single match event and applies its side effects atomically:
 *  - inserts the match_event row with derived `match_clock_seconds` and
 *    `period_number`
 *  - on first start: transitions match.status setup→live, sets startedAt,
 *    and creates a player_stint at second 0 for every starting-lineup player
 *  - on subsequent starts: increments match.current_period
 *  - on a stop that closes the final period: transitions to finished, sets
 *    finishedAt, and closes every still-open player_stint at the final clock
 *  - on scoring events: updates home_score/away_score via the domain
 *    `scoreDelta` (OWN_GOAL credits the opposing side)
 *
 * Every state change happens inside `db.transaction` so a partial application
 * (event without stints, score without event) is impossible.
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

  // Load match + sport config and the event_type row up front. Both are tiny.
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: 'Match not found.' };
  if (match.status === 'finished') return { error: 'Match is already finished.' };

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, eventTypeId))
    .limit(1);
  if (!eventType) return { error: 'Unknown event type.' };
  if (eventType.sportId !== match.sportId) return { error: 'Event type does not match the sport.' };

  // Setup status only allows starting the match — no goals, no cards.
  if (match.status === 'setup' && eventType.clockControl !== 'start') {
    return { error: 'Start the match before recording other events.' };
  }

  if (eventType.requiresPlayer && !playerId) {
    return { error: 'This event requires a player.' };
  }

  const [sport] = await db
    .select({ config: sports.config })
    .from(sports)
    .where(eq(sports.id, match.sportId))
    .limit(1);
  if (!sport) return { error: 'Sport missing.' };

  const sportConfig = parseSportConfig(sport.config);

  // Load the chronological clock-control event log to derive clock state.
  const priorClock = await db
    .select({ clockControl: eventTypes.clockControl, wallTime: matchEvents.wallTime })
    .from(matchEvents)
    .innerJoin(eventTypes, eq(matchEvents.eventTypeId, eventTypes.id))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.wallTime));

  const clockOnly: ClockEvent[] = priorClock
    .filter((r) => r.clockControl === 'start' || r.clockControl === 'stop')
    .map((r) => ({ clockControl: r.clockControl, wallTime: r.wallTime }));

  const now = new Date();
  const matchClockSeconds = elapsedSeconds(clockOnly, now);

  const priorStarts = clockOnly.filter((e) => e.clockControl === 'start').length;
  const priorStops = clockOnly.filter((e) => e.clockControl === 'stop').length;

  // Period the *new* event belongs to:
  //  - A `start` opens the next period (priorStarts + 1).
  //  - Anything else belongs to the current period (priorStarts), or to
  //    period 1 if we somehow haven't started yet (setup→start path).
  const periodNumber =
    eventType.clockControl === 'start' ? priorStarts + 1 : Math.max(1, priorStarts);

  // Scoring delta — uses the canonical OWN_GOAL flip rule from the domain fn.
  const delta = scoreDelta({
    eventCode: eventType.code,
    affectsScore: eventType.affectsScore,
    side: side ?? null,
  });

  await db.transaction(async (tx) => {
    await tx.insert(matchEvents).values({
      matchId,
      eventTypeId,
      wallTime: now,
      matchClockSeconds,
      periodNumber,
      side: side ?? null,
      playerId: playerId ?? null,
    });

    // State transitions driven by clock controls + score events.
    const isStart = eventType.clockControl === 'start';
    const isStop = eventType.clockControl === 'stop';

    const startsAfter = priorStarts + (isStart ? 1 : 0);
    const stopsAfter = priorStops + (isStop ? 1 : 0);

    const isFirstStart = isStart && match.status === 'setup' && priorStarts === 0;
    const closesFinalPeriod =
      isStop && stopsAfter === startsAfter && stopsAfter >= sportConfig.periodCount;

    const updates: Partial<typeof matches.$inferInsert> = {
      homeScore: match.homeScore + delta.home,
      awayScore: match.awayScore + delta.away,
      updatedAt: now,
    };

    if (isStart) {
      updates.status = 'live';
      updates.currentPeriod = startsAfter;
      if (isFirstStart) updates.startedAt = now;
    }
    if (closesFinalPeriod) {
      updates.status = 'finished';
      updates.finishedAt = now;
    }

    await tx.update(matches).set(updates).where(eq(matches.id, matchId));

    // First start: open a stint for every starting-lineup player.
    if (isFirstStart) {
      const lineup = await tx
        .select({ playerId: matchLineupPlayers.playerId })
        .from(matchLineupPlayers)
        .where(eq(matchLineupPlayers.matchId, matchId));

      if (lineup.length > 0) {
        await tx.insert(playerStints).values(
          lineup.map((l) => ({
            matchId,
            playerId: l.playerId,
            onAtSeconds: 0,
          })),
        );
      }
    }

    // Final stop: close every still-open stint at the final clock value.
    if (closesFinalPeriod) {
      await tx
        .update(playerStints)
        .set({ offAtSeconds: matchClockSeconds })
        .where(and(eq(playerStints.matchId, matchId), isNull(playerStints.offAtSeconds)));
    }
  });

  revalidatePath(`/matches/${matchId}/live`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath('/matches');
  return {};
}

export interface SubstitutionState {
  error?: string;
}

/**
 * Atomic substitution. Closes the outgoing players' open stints at the
 * current derived clock value and opens new stints for the incoming
 * players, AND writes a SUBSTITUTION match_event in the same transaction.
 *
 * Invariants enforced before the transaction:
 *  - match is owned by the caller and is currently `live`
 *  - the sport has a SUBSTITUTION event_type
 *  - every OFF id has exactly one open stint for this match
 *  - every ON id is an active player on the match's home team and has NO
 *    open stint (so no double-on)
 *  - equal non-empty counts (enforced by `substitutionSchema`)
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

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: 'Match not found.' };
  if (match.status !== 'live') return { error: 'Substitutions only during a live match.' };

  // Find the SUBSTITUTION event_type for this match's sport. Data-driven —
  // the lookup uses the `is_substitution` flag, not a hardcoded code, so a
  // new sport's substitution event can carry a different label.
  const [subEventType] = await db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.sportId, match.sportId), eq(eventTypes.isSubstitution, true)))
    .limit(1);
  if (!subEventType) return { error: 'No substitution event type configured for this sport.' };

  // Outgoing players must each have exactly one open stint right now. Same
  // query checks ownership transitively (player → team belongs to user via
  // the assertOwnsMatch + match.homeTeamId join below).
  const openOffStints = await db
    .select({ playerId: playerStints.playerId })
    .from(playerStints)
    .where(
      and(
        eq(playerStints.matchId, matchId),
        isNull(playerStints.offAtSeconds),
        inArray(playerStints.playerId, offPlayerIds),
      ),
    );
  if (openOffStints.length !== offPlayerIds.length) {
    return { error: 'One or more OFF players are not currently on the field.' };
  }

  // Incoming players must (a) be on the home team, (b) be active, (c) not
  // already have an open stint for this match.
  const validOn = await db
    .select({ id: players.id })
    .from(players)
    .innerJoin(teams, eq(players.teamId, teams.id))
    .where(
      and(
        eq(teams.id, match.homeTeamId),
        eq(players.active, true),
        inArray(players.id, onPlayerIds),
      ),
    );
  if (validOn.length !== onPlayerIds.length) {
    return { error: 'One or more ON players are not on the team or are inactive.' };
  }

  const existingOpenOn = await db
    .select({ playerId: playerStints.playerId })
    .from(playerStints)
    .where(
      and(
        eq(playerStints.matchId, matchId),
        isNull(playerStints.offAtSeconds),
        inArray(playerStints.playerId, onPlayerIds),
      ),
    );
  if (existingOpenOn.length > 0) {
    return { error: 'One or more ON players are already on the field.' };
  }

  // Derive the match-clock seconds at "now" the same way recordEventAction
  // does. The substitution event and the stint flips all stamp this value.
  const priorClock = await db
    .select({ clockControl: eventTypes.clockControl, wallTime: matchEvents.wallTime })
    .from(matchEvents)
    .innerJoin(eventTypes, eq(matchEvents.eventTypeId, eventTypes.id))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.wallTime));
  const clockOnly: ClockEvent[] = priorClock
    .filter((r) => r.clockControl === 'start' || r.clockControl === 'stop')
    .map((r) => ({ clockControl: r.clockControl, wallTime: r.wallTime }));
  const now = new Date();
  const matchClockSeconds = elapsedSeconds(clockOnly, now);
  const periodNumber = Math.max(1, clockOnly.filter((e) => e.clockControl === 'start').length);

  await db.transaction(async (tx) => {
    await tx.insert(matchEvents).values({
      matchId,
      eventTypeId: subEventType.id,
      wallTime: now,
      matchClockSeconds,
      periodNumber,
      side: 'home',
      // Carry the swap detail in metadata so the timeline can render it
      // without an extra join table.
      metadata: { off: offPlayerIds, on: onPlayerIds },
    });

    await tx
      .update(playerStints)
      .set({ offAtSeconds: matchClockSeconds })
      .where(
        and(
          eq(playerStints.matchId, matchId),
          isNull(playerStints.offAtSeconds),
          inArray(playerStints.playerId, offPlayerIds),
        ),
      );

    await tx.insert(playerStints).values(
      onPlayerIds.map((pid) => ({
        matchId,
        playerId: pid,
        onAtSeconds: matchClockSeconds,
      })),
    );

    await tx.update(matches).set({ updatedAt: now }).where(eq(matches.id, matchId));
  });

  revalidatePath(`/matches/${matchId}/live`);
  revalidatePath(`/matches/${matchId}`);
  return {};
}

function parseSportConfig(raw: unknown): { periodCount: number; periodLengthSeconds: number } {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      periodCount: typeof o.periodCount === 'number' ? o.periodCount : 2,
      periodLengthSeconds: typeof o.periodLengthSeconds === 'number' ? o.periodLengthSeconds : 2700,
    };
  }
  return { periodCount: 2, periodLengthSeconds: 2700 };
}
