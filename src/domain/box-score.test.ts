import { describe, it, expect } from 'vitest';
import { aggregateBoxScore } from './box-score';

const ev = (code: string, side: 'home' | 'away' | null, playerId: string | null = null) => ({
  code,
  side,
  playerId,
});

describe('aggregateBoxScore', () => {
  it('returns zero totals for an empty event log', () => {
    const box = aggregateBoxScore([]);
    expect(box.perPlayer).toEqual([]);
    expect(box.teamTotals.home).toEqual({
      goals: 0,
      shots: 0,
      shotsOnTarget: 0,
      corners: 0,
      saves: 0,
      fouls: 0,
      offsides: 0,
      yellowCards: 0,
      redCards: 0,
    });
    expect(box.teamTotals.away).toEqual(box.teamTotals.home);
  });

  it('credits a GOAL to the scoring side and to the player', () => {
    const box = aggregateBoxScore([ev('GOAL', 'home', 'p1')]);
    expect(box.teamTotals.home.goals).toBe(1);
    expect(box.teamTotals.away.goals).toBe(0);
    expect(box.perPlayer).toEqual([
      expect.objectContaining({ playerId: 'p1', goals: 1, ownGoals: 0 }),
    ]);
  });

  it('flips OWN_GOAL team credit to the opposing side but attributes the stat to the player', () => {
    // home player scores on their own net → away gets the goal, home player gets an own_goal stat.
    const box = aggregateBoxScore([ev('OWN_GOAL', 'home', 'p1')]);
    expect(box.teamTotals.home.goals).toBe(0);
    expect(box.teamTotals.away.goals).toBe(1);
    expect(box.perPlayer).toEqual([
      expect.objectContaining({ playerId: 'p1', goals: 0, ownGoals: 1 }),
    ]);
  });

  it('counts assists, yellow cards, and red cards per player', () => {
    const box = aggregateBoxScore([
      ev('ASSIST', 'home', 'p1'),
      ev('YELLOW_CARD', 'home', 'p2'),
      ev('YELLOW_CARD', 'home', 'p2'),
      ev('RED_CARD', 'home', 'p3'),
    ]);
    const byId = new Map(box.perPlayer.map((r) => [r.playerId, r]));
    expect(byId.get('p1')?.assists).toBe(1);
    expect(byId.get('p2')?.yellowCards).toBe(2);
    expect(byId.get('p3')?.redCards).toBe(1);
    // Team totals roll up the cards.
    expect(box.teamTotals.home.yellowCards).toBe(2);
    expect(box.teamTotals.home.redCards).toBe(1);
  });

  it('rolls SHOT and SHOT_ON_TARGET into team totals and per-player rows', () => {
    const box = aggregateBoxScore([
      ev('SHOT', 'home', 'p1'),
      ev('SHOT_ON_TARGET', 'home', 'p1'),
      ev('SHOT', 'home', 'p2'),
    ]);
    expect(box.teamTotals.home.shots).toBe(3);
    expect(box.teamTotals.home.shotsOnTarget).toBe(1);
    const p1 = box.perPlayer.find((r) => r.playerId === 'p1');
    expect(p1?.shots).toBe(2);
    expect(p1?.shotsOnTarget).toBe(1);
  });

  it('counts team-only stats with no player attribution (corner, save, offside)', () => {
    const box = aggregateBoxScore([
      ev('CORNER', 'home', null),
      ev('CORNER', 'home', null),
      ev('SAVE', 'home', null),
      ev('OFFSIDE', 'away', null),
    ]);
    expect(box.teamTotals.home.corners).toBe(2);
    expect(box.teamTotals.home.saves).toBe(1);
    expect(box.teamTotals.away.offsides).toBe(1);
    expect(box.perPlayer).toEqual([]); // no player_id → no per-player row
  });

  it('counts the away side independently', () => {
    const box = aggregateBoxScore([
      ev('GOAL', 'home', 'p1'),
      ev('GOAL', 'away', null), // opponent goals carry no player id
      ev('SHOT', 'away', null),
      ev('YELLOW_CARD', 'away', null),
    ]);
    expect(box.teamTotals.home.goals).toBe(1);
    expect(box.teamTotals.away.goals).toBe(1);
    expect(box.teamTotals.away.shots).toBe(1);
    expect(box.teamTotals.away.yellowCards).toBe(1);
  });

  it('ignores clock-control and substitution events (they belong to other tables)', () => {
    const box = aggregateBoxScore([
      ev('KICKOFF', 'home', null),
      ev('HALF_TIME', null, null),
      ev('SUBSTITUTION', 'home', null),
      ev('FULL_TIME', null, null),
    ]);
    expect(box.perPlayer).toEqual([]);
    expect(box.teamTotals.home.goals).toBe(0);
  });

  it('aggregates multiple events per player in a single pass', () => {
    const box = aggregateBoxScore([
      ev('GOAL', 'home', 'p1'),
      ev('GOAL', 'home', 'p1'),
      ev('ASSIST', 'home', 'p1'),
      ev('SHOT', 'home', 'p1'),
      ev('SHOT', 'home', 'p1'),
      ev('YELLOW_CARD', 'home', 'p1'),
    ]);
    expect(box.perPlayer).toHaveLength(1);
    const p1 = box.perPlayer[0];
    expect(p1).toMatchObject({
      playerId: 'p1',
      goals: 2,
      assists: 1,
      shots: 2,
      yellowCards: 1,
    });
  });
});
