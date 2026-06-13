'use client';

import type { FormEventHandler, ReactNode } from 'react';

interface ConfirmFormProps {
  action: (formData: FormData) => Promise<void> | void;
  message: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a server-action form with a native `confirm()` gate on submit. Used
 * for destructive actions (delete team, delete player) so a tap doesn't
 * immediately destroy data without acknowledgement.
 */
export function ConfirmForm({ action, message, children, className }: ConfirmFormProps) {
  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  };

  return (
    <form action={action} onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}
