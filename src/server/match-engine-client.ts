/**
 * Thin client for the vendored match-engine service (services/match-engine).
 *
 * The Next.js app calls into this for the two state-changing operations the
 * engine owns:
 *
 *   POST /matches/{match_id}/events
 *   POST /matches/{match_id}/substitutions
 *
 * Reads (clock derivation, on-field players, timeline) stay in TypeScript:
 * they're pure projections of rows already in postgres, and Next.js can
 * fetch them directly without a network hop.
 *
 * Base URL is read at call time so the build can run without
 * MATCH_ENGINE_URL set — only the actual server actions fail closed at
 * request time when it's missing.
 */

export interface MatchEngineMatchResponse {
  id: string;
  status: 'setup' | 'live' | 'finished';
  current_period: number;
  home_score: number;
  away_score: number;
  started_at?: string;
  finished_at?: string;
}

export type MatchEngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function baseUrl(): string {
  return process.env.MATCH_ENGINE_URL ?? 'http://localhost:8082';
}

async function postJson<T>(path: string, body: unknown): Promise<MatchEngineResult<T>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (res.ok && parsed) {
    return { ok: true, data: parsed as T };
  }
  const message =
    parsed && typeof parsed === 'object' && 'error' in parsed
      ? String((parsed as { error: unknown }).error)
      : `match-engine returned ${res.status}`;
  return { ok: false, status: res.status, message };
}

export async function recordEventViaEngine(input: {
  matchId: string;
  eventTypeId: string;
  side: 'home' | 'away' | null | undefined;
  playerId: string | undefined;
}): Promise<MatchEngineResult<MatchEngineMatchResponse>> {
  return postJson<MatchEngineMatchResponse>(`/matches/${input.matchId}/events`, {
    event_type_id: input.eventTypeId,
    side: input.side ?? null,
    player_id: input.playerId ?? null,
  });
}

export async function recordSubstitutionViaEngine(input: {
  matchId: string;
  offPlayerIds: string[];
  onPlayerIds: string[];
}): Promise<MatchEngineResult<MatchEngineMatchResponse>> {
  return postJson<MatchEngineMatchResponse>(`/matches/${input.matchId}/substitutions`, {
    off_player_ids: input.offPlayerIds,
    on_player_ids: input.onPlayerIds,
  });
}
