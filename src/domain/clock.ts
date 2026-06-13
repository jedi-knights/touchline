/**
 * Derived game clock.
 *
 * The match clock is NEVER a free-running counter. Elapsed seconds at any
 * instant are recomputed from immutable clock-control events (`start` / `stop`)
 * in chronological order. A refresh or reconnect at the 73rd minute re-derives
 * the same value from the database.
 *
 * Inputs are plain data — no Drizzle or Next.js imports. These functions are
 * the only domain logic that decides "what time is it on the match clock?".
 */

export type ClockControl = 'start' | 'stop' | 'none';

export interface ClockEvent {
  /** Whether this event opens, closes, or has no effect on the clock. */
  clockControl: ClockControl;
  /** Wall-clock time at which the event was recorded. */
  wallTime: Date;
}

/**
 * Walk the events in time order and reduce them to (running, openSince).
 * O(n) single pass; ignores extra `start` while already running and extra
 * `stop` while not running so accidental double-taps don't break the clock.
 */
function reduceClock(events: readonly ClockEvent[]): {
  running: boolean;
  openSince: Date | null;
  closedSeconds: number;
} {
  let closedSeconds = 0;
  let openSince: Date | null = null;

  for (const ev of events) {
    if (ev.clockControl === 'start') {
      if (openSince === null) openSince = ev.wallTime;
    } else if (ev.clockControl === 'stop') {
      if (openSince !== null) {
        closedSeconds += (ev.wallTime.getTime() - openSince.getTime()) / 1000;
        openSince = null;
      }
    }
  }

  return { running: openSince !== null, openSince, closedSeconds };
}

/**
 * Elapsed match-clock seconds at `now`, given all prior clock-control events.
 *
 * `now` is required (not defaulted) so callers must pass the same reference
 * time used elsewhere in their request — keeps tests deterministic and avoids
 * accidental drift between displayed and stored values.
 *
 * Returns a non-negative integer. Out-of-order events are tolerated: if a
 * stop precedes its start due to clock skew, the segment is clamped to zero.
 */
export function elapsedSeconds(events: readonly ClockEvent[], now: Date): number {
  const { openSince, closedSeconds } = reduceClock(events);
  const openSeconds = openSince === null ? 0 : (now.getTime() - openSince.getTime()) / 1000;
  const total = closedSeconds + Math.max(0, openSeconds);
  return Math.max(0, Math.floor(total));
}

/** Whether the clock is currently running. O(n) single pass. */
export function isClockRunning(events: readonly ClockEvent[]): boolean {
  return reduceClock(events).running;
}
