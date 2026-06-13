import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmForm } from '@/components/app/confirm-form';
import { MinutesTable } from '@/components/app/minutes-table';
import { TimelineSummary } from '@/components/app/timeline-summary';
import { deleteMatchAction } from '@/server/actions/matches';
import { getMatchLiveState, listStintsForMatch, listTimeline } from '@/server/queries/events';
import { getBenchForMatch, getLineupForMatch, type LineupEntry } from '@/server/queries/matches';
import { requireUser } from '@/server/session';

interface PageProps {
  params: Promise<{ matchId: string }>;
}

const STATUS_LABEL: Record<'setup' | 'live' | 'finished', { label: string; classes: string }> = {
  setup: { label: 'Setup', classes: 'bg-slate-700 text-slate-200' },
  live: { label: 'Live', classes: 'bg-emerald-600 text-white' },
  finished: { label: 'Final', classes: 'bg-slate-800 text-slate-300' },
};

function PlayerPill({ player }: { player: LineupEntry }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 font-mono text-sm text-slate-200">
        {player.number ?? '–'}
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-base font-semibold text-slate-100">{player.name}</span>
        {player.position ? <span className="text-xs text-slate-400">{player.position}</span> : null}
      </span>
    </li>
  );
}

export default async function MatchDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const { matchId } = await params;

  const match = await getMatchLiveState(matchId, user.id);
  if (!match) notFound();

  const [lineup, bench, stints, timeline] = await Promise.all([
    getLineupForMatch(match.id),
    getBenchForMatch(match.id, match.team.id),
    listStintsForMatch(match.id),
    listTimeline(match.id),
  ]);

  const status = STATUS_LABEL[match.status];
  // For minutes display: open stints close at the current derived elapsed
  // (which keeps ticking on a live page, but is frozen at the final whistle
  // on a finished match because the clock-control event log has no open
  // period after Full Time).
  const finalClockSeconds = match.elapsedAtServerNow;
  const asOfLabel =
    match.status === 'finished' ? 'At full time' : match.status === 'live' ? 'As of now' : '—';

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/matches" className="text-sm text-slate-400 hover:text-slate-200">
            ← Back to matches
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {match.team.name} <span className="text-slate-500">vs</span> {match.opponentName}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${status.classes}`}
            >
              {status.label}
            </span>
            <span className="font-mono text-2xl tabular-nums text-slate-100">
              {match.homeScore} – {match.awayScore}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {match.status !== 'finished' ? (
            <Link href={`/matches/${match.id}/live`}>
              <Button>
                {match.status === 'setup' ? 'Open live tracker' : 'Resume live tracker'}
              </Button>
            </Link>
          ) : null}
          <ConfirmForm
            action={deleteMatchAction}
            message={`Delete this match? Events and lineup will be removed too. This can't be undone.`}
          >
            <input type="hidden" name="id" value={match.id} />
            <Button type="submit" variant="ghost" className="text-rose-300 hover:bg-rose-950/40">
              Delete match
            </Button>
          </ConfirmForm>
        </div>
      </header>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Timeline <span className="text-sm font-normal text-slate-400">({timeline.length})</span>
        </h2>
        <TimelineSummary
          events={timeline}
          homeTeamName={match.team.name}
          opponentName={match.opponentName}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Minutes played</h2>
        <MinutesTable stints={stints} finalClockSeconds={finalClockSeconds} asOfLabel={asOfLabel} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Starting lineup{' '}
            <span className="text-sm font-normal text-slate-400">({lineup.length})</span>
          </h2>
          {lineup.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
              No starters picked.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lineup.map((p) => (
                <PlayerPill key={p.id} player={p} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Bench <span className="text-sm font-normal text-slate-400">({bench.length})</span>
          </h2>
          {bench.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
              No bench players — every active player is in the starting lineup.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {bench.map((p) => (
                <PlayerPill key={p.id} player={p} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
