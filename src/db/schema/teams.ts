/**
 * Teams and rosters. Owned by a user; every read/write must be scoped by the
 * authenticated user's id (enforced server-side in src/server, not in the DB).
 */
import { boolean, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const teams = pgTable('teams', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  crestUrl: text('crest_url'),
  color: text('color'), // e.g. '#0b6b3a'
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});

export const players = pgTable('players', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  number: smallint('number'),
  position: text('position'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});
