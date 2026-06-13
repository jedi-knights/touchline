import Link from 'next/link';
import { TeamForm } from '@/components/app/team-form';
import { requireUser } from '@/server/session';

export const metadata = { title: 'New team · Touchline' };

export default async function NewTeamPage() {
  await requireUser();

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/teams" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to teams
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">New team</h1>
      </header>
      <TeamForm mode="create" submitLabel="Create team" />
    </section>
  );
}
