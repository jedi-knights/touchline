'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { AuthError } from 'next-auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { signInSchema, signUpSchema } from '@/lib/validation/auth';
import { signIn } from '@/server/auth';

export interface AuthFormState {
  error?: string;
}

/**
 * Sign in. Re-thrown redirects from Auth.js are not caught — they're how
 * Next.js navigates after a successful login.
 */
export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Enter a valid email and password.' };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/',
    });
  } catch (e) {
    if (e instanceof AuthError) {
      // CredentialsSignin covers both "no such user" and "wrong password".
      // We never want to disclose which one.
      return { error: 'Email or password is incorrect.' };
    }
    throw e;
  }
  return {};
}

/**
 * Sign up. Validates input, rejects duplicates, hashes the password, inserts
 * the user, then signs them in immediately so the next page load is authed.
 *
 * Email collision response is intentionally a generic "already registered"
 * message; we don't differentiate from "invalid input" enough to enable
 * enumeration attacks, but we still want a useful error in the UI.
 */
export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const nameRaw = formData.get('name');
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: typeof nameRaw === 'string' && nameRaw.length > 0 ? nameRaw : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { email, password, name } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { error: 'That email is already registered.' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({ email, name: name ?? null, passwordHash });

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
  } catch (e) {
    if (e instanceof AuthError) {
      // Shouldn't happen — we just inserted the row.
      return { error: 'Account created but sign-in failed. Try signing in.' };
    }
    throw e;
  }
  return {};
}
