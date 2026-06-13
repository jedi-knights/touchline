'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { createTeamAction, updateTeamAction, type TeamFormState } from '@/server/actions/teams';

interface TeamFormProps {
  mode: 'create' | 'update';
  initial?: {
    id: string;
    name: string;
    color: string | null;
    crestUrl: string | null;
  };
  submitLabel: string;
}

const initialState: TeamFormState = {};

export function TeamForm({ mode, initial, submitLabel }: TeamFormProps) {
  const action = mode === 'create' ? createTeamAction : updateTeamAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === 'update' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <TextField
        label="Team name"
        type="text"
        name="name"
        required
        maxLength={120}
        defaultValue={initial?.name ?? ''}
        placeholder="e.g. River City FC U14"
      />
      <TextField
        label="Color (optional, hex)"
        type="text"
        name="color"
        maxLength={7}
        defaultValue={initial?.color ?? ''}
        placeholder="#0b6b3a"
        pattern="^#[0-9a-fA-F]{6}$"
      />
      <TextField
        label="Crest URL (optional)"
        type="url"
        name="crestUrl"
        maxLength={2048}
        defaultValue={initial?.crestUrl ?? ''}
        placeholder="https://…"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-rose-400">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
