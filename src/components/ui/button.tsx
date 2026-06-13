import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-pitch hover:bg-pitch-dark text-white focus-visible:ring-pitch',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 focus-visible:ring-slate-500',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-200 focus-visible:ring-slate-500',
};

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        // Minimum 48px tap target per the brief.
        'inline-flex min-h-tap items-center justify-center rounded-lg px-5 py-3 text-base font-semibold',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantStyles[variant],
        className,
      )}
      {...rest}
    />
  );
}
