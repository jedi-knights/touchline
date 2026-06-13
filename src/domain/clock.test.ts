import { describe, expect, it } from 'vitest';
import { elapsedSeconds, isClockRunning, type ClockEvent } from './clock';

const at = (isoOrMs: string | number): Date => new Date(isoOrMs);

const start = (t: string | number): ClockEvent => ({ clockControl: 'start', wallTime: at(t) });
const stop = (t: string | number): ClockEvent => ({ clockControl: 'stop', wallTime: at(t) });
const none = (t: string | number): ClockEvent => ({ clockControl: 'none', wallTime: at(t) });

describe('elapsedSeconds', () => {
  it('is 0 with no events', () => {
    expect(elapsedSeconds([], at('2026-06-13T12:00:00Z'))).toBe(0);
  });

  it('ignores events whose clockControl is "none"', () => {
    const events = [none('2026-06-13T12:00:00Z'), none('2026-06-13T12:30:00Z')];
    expect(elapsedSeconds(events, at('2026-06-13T13:00:00Z'))).toBe(0);
  });

  it('counts time since a single start while running', () => {
    const events = [start('2026-06-13T12:00:00Z')];
    expect(elapsedSeconds(events, at('2026-06-13T12:00:30Z'))).toBe(30);
  });

  it('closes a period on stop', () => {
    const events = [start('2026-06-13T12:00:00Z'), stop('2026-06-13T12:45:00Z')];
    expect(elapsedSeconds(events, at('2026-06-13T13:00:00Z'))).toBe(45 * 60);
  });

  it('sums multiple completed periods', () => {
    const events = [
      start('2026-06-13T12:00:00Z'),
      stop('2026-06-13T12:45:00Z'),
      start('2026-06-13T13:00:00Z'),
      stop('2026-06-13T13:45:00Z'),
    ];
    expect(elapsedSeconds(events, at('2026-06-13T14:00:00Z'))).toBe(90 * 60);
  });

  it('adds a running second-half segment', () => {
    const events = [
      start('2026-06-13T12:00:00Z'),
      stop('2026-06-13T12:45:00Z'),
      start('2026-06-13T13:00:00Z'),
    ];
    // First half = 2700s; running 15 minutes into the second.
    expect(elapsedSeconds(events, at('2026-06-13T13:15:00Z'))).toBe(2700 + 15 * 60);
  });

  it('ignores duplicate starts while already running (idempotent double-tap)', () => {
    const events = [
      start('2026-06-13T12:00:00Z'),
      start('2026-06-13T12:00:05Z'),
      stop('2026-06-13T12:00:30Z'),
    ];
    expect(elapsedSeconds(events, at('2026-06-13T12:01:00Z'))).toBe(30);
  });

  it('ignores stops issued while the clock is already stopped', () => {
    const events = [stop('2026-06-13T12:00:00Z'), start('2026-06-13T12:00:10Z')];
    expect(elapsedSeconds(events, at('2026-06-13T12:00:40Z'))).toBe(30);
  });

  it('returns 0 if `now` precedes the open start (clock skew safety)', () => {
    const events = [start('2026-06-13T12:00:30Z')];
    expect(elapsedSeconds(events, at('2026-06-13T12:00:00Z'))).toBe(0);
  });

  it('truncates fractional seconds to a whole number', () => {
    const events = [start('2026-06-13T12:00:00.000Z')];
    expect(elapsedSeconds(events, at('2026-06-13T12:00:00.999Z'))).toBe(0);
    expect(elapsedSeconds(events, at('2026-06-13T12:00:01.500Z'))).toBe(1);
  });
});

describe('isClockRunning', () => {
  it('false on empty', () => {
    expect(isClockRunning([])).toBe(false);
  });

  it('true after a start', () => {
    expect(isClockRunning([start('2026-06-13T12:00:00Z')])).toBe(true);
  });

  it('false after a start/stop pair', () => {
    expect(isClockRunning([start('2026-06-13T12:00:00Z'), stop('2026-06-13T12:45:00Z')])).toBe(
      false,
    );
  });

  it('true after start/stop/start', () => {
    expect(
      isClockRunning([
        start('2026-06-13T12:00:00Z'),
        stop('2026-06-13T12:45:00Z'),
        start('2026-06-13T13:00:00Z'),
      ]),
    ).toBe(true);
  });
});
