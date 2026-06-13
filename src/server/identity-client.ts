/**
 * Thin client for the vendored identity-service (services/identity).
 *
 * The Next.js app calls into this for the two operations it actually needs:
 *
 *   - `identityRegister`: create a user (POST /auth/register)
 *   - `identityLogin`:    validate credentials (POST /auth/login)
 *
 * Auth.js v5 still owns session management — these functions never see a
 * JWT; they only return the canonical user id, which Auth.js then wraps in
 * its own session cookie.
 *
 * The base URL is read at call time (not module evaluation) so the Next.js
 * build can run without `IDENTITY_SERVICE_URL` set — only sign-in / sign-up
 * actually fail closed at request time when it's missing.
 */

export interface IdentityUser {
  user_id: string;
  email: string;
  name: string;
}

export type IdentityResult = { ok: true; user: IdentityUser } | { ok: false; status: number };

function identityBaseUrl(): string {
  return process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:8081';
}

async function postJson<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${identityBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Server actions run server-side; we don't want fetch caching.
    cache: 'no-store',
  });
  // identity-service returns JSON on both success and error paths.
  const text = await res.text();
  if (!text) return { status: res.status, body: null };
  try {
    return { status: res.status, body: JSON.parse(text) as T };
  } catch {
    return { status: res.status, body: null };
  }
}

export async function identityRegister(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<IdentityResult> {
  const res = await postJson<IdentityUser>('/auth/register', {
    email: input.email,
    password: input.password,
    name: input.name ?? '',
  });
  if (res.status === 201 && res.body) return { ok: true, user: res.body };
  return { ok: false, status: res.status };
}

export async function identityLogin(input: {
  email: string;
  password: string;
}): Promise<IdentityResult> {
  const res = await postJson<IdentityUser>('/auth/login', input);
  if (res.status === 200 && res.body) return { ok: true, user: res.body };
  return { ok: false, status: res.status };
}
