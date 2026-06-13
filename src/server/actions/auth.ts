'use server';

import { AuthError } from 'next-auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { signInSchema, signUpSchema } from '@/lib/validation/auth';
import { signIn } from '@/server/auth';
import { identityRegister } from '@/server/identity-client';

export interface AuthFormState {
  error?: string;
}

/**
 * Sign in. Re-thrown redirects from Auth.js are not caught — they're how
 * Next.js navigates after a successful login.
 *
 * The actual credential check happens inside Auth.js → Credentials provider
 * → identity-service. This action only validates the form payload and hands
 * off to signIn(); error mapping happens via AuthError on bad credentials.
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
      // CredentialsSignin covers identity-service 401/403 and network
      // failures — we never want to disclose which one occurred.
      return { error: 'Email or password is incorrect.' };
    }
    throw e;
  }
  return {};
}

/**
 * Sign up. Calls identity-service /auth/register, then mirrors the user
 * id into touchline's local `users` table so FKs from teams/matches
 * resolve. Auto-signs the user in afterwards via the same Credentials flow
 * so the next page load is authenticated.
 *
 * Error mapping:
 *   201 → success
 *   409 → generic "already registered" (no user enumeration)
 *   anything else → generic "sign-up failed"
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

  const result = await identityRegister({ email, password, name });
  if (!result.ok) {
    if (result.status === 409) return { error: 'That email is already registered.' };
    return { error: 'Sign-up failed. Try again in a moment.' };
  }

  const { user_id, email: idEmail, name: idName } = result.user;

  // Mirror locally so teams/matches FKs resolve. If this fails the user
  // can still sign in (authorize() upserts on demand), so we don't fail
  // the whole sign-up — just log and continue. Wrapped in try/catch to
  // avoid leaking DB errors to the form.
  try {
    await db
      .insert(users)
      .values({ id: user_id, email: idEmail, name: idName.length > 0 ? idName : null })
      .onConflictDoNothing({ target: users.id });
  } catch (e) {
    console.error('[signup] mirror insert failed; signIn will retry:', e);
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
  } catch (e) {
    if (e instanceof AuthError) {
      // Shouldn't happen — identity-service just told us register succeeded.
      return { error: 'Account created but sign-in failed. Try signing in.' };
    }
    throw e;
  }
  return {};
}
