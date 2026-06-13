'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { signUpAction, type AuthFormState } from '@/server/actions/auth';

const initialState: AuthFormState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="Name (optional)"
        type="text"
        name="name"
        autoComplete="name"
        placeholder="Coach Smith"
      />
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="At least 8 characters"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-rose-400">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
