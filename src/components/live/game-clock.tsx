'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface GameClockProps {
  elapsedAtServerNow: number;
  running: boolean;
  /** Re-render the clock when the server state changes (after revalidation). */
  serverNowMs: number;
  periodLengthSeconds: number;
  currentPeriod: number;
  status: 'setup' | 'live' | 'finished';
}

function format(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Ticks locally at 1Hz while the clock is running. The "current" elapsed
 * value is reconstructed each frame from (server elapsed at render time) +
 * (local ms since mount) to avoid trusting either the client wall clock or
 * the server wall clock in isolation — only their respective deltas matter.
 *
 * When the server re-renders the page after an event, `serverNowMs` changes,
 * which triggers the effect that resets the local mount baseline. The
 * display reconciles to the new server-derived elapsed.
 */
export function GameClock({
  elapsedAtServerNow,
  running,
  serverNowMs,
  periodLengthSeconds,
  currentPeriod,
  status,
}: GameClockProps) {
  // Local time of the most recent server render. Each prop refresh resets it.
  const mountedAtRef = useRef<number>(0);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    mountedAtRef.current = Date.now();
    setNow(Date.now());
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
    // Reset baseline whenever the server renders new state.
  }, [serverNowMs, running]);

  const displayed = useMemo(() => {
    if (!running) return elapsedAtServerNow;
    const ms = now - mountedAtRef.current;
    return elapsedAtServerNow + ms / 1000;
  }, [elapsedAtServerNow, running, now]);

  const periodLabel =
    status === 'finished'
      ? 'Final'
      : status === 'setup'
        ? 'Not started'
        : currentPeriod <= 1
          ? '1st half'
          : currentPeriod === 2
            ? '2nd half'
            : `Period ${currentPeriod}`;

  // Visual cue when we're past the nominal period length (added time).
  const inAddedTime =
    status === 'live' && running && displayed > periodLengthSeconds * currentPeriod;

  return (
    <div className="flex items-center gap-3">
      <div
        className={`font-mono text-5xl tabular-nums leading-none ${
          inAddedTime ? 'text-amber-300' : 'text-slate-50'
        }`}
        aria-live="polite"
      >
        {format(displayed)}
      </div>
      <div className="flex flex-col text-xs uppercase tracking-wide">
        <span className="text-slate-400">{periodLabel}</span>
        <span
          className={`${running ? 'text-emerald-400' : 'text-slate-500'}`}
          aria-label={running ? 'Clock running' : 'Clock stopped'}
        >
          {running ? '● running' : '◯ stopped'}
        </span>
      </div>
    </div>
  );
}
