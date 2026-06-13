import Link from 'next/link';
import { NewMatchForm } from '@/components/app/new-match-form';
import { getTeamsWithActiveRosters } from '@/server/queries/matches';
import { requireUser } from '@/server/session';

export const metadata = { title: 'New match · Touchline' };

export default async function NewMatchPage() {
  const user = await requireUser();
  const teams = await getTeamsWithActiveRosters(user.id);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/matches" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to matches
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">New match</h1>
        <p className="text-sm text-slate-400">
          Pick your team, enter the opponent, and tap to select your starting lineup. Inactive
          players don&apos;t appear — fix that on the team page if needed.
        </p>
      </header>
      <NewMatchForm teams={teams} />
    </section>
  );
}
