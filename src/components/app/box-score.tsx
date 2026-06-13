import { aggregateBoxScore } from '@/domain/box-score';
import type { BoxScoreEventRow } from '@/server/queries/events';

interface BoxScoreProps {
  events: BoxScoreEventRow[];
  homeTeamName: string;
  opponentName: string;
}

/**
 * Final box score for a match: per-home-player stat columns + team totals
 * for both sides. The opponent side rolls up team-only because touchline
 * doesn't track opposing-player rows. Aggregation lives in `src/domain/
 * box-score.ts`.
 */
export function BoxScore({ events, homeTeamName, opponentName }: BoxScoreProps) {
  const box = aggregateBoxScore(events);

  const playerNames = new Map<string, { name: string; number: number | null }>();
  for (const e of events) {
    if (e.playerId && e.playerName) {
      playerNames.set(e.playerId, { name: e.playerName, number: e.playerNumber });
    }
  }

  const playerRows = box.perPlayer
    .map((p) => {
      const meta = playerNames.get(p.playerId);
      return {
        ...p,
        name: meta?.name ?? '—',
        number: meta?.number ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        b.assists - a.assists ||
        b.shots - a.shots ||
        (a.number ?? 999) - (b.number ?? 999),
    );

  return (
    <div className="flex flex-col gap-6">
      <PlayerStatsTable rows={playerRows} />
      <TeamTotalsTable
        homeName={homeTeamName}
        awayName={opponentName}
        home={box.teamTotals.home}
        away={box.teamTotals.away}
      />
    </div>
  );
}

interface PlayerRow {
  playerId: string;
  name: string;
  number: number | null;
  goals: number;
  ownGoals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

function PlayerStatsTable({ rows }: { rows: PlayerRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
        No player stats recorded.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="w-12 px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Player</th>
            <Stat>G</Stat>
            <Stat>OG</Stat>
            <Stat>A</Stat>
            <Stat>Sh</Stat>
            <Stat>SoT</Stat>
            <Stat>F</Stat>
            <Stat>Y</Stat>
            <Stat>R</Stat>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={r.playerId} className="bg-slate-900/30">
              <td className="px-3 py-2 font-mono text-slate-200">{r.number ?? '–'}</td>
              <td className="px-3 py-2 font-semibold text-slate-100">{r.name}</td>
              <Cell>{r.goals}</Cell>
              <Cell muted={r.ownGoals === 0}>{r.ownGoals}</Cell>
              <Cell>{r.assists}</Cell>
              <Cell>{r.shots}</Cell>
              <Cell>{r.shotsOnTarget}</Cell>
              <Cell muted={r.fouls === 0}>{r.fouls}</Cell>
              <Cell muted={r.yellowCards === 0}>{r.yellowCards}</Cell>
              <Cell muted={r.redCards === 0}>{r.redCards}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamTotalsTable({
  homeName,
  awayName,
  home,
  away,
}: {
  homeName: string;
  awayName: string;
  home: ReturnType<typeof aggregateBoxScore>['teamTotals']['home'];
  away: ReturnType<typeof aggregateBoxScore>['teamTotals']['away'];
}) {
  const rows: Array<{ label: string; home: number; away: number }> = [
    { label: 'Goals', home: home.goals, away: away.goals },
    { label: 'Shots', home: home.shots, away: away.shots },
    { label: 'Shots on target', home: home.shotsOnTarget, away: away.shotsOnTarget },
    { label: 'Corners', home: home.corners, away: away.corners },
    { label: 'Saves', home: home.saves, away: away.saves },
    { label: 'Fouls', home: home.fouls, away: away.fouls },
    { label: 'Offsides', home: home.offsides, away: away.offsides },
    { label: 'Yellow cards', home: home.yellowCards, away: away.yellowCards },
    { label: 'Red cards', home: home.redCards, away: away.redCards },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left">Team totals</th>
            <th className="w-32 px-3 py-2 text-right">{homeName}</th>
            <th className="w-32 px-3 py-2 text-right">{awayName}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={r.label} className="bg-slate-900/30">
              <td className="px-3 py-2 text-slate-300">{r.label}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-100">
                {r.home}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-100">
                {r.away}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return <th className="w-12 px-2 py-2 text-right">{children}</th>;
}

function Cell({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      className={`px-2 py-2 text-right font-mono tabular-nums ${
        muted ? 'text-slate-500' : 'text-slate-100'
      }`}
    >
      {children}
    </td>
  );
}
