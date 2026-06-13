'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { OnFieldPlayer } from '@/server/queries/events';

interface SubstitutionSheetProps {
  open: boolean;
  onField: OnFieldPlayer[];
  bench: OnFieldPlayer[];
  onCancel: () => void;
  onConfirm: (off: string[], on: string[]) => void;
  pending: boolean;
}

/**
 * Full-screen sub flow: tap-to-toggle on the LEFT column to mark players
 * coming off, tap-to-toggle on the RIGHT to mark players coming on. Confirm
 * is enabled only when both lists are non-empty and the counts match.
 *
 * Open and close reset the selections so re-opening always starts clean.
 */
export function SubstitutionSheet({
  open,
  onField,
  bench,
  onCancel,
  onConfirm,
  pending,
}: SubstitutionSheetProps) {
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [on, setOn] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      setOff(new Set());
      setOn(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const canConfirm = useMemo(
    () => off.size > 0 && on.size > 0 && off.size === on.size && !pending,
    [off.size, on.size, pending],
  );

  if (!open) return null;

  function toggle(setState: typeof setOff, id: string) {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Substitution"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-6 backdrop-blur"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Substitution</h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-tap rounded-full px-5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </header>

      <p className="mt-2 text-sm text-slate-400">
        Pick the same number of players coming off and coming on, then confirm.
      </p>

      <div className="mt-6 grid flex-1 grid-cols-1 gap-6 overflow-hidden sm:grid-cols-2">
        <Column
          title="Coming OFF"
          subtitle={`${off.size} of ${onField.length} on-field`}
          players={onField}
          selected={off}
          accent="rose"
          empty="No players on the field."
          onToggle={(id) => toggle(setOff, id)}
        />
        <Column
          title="Coming ON"
          subtitle={`${on.size} of ${bench.length} on bench`}
          players={bench}
          selected={on}
          accent="emerald"
          empty="No bench players available."
          onToggle={(id) => toggle(setOn, id)}
        />
      </div>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {off.size === on.size
            ? off.size === 0
              ? 'Pick at least one off and one on.'
              : `${off.size} for ${off.size} — ready.`
            : `Pick ${Math.abs(off.size - on.size)} more ${off.size > on.size ? 'on' : 'off'}.`}
        </p>
        <button
          type="button"
          onClick={() => onConfirm([...off], [...on])}
          disabled={!canConfirm}
          className={cn(
            'min-h-tap rounded-xl bg-pitch px-6 py-3 text-base font-semibold text-white shadow',
            'transition-colors hover:bg-pitch-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          {pending ? 'Recording…' : 'Confirm substitution'}
        </button>
      </footer>
    </div>
  );
}

interface ColumnProps {
  title: string;
  subtitle: string;
  players: OnFieldPlayer[];
  selected: Set<string>;
  accent: 'rose' | 'emerald';
  empty: string;
  onToggle: (id: string) => void;
}

const ACCENT_CLASSES: Record<'rose' | 'emerald', string> = {
  rose: 'border-rose-500 bg-rose-950/40',
  emerald: 'border-emerald-500 bg-emerald-950/40',
};

const ACCENT_DOT: Record<'rose' | 'emerald', string> = {
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
};

function Column({ title, subtitle, players, selected, accent, empty, onToggle }: ColumnProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{title}</h3>
        <span className="text-xs uppercase tracking-wide text-slate-500">{subtitle}</span>
      </header>
      {players.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-3 grid auto-rows-min grid-cols-1 gap-2 overflow-y-auto">
          {players.map((p) => {
            const isPicked = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onToggle(p.id)}
                  className={cn(
                    'flex min-h-tap w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    isPicked
                      ? ACCENT_CLASSES[accent]
                      : 'border-slate-700 bg-slate-900/60 hover:border-slate-500',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-full font-mono text-base',
                      isPicked ? `${ACCENT_DOT[accent]} text-white` : 'bg-slate-800 text-slate-200',
                    )}
                  >
                    {p.number ?? '–'}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-base font-semibold text-slate-50">{p.name}</span>
                    {p.position ? (
                      <span className="text-xs text-slate-400">{p.position}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
