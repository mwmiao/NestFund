'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui';

/**
 * Submit button for a form with a server action: while the action runs it is disabled (no double-submit),
 * shows a spinner in place of the label (same size, so the layout does not jump) and is announced as busy.
 * Must be rendered inside the <form>. Extra props (name, value, aria-*, formAction) pass through.
 */
export function SubmitButton({ children, className = 'btn-primary', disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...rest} className={`relative ${className}`} disabled={disabled || pending} aria-busy={pending || undefined}>
      <span className={pending ? 'invisible' : undefined}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}
