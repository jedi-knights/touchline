import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TeamForm } from '@/components/app/team-form';
import { getTeam } from '@/server/queries/teams';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Edit team · Touchline' };

interface PageProps {
  params: Promise<{ teamId: string }>;
}

export default async function EditTeamPage({ params }: PageProps) {
  const user = await requireUser();
  const { teamId } = await params;

  const team = await getTeam(teamId, user.id);
  if (!team) notFound();

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href={`/teams/${team.id}`} className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to {team.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Edit team</h1>
      </header>
      <TeamForm
        mode="update"
        initial={{
          id: team.id,
          name: team.name,
          color: team.color,
          crestUrl: team.crestUrl,
        }}
        submitLabel="Save changes"
      />
    </section>
  );
}
