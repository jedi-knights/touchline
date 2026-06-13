/**
 * Demo seed. Opt-in via SEED_DEMO=true on the app container.
 *
 * Creates a single fixed demo account (demo@touchline.local / demo1234) via
 * identity-service — the same path real sign-ups take — then populates that
 * account with 6 teams (16–22 players each) and 10 already-played matches.
 *
 * The 10 matches each carry a full 90-minute event timeline (KICKOFF →
 * HALF_TIME → SECOND_HALF → FULL_TIME) with goals, cards, and 1–3
 * substitutions, plus the matching player_stints — so /matches/[id]
 * renders a real timeline and minutes-played table without any live tap-tap.
 *
 * Idempotency strategy: skip the data block when the demo user already owns
 * any teams. The data is deterministic (mulberry32 PRNG with a fixed seed),
 * so the first run produces a known fixture and subsequent runs are no-ops.
 */
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  eventTypes,
  matchEvents,
  matchLineupPlayers,
  matches,
  playerStints,
  players,
  sports,
  teams,
  users,
} from './schema';

const DEMO_EMAIL = 'demo@touchline.local';
const DEMO_PASSWORD = 'demo1234';
const DEMO_NAME = 'Demo Coach';

const PERIOD_SECONDS = 2700; // 45 minutes
const FULL_TIME_SECONDS = PERIOD_SECONDS * 2; // 5400
const HALF_TIME_BREAK_SECONDS = 15 * 60; // 15 minutes of wall-clock between halves
const LINEUP_SIZE = 11;

// Mulberry32 PRNG — fixed seed makes the demo fixture deterministic.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(0xc0ffee);
const randInt = (min: number, max: number): number => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T>(xs: readonly T[]): T => {
  const x = xs[Math.floor(rng() * xs.length)];
  if (x === undefined) throw new Error('pick from empty array');
  return x;
};

interface TeamSeed {
  name: string;
  color: string;
}

const TEAM_CATALOG: readonly TeamSeed[] = [
  { name: 'Highbury Rangers', color: '#E11D48' },
  { name: 'Ashford United', color: '#1D4ED8' },
  { name: 'Riverside Athletic', color: '#059669' },
  { name: 'Northgate FC', color: '#7C3AED' },
  { name: 'Oakwood Town', color: '#EA580C' },
  { name: 'Seabrook Wanderers', color: '#0EA5E9' },
];

const FIRST_NAMES = [
  'James',
  'Liam',
  'Noah',
  'Mateo',
  'Lucas',
  'Ethan',
  'Owen',
  'Henry',
  'Theo',
  'Diego',
  'Kai',
  'Aaron',
  'Jordan',
  'Marcus',
  'Felix',
  'Hugo',
  'Leo',
  'Oscar',
  'Finn',
  'Caleb',
  'Isaac',
  'Sebastian',
  'Adrian',
  'Levi',
  'Jude',
  'Miles',
  'Cole',
  'Reece',
  'Dylan',
  'Ezra',
  'Rafael',
  'Aiden',
  'Beau',
  'Tariq',
  'Idris',
  'Soren',
  'Anders',
  'Mason',
  'Niklas',
  'Salim',
];

const LAST_NAMES = [
  'Hart',
  'Mendes',
  'Okafor',
  'Tanaka',
  'Becker',
  'Sandoval',
  'Park',
  'Andersen',
  'Vega',
  'Costa',
  'Okonkwo',
  'Lindberg',
  'Romero',
  'Patel',
  'Kovac',
  'Nguyen',
  'Carter',
  'Walsh',
  'Ahmed',
  'Soto',
  'Reyes',
  'Khan',
  'Schaefer',
  'Cruz',
  'Petrov',
  'Olsen',
  'Ferreira',
  'Diallo',
  'Hoffmann',
  'Yamada',
];

// Positional template (4-4-2) — the first row drafted is the starting XI.
const POSITION_TEMPLATE = [
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'MID',
  'FWD',
  'FWD',
] as const;
const RESERVE_POSITIONS = [
  'DEF',
  'MID',
  'MID',
  'FWD',
  'GK',
  'DEF',
  'MID',
  'FWD',
  'FWD',
  'DEF',
  'MID',
] as const;

interface IdentityUserResponse {
  user_id: string;
  email: string;
  name: string;
}

async function identityCall(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: IdentityUserResponse | null }> {
  const base = process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:8081';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!text) return { status: res.status, body: null };
  try {
    return { status: res.status, body: JSON.parse(text) as IdentityUserResponse };
  } catch {
    return { status: res.status, body: null };
  }
}

async function ensureDemoUserId(): Promise<string> {
  const reg = await identityCall('/auth/register', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: DEMO_NAME,
  });
  if (reg.status === 201 && reg.body) return reg.body.user_id;

  // Already registered (409) or any other non-201 — fall back to login.
  const login = await identityCall('/auth/login', {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (login.status === 200 && login.body) return login.body.user_id;

  throw new Error(
    `[seed-demo] could not provision demo user: register=${reg.status}, login=${login.status}`,
  );
}

function generatePlayers(
  count: number,
  nameOffset: number,
): {
  name: string;
  number: number;
  position: string;
}[] {
  const used = new Set<number>();
  const out: { name: string; number: number; position: string }[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[(nameOffset + i * 7) % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(nameOffset + i * 11) % LAST_NAMES.length]!;
    const position =
      i < POSITION_TEMPLATE.length
        ? POSITION_TEMPLATE[i]!
        : RESERVE_POSITIONS[(i - POSITION_TEMPLATE.length) % RESERVE_POSITIONS.length]!;
    // Jersey #1 reserved for the GK; others draw 2..40 first, falling back to 2..99 on collision.
    let n = i === 0 ? 1 : randInt(2, 40);
    while (used.has(n)) n = randInt(2, 99);
    used.add(n);
    out.push({ name: `${first} ${last}`, number: n, position });
  }
  return out;
}

interface PlayerRow {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  teamId: string;
}

interface SimEvent {
  code: string;
  clockSec: number;
  period: 1 | 2;
  side: 'home' | 'away' | null;
  playerId: string | null;
  metadata: Record<string, unknown> | null;
}

interface SimStint {
  playerId: string;
  onAtSeconds: number;
  offAtSeconds: number | null;
}

interface MatchSim {
  events: SimEvent[];
  stints: SimStint[];
  lineup: string[];
  homeScore: number;
  awayScore: number;
}

function selectLineup(roster: PlayerRow[]): { starters: PlayerRow[]; bench: PlayerRow[] } {
  // Take the first GK, then fill remaining slots by sorted position priority.
  const gk = roster.find((p) => p.position === 'GK') ?? roster[0]!;
  const others = roster.filter((p) => p.id !== gk.id);
  const order = { DEF: 0, MID: 1, FWD: 2, GK: 3 } as Record<string, number>;
  const sorted = [...others].sort(
    (a, b) => (order[a.position ?? ''] ?? 9) - (order[b.position ?? ''] ?? 9),
  );
  const starters = [gk, ...sorted.slice(0, LINEUP_SIZE - 1)];
  const bench = sorted.slice(LINEUP_SIZE - 1);
  return { starters, bench };
}

function simulateMatch(homeRoster: PlayerRow[]): MatchSim {
  const { starters, bench } = selectLineup(homeRoster);

  const onField = new Map<string, number>(); // playerId -> stint index in stints[]
  const stints: SimStint[] = [];
  starters.forEach((p) => {
    onField.set(p.id, stints.length);
    stints.push({ playerId: p.id, onAtSeconds: 0, offAtSeconds: null });
  });
  const benchPool = [...bench];

  const events: SimEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  events.push({
    code: 'KICKOFF',
    clockSec: 0,
    period: 1,
    side: null,
    playerId: null,
    metadata: null,
  });

  // Helpers scoped to this match.
  const onFieldPlayers = (): PlayerRow[] =>
    Array.from(onField.keys()).map((id) => homeRoster.find((p) => p.id === id)!);

  const recordGoal = (clockSec: number, period: 1 | 2): void => {
    // 55% home, 40% away, 5% own goal (credited to away because home took the action).
    const r = rng();
    if (r < 0.55) {
      const scorer = pick(onFieldPlayers());
      events.push({
        code: 'GOAL',
        clockSec,
        period,
        side: 'home',
        playerId: scorer.id,
        metadata: null,
      });
      homeScore += 1;
    } else if (r < 0.95) {
      events.push({
        code: 'GOAL',
        clockSec,
        period,
        side: 'away',
        playerId: null,
        metadata: null,
      });
      awayScore += 1;
    } else {
      const unlucky = pick(onFieldPlayers());
      events.push({
        code: 'OWN_GOAL',
        clockSec,
        period,
        side: 'home',
        playerId: unlucky.id,
        metadata: null,
      });
      // OWN_GOAL flips credit to the opposite side (per src/domain/scoring.ts).
      awayScore += 1;
    }
  };

  const recordCard = (code: 'YELLOW_CARD' | 'RED_CARD', clockSec: number, period: 1 | 2): void => {
    const carded = pick(onFieldPlayers());
    events.push({
      code,
      clockSec,
      period,
      side: 'home',
      playerId: carded.id,
      metadata: null,
    });
  };

  const recordSubstitution = (clockSec: number, period: 1 | 2): void => {
    if (benchPool.length === 0) return;
    const offCandidates = onFieldPlayers().filter((p) => p.position !== 'GK');
    if (offCandidates.length === 0) return;
    const off = pick(offCandidates);
    const onIdx = Math.floor(rng() * benchPool.length);
    const on = benchPool.splice(onIdx, 1)[0]!;

    const offStintIdx = onField.get(off.id)!;
    stints[offStintIdx]!.offAtSeconds = clockSec;
    onField.delete(off.id);

    onField.set(on.id, stints.length);
    stints.push({ playerId: on.id, onAtSeconds: clockSec, offAtSeconds: null });

    events.push({
      code: 'SUBSTITUTION',
      clockSec,
      period,
      side: 'home',
      playerId: null,
      metadata: { off: [off.id], on: [on.id] },
    });
  };

  // --- First half ---
  const firstHalfEventCount = randInt(2, 5);
  for (let i = 0; i < firstHalfEventCount; i++) {
    const t = randInt(120, PERIOD_SECONDS - 120);
    const roll = rng();
    if (roll < 0.55) recordGoal(t, 1);
    else if (roll < 0.85) recordCard('YELLOW_CARD', t, 1);
    else recordSubstitution(t, 1);
  }
  events.push({
    code: 'HALF_TIME',
    clockSec: PERIOD_SECONDS,
    period: 1,
    side: null,
    playerId: null,
    metadata: null,
  });

  // --- Second half ---
  events.push({
    code: 'SECOND_HALF',
    clockSec: PERIOD_SECONDS,
    period: 2,
    side: null,
    playerId: null,
    metadata: null,
  });
  const secondHalfEventCount = randInt(3, 6);
  for (let i = 0; i < secondHalfEventCount; i++) {
    const t = randInt(PERIOD_SECONDS + 120, FULL_TIME_SECONDS - 120);
    const roll = rng();
    if (roll < 0.5) recordGoal(t, 2);
    else if (roll < 0.7) recordCard('YELLOW_CARD', t, 2);
    else if (roll < 0.95) recordSubstitution(t, 2);
    else recordCard('RED_CARD', t, 2);
  }

  // Close any still-open stints at FULL_TIME (mirrors what the engine does).
  for (const idx of onField.values()) {
    stints[idx]!.offAtSeconds = FULL_TIME_SECONDS;
  }
  events.push({
    code: 'FULL_TIME',
    clockSec: FULL_TIME_SECONDS,
    period: 2,
    side: null,
    playerId: null,
    metadata: null,
  });

  // Sort events by (clockSec, period) so the timeline reads chronologically.
  events.sort((a, b) =>
    a.clockSec !== b.clockSec ? a.clockSec - b.clockSec : a.period - b.period,
  );

  return { events, stints, lineup: starters.map((p) => p.id), homeScore, awayScore };
}

async function seed(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[seed-demo] DATABASE_URL is required');
    process.exit(1);
  }

  console.log('[seed-demo] provisioning demo account via identity-service...');
  const userId = await ensureDemoUserId();
  console.log(`[seed-demo] demo user_id=${userId}`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    // Mirror the user row (same shape as src/server/auth.ts's authorize callback).
    await db
      .insert(users)
      .values({ id: userId, email: DEMO_EMAIL, name: DEMO_NAME })
      .onConflictDoNothing({ target: users.id });

    // Idempotency gate: if this user already has teams, the demo fixture is in place.
    const existingTeams = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(teams)
      .where(eq(teams.userId, userId));
    if ((existingTeams[0]?.count ?? 0) > 0) {
      console.log('[seed-demo] demo data already present — skipping');
      return;
    }

    // Look up soccer sport + event_types — these come from src/db/seed.ts.
    const [soccer] = await db.select().from(sports).where(eq(sports.slug, 'soccer')).limit(1);
    if (!soccer) {
      throw new Error('[seed-demo] soccer sport row missing — run the base seed first');
    }
    const evTypes = await db.select().from(eventTypes).where(eq(eventTypes.sportId, soccer.id));
    const evIdByCode = new Map(evTypes.map((e) => [e.code, e.id]));
    const requireEventType = (code: string): string => {
      const id = evIdByCode.get(code);
      if (!id) throw new Error(`[seed-demo] missing event_type ${code}`);
      return id;
    };

    // --- Teams ---
    console.log('[seed-demo] inserting 6 teams...');
    const teamRows = await db
      .insert(teams)
      .values(TEAM_CATALOG.map((t) => ({ userId, name: t.name, color: t.color })))
      .returning();
    const teamByName = new Map(teamRows.map((t) => [t.name, t]));

    // --- Players (16-22 per team) ---
    console.log('[seed-demo] inserting players...');
    const playersByTeamId = new Map<string, PlayerRow[]>();
    for (let i = 0; i < teamRows.length; i++) {
      const team = teamRows[i]!;
      const count = randInt(16, 22);
      const generated = generatePlayers(count, i * 13);
      const rows = await db
        .insert(players)
        .values(
          generated.map((p) => ({
            teamId: team.id,
            name: p.name,
            number: p.number,
            position: p.position,
          })),
        )
        .returning();
      playersByTeamId.set(
        team.id,
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          number: r.number,
          position: r.position,
          teamId: r.teamId,
        })),
      );
      console.log(`[seed-demo]   ${team.name}: ${rows.length} players`);
    }

    // --- Matches ---
    // 10 matches: pick deterministic, non-self pairings across the 6 teams.
    const pairs: [number, number][] = [];
    while (pairs.length < 10) {
      const a = randInt(0, TEAM_CATALOG.length - 1);
      let b = randInt(0, TEAM_CATALOG.length - 1);
      while (b === a) b = randInt(0, TEAM_CATALOG.length - 1);
      pairs.push([a, b]);
    }

    // Anchor wall-clock times so events look real. Base = 30 days ago.
    const baseEpoch = Date.now() - 30 * 24 * 60 * 60 * 1000;

    console.log('[seed-demo] inserting 10 matches with full timelines...');
    for (let mi = 0; mi < pairs.length; mi++) {
      const [homeIdx, awayIdx] = pairs[mi]!;
      const homeTeam = teamByName.get(TEAM_CATALOG[homeIdx]!.name)!;
      const awayTeam = TEAM_CATALOG[awayIdx]!;

      const homeRoster = playersByTeamId.get(homeTeam.id)!;
      const sim = simulateMatch(homeRoster);

      // Wall clock: matches spaced ~3 days apart.
      const startedAt = new Date(baseEpoch + mi * 3 * 24 * 60 * 60 * 1000);
      // Wall-clock duration = 90 min match + 15 min half-time break.
      const finishedAt = new Date(
        startedAt.getTime() + (FULL_TIME_SECONDS + HALF_TIME_BREAK_SECONDS) * 1000,
      );

      const [matchRow] = await db
        .insert(matches)
        .values({
          userId,
          sportId: soccer.id,
          homeTeamId: homeTeam.id,
          opponentName: awayTeam.name,
          status: 'finished',
          currentPeriod: 2,
          homeScore: sim.homeScore,
          awayScore: sim.awayScore,
          startedAt,
          finishedAt,
        })
        .returning();
      if (!matchRow) throw new Error('[seed-demo] match insert returned no row');

      // Lineup (starters only).
      await db
        .insert(matchLineupPlayers)
        .values(sim.lineup.map((playerId) => ({ matchId: matchRow.id, playerId })));

      // Player stints.
      await db.insert(playerStints).values(
        sim.stints.map((s) => ({
          matchId: matchRow.id,
          playerId: s.playerId,
          onAtSeconds: s.onAtSeconds,
          offAtSeconds: s.offAtSeconds,
        })),
      );

      // Match events. wall_time = startedAt + matchClockSec (+15min break for period 2)
      // so the wall-clock ordering matches the match-clock ordering when read back.
      await db.insert(matchEvents).values(
        sim.events.map((e) => {
          const breakOffset = e.period === 2 ? HALF_TIME_BREAK_SECONDS : 0;
          const wallTime = new Date(startedAt.getTime() + (e.clockSec + breakOffset) * 1000);
          return {
            matchId: matchRow.id,
            eventTypeId: requireEventType(e.code),
            wallTime,
            matchClockSeconds: e.clockSec,
            periodNumber: e.period,
            side: e.side,
            playerId: e.playerId,
            metadata: e.metadata,
          };
        }),
      );

      console.log(
        `[seed-demo]   match ${mi + 1}/10: ${homeTeam.name} ${sim.homeScore}-${sim.awayScore} ${awayTeam.name} (${sim.events.length} events, ${sim.stints.length} stints)`,
      );
    }

    console.log('[seed-demo] done.');
    console.log(`[seed-demo] sign in at /sign-in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await client.end();
  }
}

await seed();
