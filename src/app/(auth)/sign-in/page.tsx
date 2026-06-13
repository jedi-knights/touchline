import Link from 'next/link';
import { SignInForm } from '@/components/auth/sign-in-form';

export const metadata = { title: 'Sign in · Touchline' };

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="text-sm text-slate-400">Welcome back to Touchline.</p>
      </header>
      <SignInForm />
      <p className="text-sm text-slate-400">
        Need an account?{' '}
        <Link className="text-pitch underline-offset-4 hover:underline" href="/sign-up">
          Create one
        </Link>
        .
      </p>
    </div>
  );
}
