/**
 * Minutes played, derived from player_stint rows.
 *
 * Each stint is `[onAtSeconds, offAtSeconds | null]` on the match clock. An
 * open stint (offAtSeconds === null) is closed at `finalClockSeconds` — used
 * both for the in-progress display and the match-end summary.
 *
 * O(n) single pass over stints with a hash map; no sort, no nested loops.
 */

export interface Stint {
  playerId: string;
  onAtSeconds: number;
  /** null while the player is still on the field. */
  offAtSeconds: number | null;
}

export interface MinutesPlayed {
  playerId: string;
  seconds: number;
  minutes: number;
}

/**
 * Aggregate seconds per player across one or more stints, treating open stints
 * as closing at `finalClockSeconds`. Negative segments are clamped to zero so
 * malformed inputs cannot produce negative minutes.
 */
export function minutesPlayed(
  stints: readonly Stint[],
  finalClockSeconds: number,
): MinutesPlayed[] {
  const byPlayer = new Map<string, number>();

  for (const s of stints) {
    const off = s.offAtSeconds ?? finalClockSeconds;
    const seconds = Math.max(0, off - s.onAtSeconds);
    byPlayer.set(s.playerId, (byPlayer.get(s.playerId) ?? 0) + seconds);
  }

  const result: MinutesPlayed[] = [];
  for (const [playerId, seconds] of byPlayer) {
    result.push({ playerId, seconds, minutes: Math.round(seconds / 60) });
  }
  return result;
}
