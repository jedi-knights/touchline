'use client';

import { useState, useTransition } from 'react';
import { GameClock } from '@/components/live/game-clock';
import { EventGrid } from '@/components/live/event-grid';
import { PlayerPicker } from '@/components/live/player-picker';
import { SideToggle } from '@/components/live/side-toggle';
import { SubstitutionSheet } from '@/components/live/substitution-sheet';
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

export function LiveTracker({ match, eventTypes, onField, bench, timeline }: LiveTrackerProps) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingEventType, setPendingEventType] = useState<EventTypeOption | null>(null);
  const [subSheetOpen, setSubSheetOpen] = useState(false);

  const sideLabels = {
    ...SIDE_LABEL_BASE,
    home: match.team.name,
    away: match.opponentName,
  };

  function isEnabled(et: EventTypeOption): boolean {
    if (match.status === 'finished') return false;

    if (match.status === 'setup') {
      // Only the FIRST clock-start kicks off the match. We allow any start
      // event so a sport with a non-standard start label still works.
      return et.clockControl === 'start';
    }

    // Substitutions need at least one on-field player and one bench player
    // to make a swap; disable the button if either is empty.
    if (et.isSubstitution) return onField.length > 0 && bench.length > 0;

    return true;
  }

  function record(eventType: EventTypeOption, playerId?: string) {
    setError(null);
    startTransition(async () => {
      const result = await recordEventAction({
        matchId: match.id,
        eventTypeId: eventType.id,
        side: eventType.clockControl === 'none' ? side : null,
        playerId,
      });
      if (result.error) setError(result.error);
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
    setPickerOpen(false);
    setPendingEventType(null);
    record(et, playerId);
  }

  function handleSubConfirm(off: string[], on: string[]) {
    setError(null);
    setSubSheetOpen(false);
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
              score={match.homeScore}
              color={match.team.color}
              active={side === 'home'}
            />
            <span className="text-slate-500">vs</span>
            <ScorePanel
              label={match.opponentName}
              score={match.awayScore}
              color="#7f1d1d"
              active={side === 'away'}
            />
          </div>
          <GameClock
            elapsedAtServerNow={match.elapsedAtServerNow}
            running={match.running}
            serverNowMs={match.serverNowMs}
            periodLengthSeconds={match.sportConfig.periodLengthSeconds}
            currentPeriod={match.currentPeriod}
            status={match.status}
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

      <Timeline timeline={timeline} teamName={match.team.name} opponentName={match.opponentName} />

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
  timeline: TimelineEvent[];
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
          <li key={e.id} className="flex items-center gap-3 text-sm">
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
          </li>
        ))}
      </ul>
    </details>
  );
}
