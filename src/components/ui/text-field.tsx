import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, className, ...rest }: TextFieldProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm font-medium text-slate-200">
      {label}
      <input
        id={inputId}
        className={cn(
          'min-h-tap rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base text-slate-50',
          'placeholder:text-slate-500 focus:border-pitch focus:outline-none focus:ring-1 focus:ring-pitch',
          className,
        )}
        {...rest}
      />
    </label>
  );
}
