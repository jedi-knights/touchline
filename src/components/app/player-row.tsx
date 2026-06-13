'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { ConfirmForm } from '@/components/app/confirm-form';
import {
  deletePlayerAction,
  togglePlayerActiveAction,
  updatePlayerAction,
  type PlayerFormState,
} from '@/server/actions/players';

interface PlayerRowProps {
  player: {
    id: string;
    teamId: string;
    name: string;
    number: number | null;
    position: string | null;
    active: boolean;
  };
}

const initialState: PlayerFormState = {};

export function PlayerRow({ player }: PlayerRowProps) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updatePlayerAction, initialState);

  if (editing) {
    return (
      <li className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <form
          action={async (formData) => {
            await formAction(formData);
            if (!state.error) setEditing(false);
          }}
          className="grid gap-3 sm:grid-cols-[1fr_5rem_7rem_5rem_auto_auto]"
        >
          <input type="hidden" name="id" value={player.id} />
          <input type="hidden" name="teamId" value={player.teamId} />
          <TextField label="Name" type="text" name="name" required defaultValue={player.name} />
          <TextField
            label="Number"
            type="number"
            name="number"
            min={0}
            max={999}
            defaultValue={player.number ?? ''}
          />
          <TextField
            label="Position"
            type="text"
            name="position"
            maxLength={40}
            defaultValue={player.position ?? ''}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-200">
            Active
            <span className="flex min-h-tap items-center rounded-lg border border-slate-700 bg-slate-900 px-3">
              <input type="checkbox" name="active" defaultChecked={player.active} />
            </span>
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-rose-400 sm:col-span-6">
              {state.error}
            </p>
          ) : null}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center gap-4">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm ${
            player.active ? 'bg-pitch text-white' : 'bg-slate-800 text-slate-400'
          }`}
          aria-label={player.active ? 'Active' : 'Inactive'}
        >
          {player.number ?? '–'}
        </span>
        <div>
          <div
            className={`font-semibold ${player.active ? 'text-slate-100' : 'text-slate-500 line-through'}`}
          >
            {player.name}
          </div>
          {player.position ? <div className="text-xs text-slate-400">{player.position}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <form action={togglePlayerActiveAction}>
          <input type="hidden" name="id" value={player.id} />
          <input type="hidden" name="teamId" value={player.teamId} />
          <Button type="submit" variant="ghost" className="text-sm">
            {player.active ? 'Mark inactive' : 'Mark active'}
          </Button>
        </form>
        <Button variant="ghost" className="text-sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <ConfirmForm
          action={deletePlayerAction}
          message={`Delete ${player.name}? This can't be undone.`}
        >
          <input type="hidden" name="id" value={player.id} />
          <input type="hidden" name="teamId" value={player.teamId} />
          <Button
            type="submit"
            variant="ghost"
            className="text-sm text-rose-300 hover:bg-rose-950/40"
          >
            Delete
          </Button>
        </ConfirmForm>
      </div>
    </li>
  );
}
