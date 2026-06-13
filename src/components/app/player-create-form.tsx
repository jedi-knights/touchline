'use client';

import { useActionState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { createPlayerAction, type PlayerFormState } from '@/server/actions/players';

const initialState: PlayerFormState = {};

export function PlayerCreateForm({ teamId }: { teamId: string }) {
  const [state, formAction, pending] = useActionState(createPlayerAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the form after a successful insert so the next player can be added
  // without typing-mode juggling. Detect success as "no pending, no error".
  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem_auto]"
    >
      <input type="hidden" name="teamId" value={teamId} />
      <TextField
        label="Name"
        type="text"
        name="name"
        required
        maxLength={120}
        placeholder="Player name"
      />
      <TextField label="Number" type="number" name="number" min={0} max={999} placeholder="00" />
      <TextField
        label="Position"
        type="text"
        name="position"
        maxLength={40}
        placeholder="e.g. CM"
      />
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Adding…' : 'Add player'}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-rose-400 sm:col-span-4">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
