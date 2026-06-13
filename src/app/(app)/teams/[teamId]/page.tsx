import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmForm } from '@/components/app/confirm-form';
import { PlayerCreateForm } from '@/components/app/player-create-form';
import { PlayerRow } from '@/components/app/player-row';
import { deleteTeamAction } from '@/server/actions/teams';
import { listPlayersForTeam } from '@/server/queries/players';
import { getTeam } from '@/server/queries/teams';
import { requireUser } from '@/server/session';

interface PageProps {
  params: Promise<{ teamId: string }>;
}

export default async function TeamDetailPage({ params }: PageProps) {
  const user = await requireUser();
  const { teamId } = await params;

  const team = await getTeam(teamId, user.id);
  if (!team) notFound();

  const roster = await listPlayersForTeam(team.id, user.id);
  const activeCount = roster.filter((p) => p.active).length;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="block h-12 w-12 rounded-full border border-slate-700"
            style={{ backgroundColor: team.color ?? 'transparent' }}
          />
          <div>
            <Link href="/teams" className="text-sm text-slate-400 hover:text-slate-200">
              ← Back to teams
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
            <p className="text-sm text-slate-400">
              {roster.length} player{roster.length === 1 ? '' : 's'} · {activeCount} active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/teams/${team.id}/edit`}>
            <Button variant="secondary">Edit team</Button>
          </Link>
          <ConfirmForm
            action={deleteTeamAction}
            message={`Delete ${team.name}? All players will be removed too. This can't be undone.`}
          >
            <input type="hidden" name="id" value={team.id} />
            <Button type="submit" variant="ghost" className="text-rose-300 hover:bg-rose-950/40">
              Delete team
            </Button>
          </ConfirmForm>
        </div>
      </header>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-3 text-lg font-semibold">Add player</h2>
        <PlayerCreateForm teamId={team.id} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Roster</h2>
        {roster.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center text-slate-400">
            No players yet. Add one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
