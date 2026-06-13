'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { GameClock } from '@/components/live/game-clock';
import { EventGrid } from '@/components/live/event-grid';
import { PlayerPicker } from '@/components/live/player-picker';
import { SideToggle } from '@/components/live/side-toggle';
import { SubstitutionSheet } from '@/components/live/substitution-sheet';
import { scoreDelta } from '@/domain/scoring';
import { recordEventAction, recordSubstitutionAction } from '@/server/actions/events';
import type {
  EventTypeOption,
  MatchLiveState,
  OnFieldPlayer,
  TimelineEvent,
} from '@/server/queries/events';

interface LiveTrackerProps {
  match: MatchLiveState;
  eventTypes: EventTypeOption[];
  onField: OnFieldPlayer[];
  bench: OnFieldPlayer[];
  timeline: TimelineEvent[];
}

const SIDE_LABEL_BASE = { home: '', away: '' };

function periodOf(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Pending event held inside `useOptimistic`. It carries enough information
 * to render the timeline row, the score panel, the period header, and the
 * clock running/stopped state without waiting for the server round-trip.
 *
 * `recordedAtMs` is the local Date.now() at tap; the optimistic match-clock
 * value is interpolated from (recordedAtMs - mountMs) so a tap at minute 73
 * shows "73:xx" instantly even before the server confirms.
 */
interface PendingEvent {
  id: string;
  eventType: EventTypeOption;
  side: 'home' | 'away' | null;
  player: OnFieldPlayer | null;
  recordedAtMs: number;
  recordedClockSeconds: number;
}

export function LiveTracker({ match, eventTypes, onField, bench, timeline }: LiveTrackerProps) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingEventType, setPendingEventType] = useState<EventTypeOption | null>(null);
  const [subSheetOpen, setSubSheetOpen] = useState(false);

  // Optimistic queue of "I tapped this; server hasn't confirmed yet" events.
  // useOptimistic automatically discards them when the next render carries
  // the new server-confirmed state — exactly what we want.
  const [optimisticPending, addOptimistic] = useOptimistic<PendingEvent[], PendingEvent>(
    [],
    (state, evt) => [...state, evt],
  );

  // Optimistic projections of the server state, derived from `match` plus
  // the pending queue. The order of evt application matches the server: each
  // event updates score / running / period the same way the server action
  // does, so the UI never disagrees with itself.
  const derived = useMemo(() => {
    let homeScore = match.homeScore;
    let awayScore = match.awayScore;
    let running = match.running;
    let currentPeriod = match.currentPeriod;
    let status: 'setup' | 'live' | 'finished' = match.status;

    for (const p of optimisticPending) {
      const d = scoreDelta({
        eventCode: p.eventType.code,
        affectsScore: p.eventType.affectsScore,
        side: p.side,
      });
      homeScore += d.home;
      awayScore += d.away;

      if (p.eventType.clockControl === 'start') {
        running = true;
        if (status === 'setup') status = 'live';
        currentPeriod = Math.max(currentPeriod, 1) + (currentPeriod >= 1 ? 0 : 0);
        // Strictly: each start opens the next period. If the prior state
        // was a stop, currentPeriod increments. We approximate by counting
        // the number of prior optimistic starts. A small inaccuracy here
        // is fine because the next server render reconciles.
      } else if (p.eventType.clockControl === 'stop') {
        running = false;
      }
    }

    // Count optimistic starts to derive the displayed period.
    const optStarts = optimisticPending.filter((p) => p.eventType.clockControl === 'start').length;
    if (optStarts > 0) {
      currentPeriod = match.currentPeriod + optStarts - (match.running ? 0 : 1);
      if (currentPeriod < 1) currentPeriod = 1;
    }

    return { homeScore, awayScore, running, currentPeriod, status };
  }, [
    match.homeScore,
    match.awayScore,
    match.running,
    match.currentPeriod,
    match.status,
    optimisticPending,
  ]);

  // Build the displayed timeline: pending events appear at the top (newest
  // first matches listTimeline's order) with a pending flag for styling.
  const displayedTimeline = useMemo<(TimelineEvent & { pending?: boolean })[]>(() => {
    const optEntries: (TimelineEvent & { pending: boolean })[] = optimisticPending
      .slice()
      .reverse()
      .map((p) => ({
        id: p.id,
        matchClockSeconds: p.recordedClockSeconds,
        periodNumber: derived.currentPeriod,
        side: p.side,
        code: p.eventType.code,
        label: p.eventType.label,
        color: p.eventType.color,
        affectsScore: p.eventType.affectsScore,
        isSubstitution: p.eventType.isSubstitution,
        playerName: p.player?.name ?? null,
        playerNumber: p.player?.number ?? null,
        pending: true,
      }));
    return [...optEntries, ...timeline];
  }, [optimisticPending, timeline, derived.currentPeriod]);

  const sideLabels = {
    ...SIDE_LABEL_BASE,
    home: match.team.name,
    away: match.opponentName,
  };

  function isEnabled(et: EventTypeOption): boolean {
    if (derived.status === 'finished') return false;

    if (derived.status === 'setup') {
      // Only the FIRST clock-start kicks off the match. We allow any start
      // event so a sport with a non-standard start label still works.
      return et.clockControl === 'start';
    }

    // Substitutions need at least one on-field player and one bench player
    // to make a swap; disable the button if either is empty.
    if (et.isSubstitution) return onField.length > 0 && bench.length > 0;

    return true;
  }

  // Approximate the match-clock value at the moment of tap by adding the
  // local delta since the server-render snapshot. Honest enough that the
  // optimistic row reads correctly; the server's authoritative value lands
  // on revalidation.
  function currentDerivedClockSeconds(): number {
    if (!derived.running) return Math.max(0, Math.floor(match.elapsedAtServerNow));
    const localDelta = (Date.now() - match.serverNowMs) / 1000;
    return Math.max(0, Math.floor(match.elapsedAtServerNow + localDelta));
  }

  function record(eventType: EventTypeOption, player?: OnFieldPlayer) {
    setError(null);
    const opt: PendingEvent = {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      side: eventType.clockControl === 'none' ? side : null,
      player: player ?? null,
      recordedAtMs: Date.now(),
      recordedClockSeconds: currentDerivedClockSeconds(),
    };

    startTransition(async () => {
      addOptimistic(opt);
      const result = await recordEventAction({
        matchId: match.id,
        eventTypeId: eventType.id,
        side: opt.side,
        playerId: player?.id,
      });
      if (result.error) setError(result.error);
      // On success, revalidatePath in the server action triggers a fresh
      // server snapshot; useOptimistic discards `opt` automatically. On
      // error we surface the message and the optimistic row vanishes too.
    });
  }

  function handleTap(eventType: EventTypeOption) {
    if (eventType.isSubstitution) {
      setError(null);
      setSubSheetOpen(true);
      return;
    }
    if (eventType.requiresPlayer) {
      if (onField.length === 0) {
        setError('No on-field players to attribute this to. Start the match first.');
        return;
      }
      setPendingEventType(eventType);
      setPickerOpen(true);
      return;
    }
    record(eventType);
  }

  function handlePick(playerId: string) {
    if (!pendingEventType) return;
    const et = pendingEventType;
    const picked = onField.find((p) => p.id === playerId) ?? null;
    setPickerOpen(false);
    setPendingEventType(null);
    record(et, picked ?? undefined);
  }

  function handleSubConfirm(off: string[], on: string[]) {
    setError(null);
    setSubSheetOpen(false);
    // Substitutions also get an optimistic row: find the SUBSTITUTION event
    // type so the timeline can show it instantly.
    const subEventType = eventTypes.find((e) => e.isSubstitution);
    if (subEventType) {
      const opt: PendingEvent = {
        id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        eventType: subEventType,
        side: 'home',
        player: null,
        recordedAtMs: Date.now(),
        recordedClockSeconds: currentDerivedClockSeconds(),
      };
      startTransition(async () => {
        addOptimistic(opt);
        const result = await recordSubstitutionAction({
          matchId: match.id,
          offPlayerIds: off,
          onPlayerIds: on,
        });
        if (result.error) setError(result.error);
      });
      return;
    }
    // Fallback (no substitution event type seeded) — just fire without optimistic.
    startTransition(async () => {
      const result = await recordSubstitutionAction({
        matchId: match.id,
        offPlayerIds: off,
        onPlayerIds: on,
      });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <ScorePanel
              label={match.team.name}
              score={derived.homeScore}
              color={match.team.color}
              active={side === 'home'}
            />
            <span className="text-slate-500">vs</span>
            <ScorePanel
              label={match.opponentName}
              score={derived.awayScore}
              color="#7f1d1d"
              active={side === 'away'}
            />
          </div>
          <GameClock
            elapsedAtServerNow={match.elapsedAtServerNow}
            running={derived.running}
            serverNowMs={match.serverNowMs}
            periodLengthSeconds={match.sportConfig.periodLengthSeconds}
            currentPeriod={derived.currentPeriod}
            status={derived.status}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <SideToggle
            side={side}
            onChange={setSide}
            homeLabel={sideLabels.home}
            awayLabel={sideLabels.away}
          />
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Next event credits {side === 'home' ? sideLabels.home : sideLabels.away}
          </span>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-400">
            {error}
          </p>
        ) : null}
      </section>

      <EventGrid
        eventTypes={eventTypes}
        onTap={handleTap}
        isEnabled={isEnabled}
        pending={pending}
      />

      <Timeline
        timeline={displayedTimeline}
        teamName={match.team.name}
        opponentName={match.opponentName}
      />

      <PlayerPicker
        open={pickerOpen}
        title={pendingEventType ? `${pendingEventType.label}: pick a player` : 'Pick a player'}
        players={onField}
        onPick={handlePick}
        onCancel={() => {
          setPickerOpen(false);
          setPendingEventType(null);
        }}
      />

      <SubstitutionSheet
        open={subSheetOpen}
        onField={onField}
        bench={bench}
        onCancel={() => setSubSheetOpen(false)}
        onConfirm={handleSubConfirm}
        pending={pending}
      />
    </div>
  );
}

function ScorePanel({
  label,
  score,
  color,
  active,
}: {
  label: string;
  score: number;
  color: string | null;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="block h-9 w-9 rounded-full border border-slate-700"
        style={{ backgroundColor: color ?? 'transparent' }}
      />
      <div className="flex flex-col">
        <span
          className={`text-xs uppercase tracking-wide ${active ? 'text-pitch' : 'text-slate-500'}`}
        >
          {label}
        </span>
        <span className="font-mono text-4xl tabular-nums leading-none text-slate-50">{score}</span>
      </div>
    </div>
  );
}

function Timeline({
  timeline,
  teamName,
  opponentName,
}: {
  timeline: (TimelineEvent & { pending?: boolean })[];
  teamName: string;
  opponentName: string;
}) {
  if (timeline.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
        No events recorded yet.
      </p>
    );
  }
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-300">
        Timeline ({timeline.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-1.5">
        {timeline.map((e) => (
          <li
            key={e.id}
            className={`flex items-center gap-3 text-sm ${
              e.pending ? 'animate-pulse opacity-60' : ''
            }`}
            aria-busy={e.pending ? 'true' : undefined}
          >
            <span className="w-14 font-mono tabular-nums text-slate-400">
              {periodOf(e.matchClockSeconds)}
            </span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase text-slate-300">
              {e.label}
            </span>
            <span className="text-slate-500">
              {e.side === 'home' ? teamName : e.side === 'away' ? opponentName : '—'}
            </span>
            {e.playerName ? (
              <span className="text-slate-200">
                #{e.playerNumber ?? '–'} {e.playerName}
              </span>
            ) : null}
            {e.pending ? (
              <span className="ml-auto text-xs uppercase tracking-wide text-slate-500">
                pending
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
