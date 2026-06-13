/**
 * Sport catalog and event-type templates. The UI renders dynamic event buttons
 * from `eventTypes` rows for the active sport — no sport-specific logic in code.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const clockControl = pgEnum('clock_control', ['start', 'stop', 'none']);

export const sports = pgTable('sports', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // Per-sport defaults — e.g. soccer = { periodCount: 2, periodLengthSeconds: 2700 }
  config: jsonb('config')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});

export const eventTypes = pgTable(
  'event_types',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sportId: text('sport_id')
      .notNull()
      .references(() => sports.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    label: text('label').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: smallint('sort_order').notNull().default(0),
    clockControl: clockControl('clock_control').notNull().default('none'),
    requiresPlayer: boolean('requires_player').notNull().default(false),
    affectsScore: smallint('affects_score').notNull().default(0),
    isSubstitution: boolean('is_substitution').notNull().default(false),
    metadataSchema: jsonb('metadata_schema'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sportCode: unique('event_types_sport_code_unique').on(t.sportId, t.code),
  }),
);
