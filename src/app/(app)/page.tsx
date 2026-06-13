import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { listMatches } from '@/server/queries/matches';
import { listTeams } from '@/server/queries/teams';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Dashboard · Touchline' };

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

export default async function DashboardPage() {
  const user = await requireUser();
  const [teams, matches] = await Promise.all([listTeams(user.id), listMatches(user.id)]);

  const activeMatch =
    matches.find((m) => m.status === 'live') ?? matches.find((m) => m.status === 'setup');
  const recentFinal = matches.find((m) => m.status === 'finished');

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.name ?? user.email}</h1>
        <p className="mt-2 text-slate-400">
          Touch-driven match tracking. Set up a team, line them up, and tap your way through the
          match.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Teams" value={teams.length} href="/teams" cta="Manage" />
        <StatCard label="Matches" value={matches.length} href="/matches" cta="Open" />
        <StatCard
          label="Active right now"
          value={matches.filter((m) => m.status === 'live').length}
          href="/matches"
          cta="Resume"
          accent={matches.some((m) => m.status === 'live')}
        />
      </div>

      {activeMatch ? (
        <div className="rounded-2xl border border-pitch/40 bg-pitch/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-pitch">
            {activeMatch.status === 'live' ? 'Live match' : 'Match in setup'}
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {activeMatch.homeTeamName} <span className="text-slate-500">vs</span>{' '}
            {activeMatch.opponentName}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl tabular-nums">
              {activeMatch.homeScore} – {activeMatch.awayScore}
            </span>
            <Link href={`/matches/${activeMatch.id}/live`}>
              <Button>
                {activeMatch.status === 'live' ? 'Resume live tracker' : 'Open live tracker'}
              </Button>
            </Link>
            <Link
              href={`/matches/${activeMatch.id}`}
              className="text-sm text-slate-300 hover:text-white"
            >
              Match overview →
            </Link>
          </div>
        </div>
      ) : null}

      {recentFinal ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Most recent final</h2>
          <Link
            href={`/matches/${recentFinal.id}`}
            className="block rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-slate-600"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  {recentFinal.homeTeamName} <span className="text-slate-500">vs</span>{' '}
                  {recentFinal.opponentName}
                </div>
                <div className="text-xs text-slate-400">
                  Created {DATE_FMT.format(recentFinal.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xl tabular-nums">
                  {recentFinal.homeScore} – {recentFinal.awayScore}
                </span>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_LABEL[recentFinal.status].classes}`}
                >
                  {STATUS_LABEL[recentFinal.status].label}
                </span>
              </div>
            </div>
          </Link>
        </div>
      ) : null}

      {teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-slate-400">
          You don&apos;t have any teams yet.{' '}
          <Link href="/teams/new" className="text-pitch underline-offset-4 hover:underline">
            Create one
          </Link>{' '}
          to get started.
        </div>
      ) : null}
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  href: string;
  cta: string;
  accent?: boolean;
}

function StatCard({ label, value, href, cta, accent }: StatCardProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col rounded-xl border bg-slate-900/40 p-4 transition-colors ${
        accent
          ? 'border-emerald-500/40 hover:border-emerald-500'
          : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="mt-1 font-mono text-4xl tabular-nums text-slate-50">{value}</span>
      <span className="mt-2 text-xs text-slate-400">{cta} →</span>
    </Link>
  );
}
