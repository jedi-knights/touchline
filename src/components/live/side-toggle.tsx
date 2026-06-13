'use client';

import { cn } from '@/lib/utils';

interface SideToggleProps {
  side: 'home' | 'away';
  onChange: (side: 'home' | 'away') => void;
  homeLabel: string;
  awayLabel: string;
}

/**
 * Sticky segmented control that decides which side a tap counts for. The
 * brief explicitly leaves this design choice open; a single visible state is
 * the smallest surface area that still removes ambiguity from each tap.
 */
export function SideToggle({ side, onChange, homeLabel, awayLabel }: SideToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Which side does the next event count for?"
      className="inline-flex overflow-hidden rounded-full border border-slate-700 bg-slate-900/60"
    >
      <button
        type="button"
        role="radio"
        aria-checked={side === 'home'}
        onClick={() => onChange('home')}
        className={cn(
          'min-h-tap px-5 text-sm font-semibold transition-colors',
          side === 'home' ? 'bg-pitch text-white' : 'text-slate-300 hover:bg-slate-800',
        )}
      >
        {homeLabel}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={side === 'away'}
        onClick={() => onChange('away')}
        className={cn(
          'min-h-tap px-5 text-sm font-semibold transition-colors',
          side === 'away' ? 'bg-rose-700 text-white' : 'text-slate-300 hover:bg-slate-800',
        )}
      >
        {awayLabel}
      </button>
    </div>
  );
}
