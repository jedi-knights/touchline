/**
 * Edge middleware that enforces authentication on every request except the
 * paths allow-listed in `auth.config.ts`. Uses the edge-safe Auth.js config
 * (no Drizzle adapter, no postgres-js) so it can run in the edge runtime.
 *
 * The `authorized` callback in `auth.config.ts` makes the allow / deny / redirect
 * decision; when it returns `false`, Auth.js redirects to `pages.signIn`.
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/server/auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
