/**
 * Local mirror of user identity. The source of truth lives in
 * identity-service (vendored at services/identity); this table is just
 * thin enough to satisfy FKs from teams.user_id and matches.user_id and
 * to render the user's name/email in the UI. It never stores a password.
 *
 * The `id` column intentionally has no default — it is populated from
 * identity-service's `user_id` on register and re-affirmed on every login
 * via the upsert in `src/server/auth.ts`.
 *
 * Auth.js v5 used to require a DrizzleAdapter with `accounts`, `sessions`,
 * and `verification_tokens` tables here; with credentials delegated to
 * identity-service the adapter is gone and those tables were dropped in
 * migration 0002. If a future OAuth provider is added, Auth.js will need
 * either its own tables or a different storage strategy then.
 */
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});
