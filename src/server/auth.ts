/**
 * Full Auth.js v5 configuration. Runs in the Node.js runtime only.
 *
 * Architecture: Auth.js owns the session cookie; identity-service
 * (vendored under services/identity) owns the user record and bcrypt
 * password hash. The Credentials provider's `authorize` callback calls
 * identity-service over HTTP; on success it mirrors the user row into
 * touchline's local `users` table so FKs from teams/matches/etc. resolve.
 *
 * No DrizzleAdapter: Auth.js does not read or write user state. The local
 * `users` table is a thin mirror, not the source of truth.
 *
 * Session strategy: JWT — matches the prior setup; nothing about session
 * cookies changes when the credential check moves out-of-process.
 */
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { authConfig } from './auth.config';
import { identityLogin } from './identity-client';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;

        // Delegate credential verification to identity-service.
        const result = await identityLogin(parsed.data);
        if (!result.ok) return null;

        const { user_id, email, name } = result.user;

        // Idempotent mirror so FKs resolve. `onConflictDoNothing` keeps this
        // safe to run on every sign-in even though sign-up writes the row
        // first; in steady state this is a no-op.
        await db
          .insert(users)
          .values({ id: user_id, email, name: name.length > 0 ? name : null })
          .onConflictDoNothing({ target: users.id });

        return { id: user_id, email, name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === 'string') session.user.id = token.id;
      return session;
    },
  },
});
