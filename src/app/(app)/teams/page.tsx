import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { listTeams } from '@/server/queries/teams';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Teams · Touchline' };

export default async function TeamsPage() {
  const user = await requireUser();
  const teams = await listTeams(user.id);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="mt-2 text-slate-400">
            Manage your rosters here. Everything you create is private to your account.
          </p>
        </div>
        <Link href="/teams/new">
          <Button>New team</Button>
        </Link>
      </header>

      {teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-slate-400">
          <p className="text-lg">No teams yet.</p>
          <p className="mt-1 text-sm">Create one to start adding players.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/teams/${team.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-slate-600 hover:bg-slate-900/60"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="block h-9 w-9 rounded-full border border-slate-700"
                    style={{ backgroundColor: team.color ?? 'transparent' }}
                  />
                  <div>
                    <div className="text-lg font-semibold">{team.name}</div>
                    <div className="text-xs text-slate-400">
                      {team.playerCount} player{team.playerCount === 1 ? '' : 's'}
                      {team.playerCount > 0 ? ` · ${team.activePlayerCount} active` : ''}
                    </div>
                  </div>
                </div>
                <span aria-hidden className="text-slate-500">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
