import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { listMatches } from '@/server/queries/matches';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Matches · Touchline' };

const STATUS_LABEL: Record<'setup' | 'live' | 'finished', { label: string; classes: string }> = {
  setup: { label: 'Setup', classes: 'bg-slate-700 text-slate-200' },
  live: { label: 'Live', classes: 'bg-emerald-600 text-white' },
  finished: { label: 'Final', classes: 'bg-slate-800 text-slate-300' },
};

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default async function MatchesPage() {
  const user = await requireUser();
  const rows = await listMatches(user.id);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
          <p className="mt-2 text-slate-400">
            One match per touchline session. Set one up, then start the clock when you kick off.
          </p>
        </div>
        <Link href="/matches/new">
          <Button>New match</Button>
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-slate-400">
          <p className="text-lg">No matches yet.</p>
          <p className="mt-1 text-sm">
            Create a team first if you haven&apos;t already, then come back here to set up your
            first match.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((m) => {
            const status = STATUS_LABEL[m.status];
            return (
              <li key={m.id}>
                <Link
                  href={`/matches/${m.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-slate-600 hover:bg-slate-900/60"
                >
                  <div className="flex flex-col">
                    <div className="text-lg font-semibold">
                      {m.homeTeamName} <span className="text-slate-500">vs</span> {m.opponentName}
                    </div>
                    <div className="text-xs text-slate-400">
                      Created {DATE_FMT.format(m.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg tabular-nums text-slate-100">
                      {m.homeScore} – {m.awayScore}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${status.classes}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
