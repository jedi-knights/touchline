import { describe, expect, it } from 'vitest';
import { aggregateScore, scoreDelta, type ScoringEvent } from './scoring';

const ev = (eventCode: string, affectsScore: number, side: ScoringEvent['side']): ScoringEvent => ({
  eventCode,
  affectsScore,
  side,
});

describe('scoreDelta', () => {
  it('non-scoring events produce no change', () => {
    expect(scoreDelta(ev('YELLOW_CARD', 0, 'home'))).toEqual({ home: 0, away: 0 });
  });

  it('system events with no side produce no change', () => {
    expect(scoreDelta(ev('KICKOFF', 0, null))).toEqual({ home: 0, away: 0 });
    expect(scoreDelta(ev('GOAL', 1, null))).toEqual({ home: 0, away: 0 });
  });

  it('home goal credits home', () => {
    expect(scoreDelta(ev('GOAL', 1, 'home'))).toEqual({ home: 1, away: 0 });
  });

  it('away goal credits away', () => {
    expect(scoreDelta(ev('GOAL', 1, 'away'))).toEqual({ home: 0, away: 1 });
  });

  it('own goal flips credit to the opposing side (home actor → away credit)', () => {
    expect(scoreDelta(ev('OWN_GOAL', 1, 'home'))).toEqual({ home: 0, away: 1 });
  });

  it('own goal flips credit to the opposing side (away actor → home credit)', () => {
    expect(scoreDelta(ev('OWN_GOAL', 1, 'away'))).toEqual({ home: 1, away: 0 });
  });
});

describe('aggregateScore', () => {
  it('empty input yields 0–0', () => {
    expect(aggregateScore([])).toEqual({ home: 0, away: 0 });
  });

  it('sums a mixed timeline correctly', () => {
    const events: ScoringEvent[] = [
      ev('KICKOFF', 0, null),
      ev('GOAL', 1, 'home'),
      ev('YELLOW_CARD', 0, 'away'),
      ev('GOAL', 1, 'home'),
      ev('OWN_GOAL', 1, 'home'), // counts for away
      ev('GOAL', 1, 'away'),
    ];
    expect(aggregateScore(events)).toEqual({ home: 2, away: 2 });
  });

  it('ignores affectsScore=0 even when side is set', () => {
    const events: ScoringEvent[] = [
      ev('SHOT', 0, 'home'),
      ev('SHOT_ON_TARGET', 0, 'home'),
      ev('SAVE', 0, 'away'),
    ];
    expect(aggregateScore(events)).toEqual({ home: 0, away: 0 });
  });
});
