/**
 * Full Auth.js v5 configuration with the Drizzle adapter and the credentials
 * provider. Runs in the Node.js runtime only.
 *
 * Session strategy: JWT. Auth.js v5's credentials provider does not compose
 * cleanly with database sessions — the adapter expects the OAuth-style
 * createUser/linkAccount/createSession lifecycle and credentials short-
 * circuits it. JWT keeps things working today; when an OAuth provider is
 * added we can revisit and switch to database sessions for OAuth flows.
 * The adapter is still wired up so user/account/session tables remain the
 * source of truth for identity.
 */
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { db } from '@/db/client';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

// AUTH_SECRET enforcement: Auth.js v5 surfaces a clear error at request time
// when the secret is missing; we don't add a redundant import-time throw,
// which would also break Next.js's build-time route metadata collection. The
// Docker entrypoint should still set the variable in any real deployment.

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
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

        const { email, password } = parsed.data;
        const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!row?.passwordHash) return null;

        const ok = await bcrypt.compare(password, row.passwordHash);
        if (!ok) return null;

        return { id: row.id, email: row.email, name: row.name };
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
