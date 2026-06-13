import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LiveTracker } from '@/components/live/live-tracker';
import {
  getLiveBench,
  getMatchLiveState,
  getOnFieldPlayers,
  listEventTypesForSport,
  listTimeline,
} from '@/server/queries/events';
import { requireUser } from '@/server/session';

export const metadata = { title: 'Live · Touchline' };

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export default async function LiveTrackingPage({ params }: PageProps) {
  const user = await requireUser();
  const { matchId } = await params;

  const match = await getMatchLiveState(matchId, user.id);
  if (!match) notFound();

  const [eventTypes, onField, bench, timeline] = await Promise.all([
    listEventTypesForSport(match.sportId),
    getOnFieldPlayers(match.id),
    getLiveBench(match.id, match.team.id),
    listTimeline(match.id),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <Link href={`/matches/${match.id}`} className="text-sm text-slate-400 hover:text-slate-200">
          ← Match overview
        </Link>
        {match.status === 'finished' ? (
          <Link
            href={`/matches/${match.id}`}
            className="text-sm font-semibold text-emerald-400 hover:underline"
          >
            View summary →
          </Link>
        ) : null}
      </header>
      <LiveTracker
        match={match}
        eventTypes={eventTypes}
        onField={onField}
        bench={bench}
        timeline={timeline}
      />
    </section>
  );
}
