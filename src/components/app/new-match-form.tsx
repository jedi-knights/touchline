'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { createMatchAction, type CreateMatchFormState } from '@/server/actions/matches';
import type { TeamWithActiveRoster } from '@/server/queries/matches';

interface NewMatchFormProps {
  teams: TeamWithActiveRoster[];
}

const initialState: CreateMatchFormState = {};

export function NewMatchForm({ teams }: NewMatchFormProps) {
  const [state, formAction, pending] = useActionState(createMatchAction, initialState);

  // Initial team is the first one with at least one active player, so the
  // lineup section is immediately interactive.
  const firstUsable = useMemo(() => teams.find((t) => t.players.length > 0) ?? teams[0], [teams]);
  const [teamId, setTeamId] = useState<string | undefined>(firstUsable?.id);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const selectedTeam = useMemo(() => teams.find((t) => t.id === teamId), [teamId, teams]);

  function changeTeam(nextTeamId: string) {
    setTeamId(nextTeamId);
    // Switching teams clears the lineup — old players don't belong to the new team.
    setPicked(new Set());
  }

  function togglePlayer(playerId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-slate-400">
        You need at least one team before you can set up a match.{' '}
        <Link href="/teams/new" className="text-pitch underline-offset-4 hover:underline">
          Create one
        </Link>
        .
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="sportSlug" value="soccer" />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-slate-200">Your team</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {teams.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                teamId === t.id
                  ? 'border-pitch bg-pitch/10'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
              }`}
            >
              <input
                type="radio"
                name="teamId"
                value={t.id}
                checked={teamId === t.id}
                onChange={() => changeTeam(t.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="block h-6 w-6 rounded-full border border-slate-700"
                style={{ backgroundColor: t.color ?? 'transparent' }}
              />
              <span className="flex flex-1 flex-col">
                <span className="text-base font-semibold text-slate-100">{t.name}</span>
                <span className="text-xs text-slate-400">
                  {t.players.length} active player{t.players.length === 1 ? '' : 's'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        label="Opponent"
        type="text"
        name="opponentName"
        required
        maxLength={120}
        placeholder="e.g. Eastside FC"
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-slate-200">
          Starting lineup{' '}
          <span className="font-normal text-slate-400">({picked.size} selected)</span>
        </legend>

        {!selectedTeam || selectedTeam.players.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
            This team has no active players. Add some on the team page first.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {selectedTeam.players.map((p) => {
              const isPicked = picked.has(p.id);
              return (
                <li key={p.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                      isPicked
                        ? 'border-pitch bg-pitch/10'
                        : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="lineupPlayerIds"
                      value={p.id}
                      checked={isPicked}
                      onChange={() => togglePlayer(p.id)}
                      className="sr-only"
                    />
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm ${
                        isPicked ? 'bg-pitch text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {p.number ?? '–'}
                    </span>
                    <span className="flex flex-1 flex-col">
                      <span className="text-base font-semibold text-slate-100">{p.name}</span>
                      {p.position ? (
                        <span className="text-xs text-slate-400">{p.position}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-rose-400">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || picked.size === 0}>
        {pending ? 'Creating match…' : 'Create match'}
      </Button>
    </form>
  );
}
