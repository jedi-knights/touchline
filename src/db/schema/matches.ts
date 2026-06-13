/**
 * Match aggregate: the match itself, the immutable event log, and player
 * stints (the source of truth for minutes played).
 *
 * `match_events.match_clock_seconds` is computed server-side from the prior
 * clock-control events at insert time. `player_stints` are written in the same
 * transaction as the substitution event so the log and the stints can never
 * disagree.
 */
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { sports, eventTypes } from './sports';
import { teams, players } from './teams';

export const matchStatus = pgEnum('match_status', ['setup', 'live', 'finished']);
export const matchSide = pgEnum('match_side', ['home', 'away']);

export const matches = pgTable('matches', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sportId: text('sport_id')
    .notNull()
    .references(() => sports.id),
  homeTeamId: text('home_team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'restrict' }),
  // Opponent is captured as free text for now — most users only manage one side.
  opponentName: text('opponent_name').notNull(),
  status: matchStatus('status').notNull().default('setup'),
  currentPeriod: smallint('current_period').notNull().default(0),
  homeScore: smallint('home_score').notNull().default(0),
  awayScore: smallint('away_score').notNull().default(0),
  startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }),
  finishedAt: timestamp('finished_at', { mode: 'date', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});

export const matchEvents = pgTable('match_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  eventTypeId: text('event_type_id')
    .notNull()
    .references(() => eventTypes.id, { onDelete: 'restrict' }),
  wallTime: timestamp('wall_time', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  // Derived at insert from prior clock_control events — not client-supplied.
  matchClockSeconds: integer('match_clock_seconds').notNull(),
  periodNumber: smallint('period_number').notNull(),
  // null for system events (e.g. Match Start) that don't belong to a side.
  side: matchSide('side'),
  // Primary actor; extra players (e.g. on/off lists for subs) go in metadata.
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});

/**
 * The starting lineup chosen at match setup. Consumed at "Match Start" to
 * create the initial `player_stints`; afterwards it remains as the historical
 * record of who started.
 */
export const matchLineupPlayers = pgTable(
  'match_lineup_players',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.matchId, t.playerId] }),
  }),
);

export const playerStints = pgTable('player_stints', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id')
    .notNull()
    .references(() => matches.id, { onDelete: 'cascade' }),
  playerId: text('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  onAtSeconds: integer('on_at_seconds').notNull(),
  offAtSeconds: integer('off_at_seconds'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});
