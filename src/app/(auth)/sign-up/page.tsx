import Link from 'next/link';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata = { title: 'Sign up · Touchline' };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-slate-400">
          One account per coach — teams, players, and match history are private to you.
        </p>
      </header>
      <SignUpForm />
      <p className="text-sm text-slate-400">
        Already have an account?{' '}
        <Link className="text-pitch underline-offset-4 hover:underline" href="/sign-in">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
