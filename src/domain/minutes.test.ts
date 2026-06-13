import { describe, expect, it } from 'vitest';
import { minutesPlayed, type Stint } from './minutes';

const byId = (rows: { playerId: string; seconds: number; minutes: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.playerId, r]));

describe('minutesPlayed', () => {
  it('returns an empty array when there are no stints', () => {
    expect(minutesPlayed([], 5400)).toEqual([]);
  });

  it('closes an open stint at finalClockSeconds', () => {
    const stints: Stint[] = [{ playerId: 'p1', onAtSeconds: 0, offAtSeconds: null }];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.p1).toEqual({ playerId: 'p1', seconds: 5400, minutes: 90 });
  });

  it('uses offAtSeconds for closed stints', () => {
    const stints: Stint[] = [{ playerId: 'p1', onAtSeconds: 0, offAtSeconds: 1800 }];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.p1).toEqual({ playerId: 'p1', seconds: 1800, minutes: 30 });
  });

  it('sums multiple stints for the same player (subbed off then back on)', () => {
    const stints: Stint[] = [
      { playerId: 'p1', onAtSeconds: 0, offAtSeconds: 1800 },
      { playerId: 'p1', onAtSeconds: 3600, offAtSeconds: null },
    ];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.p1).toEqual({ playerId: 'p1', seconds: 1800 + 1800, minutes: 60 });
  });

  it('handles a starter swap: starter off, sub on at the same instant', () => {
    const stints: Stint[] = [
      { playerId: 'starter', onAtSeconds: 0, offAtSeconds: 2700 },
      { playerId: 'sub', onAtSeconds: 2700, offAtSeconds: null },
    ];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.starter).toEqual({ playerId: 'starter', seconds: 2700, minutes: 45 });
    expect(result.sub).toEqual({ playerId: 'sub', seconds: 2700, minutes: 45 });
  });

  it('omits players who never had a stint', () => {
    const stints: Stint[] = [{ playerId: 'p1', onAtSeconds: 0, offAtSeconds: 1000 }];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.p2).toBeUndefined();
  });

  it('clamps negative durations to zero rather than emitting negative time', () => {
    const stints: Stint[] = [{ playerId: 'p1', onAtSeconds: 2000, offAtSeconds: 1000 }];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.p1).toEqual({ playerId: 'p1', seconds: 0, minutes: 0 });
  });

  it('rounds seconds to the nearest minute', () => {
    const stints: Stint[] = [
      { playerId: 'a', onAtSeconds: 0, offAtSeconds: 89 }, // 1.48m → 1
      { playerId: 'b', onAtSeconds: 0, offAtSeconds: 90 }, // 1.50m → 2
    ];
    const result = byId(minutesPlayed(stints, 5400));
    expect(result.a?.minutes).toBe(1);
    expect(result.b?.minutes).toBe(2);
  });
});
