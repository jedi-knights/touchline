import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/app/sign-out-button';
import { requireUser } from '@/server/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Touchline
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-300">
              <Link href="/teams" className="hover:text-white">
                Teams
              </Link>
              <Link href="/matches" className="hover:text-white">
                Matches
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-400 sm:inline">{user.name ?? user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
