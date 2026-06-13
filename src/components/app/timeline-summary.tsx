import { formatClock } from '@/lib/utils';
import type { TimelineEvent } from '@/server/queries/events';

interface TimelineSummaryProps {
  events: TimelineEvent[];
  homeTeamName: string;
  opponentName: string;
}

/**
 * Read-only timeline rendered server-side. Events are chronological (oldest
 * first) so a reader can scan from kickoff to whistle. Substitution metadata
 * is rendered when present — playerName/playerNumber on the row reflects the
 * primary actor (scorer, booked player); subs put their lists in metadata.
 */
export function TimelineSummary({ events, homeTeamName, opponentName }: TimelineSummaryProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
        No events recorded yet.
      </p>
    );
  }

  // Oldest → newest. listTimeline returns newest-first; reverse a copy.
  const chrono = [...events].reverse();

  return (
    <ol className="flex flex-col gap-1.5">
      {chrono.map((e) => (
        <li
          key={e.id}
          className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
        >
          <span className="w-14 shrink-0 font-mono tabular-nums text-slate-400">
            {formatClock(e.matchClockSeconds)}
          </span>
          <span className="w-32 shrink-0">
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
              {e.label}
            </span>
          </span>
          <span className="w-32 shrink-0 text-slate-500">
            {e.side === 'home' ? homeTeamName : e.side === 'away' ? opponentName : '—'}
          </span>
          <span className="flex-1 text-slate-200">
            {e.playerName ? (
              <>
                #{e.playerNumber ?? '–'} {e.playerName}
              </>
            ) : null}
            {e.affectsScore > 0 && e.side ? (
              <span className="ml-2 rounded bg-emerald-900/40 px-1.5 py-0.5 text-xs font-semibold text-emerald-300">
                +{e.affectsScore}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
