/**
 * Idempotent soccer seed. Safe to re-run on every container start.
 *
 * Inserts one sport row (`Soccer`, two 45-minute periods) and the canonical
 * event_type rows. `ON CONFLICT DO NOTHING` keys keep updates predictable: if
 * the seed shape changes, drop the rows or add a migration that updates them
 * explicitly. We do not silently overwrite operator-edited rows.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eventTypes, sports } from './schema';

interface SoccerEventTypeSeed {
  code: string;
  label: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  clockControl?: 'start' | 'stop' | 'none';
  requiresPlayer?: boolean;
  affectsScore?: number;
  isSubstitution?: boolean;
}

// Order = render order in the live event grid (low → high).
const SOCCER_EVENT_TYPES: SoccerEventTypeSeed[] = [
  // --- Clock controls ---
  {
    code: 'KICKOFF',
    label: 'Kickoff',
    icon: 'play',
    color: 'emerald',
    sortOrder: 10,
    clockControl: 'start',
  },
  {
    code: 'HALF_TIME',
    label: 'Half Time',
    icon: 'pause',
    color: 'amber',
    sortOrder: 20,
    clockControl: 'stop',
  },
  {
    code: 'SECOND_HALF',
    label: 'Second Half',
    icon: 'play',
    color: 'emerald',
    sortOrder: 30,
    clockControl: 'start',
  },
  {
    code: 'FULL_TIME',
    label: 'Full Time',
    icon: 'flag',
    color: 'rose',
    sortOrder: 40,
    clockControl: 'stop',
  },
  // --- Scoring ---
  {
    code: 'GOAL',
    label: 'Goal',
    icon: 'soccer',
    color: 'emerald',
    sortOrder: 100,
    affectsScore: 1,
    requiresPlayer: true,
  },
  {
    code: 'OWN_GOAL',
    label: 'Own Goal',
    icon: 'soccer',
    color: 'rose',
    sortOrder: 110,
    affectsScore: 1,
    requiresPlayer: true,
  },
  {
    code: 'ASSIST',
    label: 'Assist',
    icon: 'arrow',
    color: 'sky',
    sortOrder: 120,
    requiresPlayer: true,
  },
  // --- Discipline ---
  {
    code: 'YELLOW_CARD',
    label: 'Yellow Card',
    icon: 'card',
    color: 'amber',
    sortOrder: 200,
    requiresPlayer: true,
  },
  {
    code: 'RED_CARD',
    label: 'Red Card',
    icon: 'card',
    color: 'rose',
    sortOrder: 210,
    requiresPlayer: true,
  },
  // --- Subs ---
  {
    code: 'SUBSTITUTION',
    label: 'Substitution',
    icon: 'swap',
    color: 'sky',
    sortOrder: 300,
    isSubstitution: true,
  },
  // --- Generic taps ---
  { code: 'SHOT', label: 'Shot', icon: 'target', color: 'slate', sortOrder: 400 },
  {
    code: 'SHOT_ON_TARGET',
    label: 'Shot on Target',
    icon: 'target',
    color: 'slate',
    sortOrder: 410,
  },
  { code: 'SAVE', label: 'Save', icon: 'shield', color: 'slate', sortOrder: 420 },
  { code: 'CORNER', label: 'Corner', icon: 'corner', color: 'slate', sortOrder: 430 },
  { code: 'FOUL', label: 'Foul', icon: 'whistle', color: 'slate', sortOrder: 440 },
  { code: 'OFFSIDE', label: 'Offside', icon: 'flag', color: 'slate', sortOrder: 450 },
];

async function seedSoccer(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to seed');
    process.exit(1);
  }

  const sql_ = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql_);

  try {
    console.log('[seed] inserting Soccer sport...');
    await db
      .insert(sports)
      .values({
        slug: 'soccer',
        name: 'Soccer',
        config: { periodCount: 2, periodLengthSeconds: 2700 },
      })
      .onConflictDoNothing({ target: sports.slug });

    const [soccer] = await db.select().from(sports).where(eq(sports.slug, 'soccer')).limit(1);
    if (!soccer) {
      throw new Error('Soccer sport row missing after upsert — aborting seed');
    }

    console.log(`[seed] inserting ${SOCCER_EVENT_TYPES.length} event types...`);
    await db
      .insert(eventTypes)
      .values(
        SOCCER_EVENT_TYPES.map((e) => ({
          sportId: soccer.id,
          code: e.code,
          label: e.label,
          icon: e.icon ?? null,
          color: e.color ?? null,
          sortOrder: e.sortOrder,
          clockControl: e.clockControl ?? 'none',
          requiresPlayer: e.requiresPlayer ?? false,
          affectsScore: e.affectsScore ?? 0,
          isSubstitution: e.isSubstitution ?? false,
        })),
      )
      .onConflictDoNothing({ target: [eventTypes.sportId, eventTypes.code] });

    const inserted = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventTypes)
      .where(eq(eventTypes.sportId, soccer.id));
    console.log(`[seed] done — ${inserted[0]?.count ?? 0} event types present for soccer`);
  } finally {
    await sql_.end();
  }
}

await seedSoccer();
