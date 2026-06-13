'use client';

import { cn } from '@/lib/utils';
import type { EventTypeOption } from '@/server/queries/events';

interface EventGridProps {
  eventTypes: EventTypeOption[];
  onTap: (eventType: EventTypeOption) => void;
  /**
   * Decides whether a given event type can be tapped right now. Lifted so
   * the parent (which knows match status and clock state) is the single
   * source of truth.
   */
  isEnabled: (eventType: EventTypeOption) => boolean;
  pending: boolean;
}

// Map data-driven `color` strings to Tailwind classes. New colors can be
// added by inserting rows into event_types and adding a key here.
const COLOR_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-700 hover:bg-emerald-600 focus-visible:ring-emerald-400',
  amber: 'bg-amber-700 hover:bg-amber-600 focus-visible:ring-amber-400 text-amber-50',
  rose: 'bg-rose-700 hover:bg-rose-600 focus-visible:ring-rose-400',
  sky: 'bg-sky-700 hover:bg-sky-600 focus-visible:ring-sky-400',
  slate: 'bg-slate-800 hover:bg-slate-700 focus-visible:ring-slate-400',
};

function colorClass(c: string | null): string {
  if (!c) return COLOR_CLASSES.slate ?? '';
  return COLOR_CLASSES[c] ?? COLOR_CLASSES.slate ?? '';
}

/**
 * Renders one button per `event_type` row. Order and color come straight
 * from the catalog — the live UI has zero soccer-specific knowledge.
 */
export function EventGrid({ eventTypes, onTap, isEnabled, pending }: EventGridProps) {
  // Group events for visual breathing room without putting soccer-specific
  // groupings in the code. Group by clockControl vs not.
  const clockControls = eventTypes.filter((e) => e.clockControl !== 'none');
  const others = eventTypes.filter((e) => e.clockControl === 'none');

  return (
    <div className="flex flex-col gap-4">
      {clockControls.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Clock</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {clockControls.map((e) => (
              <EventButton
                key={e.id}
                eventType={e}
                onTap={() => onTap(e)}
                disabled={!isEnabled(e) || pending}
              />
            ))}
          </div>
        </div>
      ) : null}

      {others.length > 0 ? (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Events</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {others.map((e) => (
              <EventButton
                key={e.id}
                eventType={e}
                onTap={() => onTap(e)}
                disabled={!isEnabled(e) || pending}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EventButton({
  eventType,
  onTap,
  disabled,
}: {
  eventType: EventTypeOption;
  onTap: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={cn(
        'min-h-tap rounded-xl px-3 py-4 text-base font-semibold text-white shadow',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-40',
        colorClass(eventType.color),
      )}
    >
      {eventType.label}
    </button>
  );
}
