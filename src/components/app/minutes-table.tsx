import { minutesPlayed } from '@/domain/minutes';
import type { StintWithPlayer } from '@/server/queries/events';

interface MinutesTableProps {
  stints: StintWithPlayer[];
  /**
   * Clock value at which still-open stints are closed for display purposes.
   * For finished matches this is the final whistle; for live matches it's
   * the current derived elapsed; for setup it's 0 (no stints exist yet).
   */
  finalClockSeconds: number;
  /** "Live" if the match is still in progress, "Final" once finished. */
  asOfLabel: string;
}

/**
 * Minutes per player, computed via the pure `minutesPlayed()` from
 * `src/domain/minutes.ts`. Sorted by minutes desc, then by jersey number asc.
 * Sport-agnostic — soccer doesn't get special treatment here.
 */
export function MinutesTable({ stints, finalClockSeconds, asOfLabel }: MinutesTableProps) {
  if (stints.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
        No minutes recorded yet.
      </p>
    );
  }

  const minutesByPlayer = new Map(
    minutesPlayed(stints, finalClockSeconds).map((row) => [row.playerId, row]),
  );

  // Group stint info by player so the table has one row per player.
  const players = new Map<string, { name: string; number: number | null }>();
  for (const s of stints) {
    players.set(s.playerId, { name: s.playerName, number: s.playerNumber });
  }

  const rows = [...players.entries()]
    .map(([playerId, p]) => {
      const m = minutesByPlayer.get(playerId);
      return {
        playerId,
        name: p.name,
        number: p.number,
        seconds: m?.seconds ?? 0,
        minutes: m?.minutes ?? 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes || (a.number ?? 999) - (b.number ?? 999));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="w-14 px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Player</th>
            <th className="w-24 px-3 py-2 text-right">Minutes</th>
            <th className="w-32 px-3 py-2 text-right">{asOfLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={r.playerId} className="bg-slate-900/30">
              <td className="px-3 py-2 font-mono text-slate-200">{r.number ?? '–'}</td>
              <td className="px-3 py-2 font-semibold text-slate-100">{r.name}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-100">
                {r.minutes}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-500">
                {r.seconds}s
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
