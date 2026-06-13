/**
 * Edge-safe Auth.js config. Imported by `middleware.ts` (which runs in the
 * edge runtime and cannot pull in the Drizzle adapter or postgres-js).
 *
 * Routes that should remain reachable without a session — auth screens, the
 * Auth.js handler, the healthcheck — are allow-listed here; everything else
 * requires an authenticated user.
 */
import type { NextAuthConfig } from 'next-auth';

const PUBLIC_PATHS = new Set<string>(['/sign-in', '/sign-up']);
const PUBLIC_PREFIXES = ['/api/auth/']; // Auth.js handler
const PUBLIC_API_EXACT = new Set<string>(['/api/health']);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (PUBLIC_API_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export const authConfig = {
  pages: { signIn: '/sign-in' },
  // Filled in by `auth.ts`. Kept empty here because providers like
  // Credentials need to call into the Drizzle adapter, which can't run on
  // the edge runtime used by middleware.
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      // Already-authenticated users on the auth screens bounce to the app root.
      if (isLoggedIn && (pathname === '/sign-in' || pathname === '/sign-up')) {
        return Response.redirect(new URL('/', request.nextUrl));
      }

      if (isPublicPath(pathname)) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
