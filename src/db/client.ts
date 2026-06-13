/**
 * Process-wide Drizzle client backed by postgres-js. A single connection pool
 * is shared across server actions and queries.
 *
 * We deliberately do NOT throw at import time when DATABASE_URL is missing:
 * Next.js's build step imports server modules to collect route metadata, and
 * the build runs without a real database. postgres-js connects lazily on
 * first query, so a missing URL surfaces as a connection error at request
 * time — and the Docker entrypoint already asserts the variable is set
 * before starting the server.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? '';

// `prepare: false` is recommended for serverless / edge runtimes; harmless on Node.
const queryClient = postgres(url, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
