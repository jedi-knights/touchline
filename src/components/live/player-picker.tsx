'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PlayerPickerProps {
  open: boolean;
  title: string;
  players: { id: string; name: string; number: number | null; position: string | null }[];
  onPick: (playerId: string) => void;
  onCancel: () => void;
}

/**
 * Full-screen tap-to-pick sheet. Each player is a 56px tap target arranged
 * in a multi-column grid so the picker stays usable on a phone in landscape.
 */
export function PlayerPicker({ open, title, players, onPick, onCancel }: PlayerPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc to dismiss. Focus the dialog when it opens so the screen-reader hint
  // is announced.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-6 backdrop-blur"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-tap rounded-full px-5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </header>

      {players.length === 0 ? (
        <p className="mt-12 text-center text-slate-400">
          No on-field players to pick. Start the match first or check the lineup.
        </p>
      ) : (
        <ul className="mt-6 grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {players.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className={cn(
                  'flex min-h-tap w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4',
                  'text-left transition-colors hover:border-pitch hover:bg-pitch/10',
                )}
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 font-mono text-lg text-slate-100">
                  {p.number ?? '–'}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-base font-semibold text-slate-50">{p.name}</span>
                  {p.position ? <span className="text-xs text-slate-400">{p.position}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
