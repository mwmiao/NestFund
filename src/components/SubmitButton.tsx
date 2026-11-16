'use client';

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { Spinner } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/**
 * Submit button for a form with a server action: while the action runs it is disabled (no double-submit),
 * shows a spinner in place of the label (same size, so the layout does not jump) and is announced as busy.
 * Must be rendered inside the <form>. Extra props (name, value, aria-*, formAction) pass through.
 * `savedTick`: for forms that save in place (no redirect), show a tick for a moment when the action has finished.
 * Use it only where a finished action means the data was saved.
 */
export function SubmitButton({ children, className = 'btn-primary', disabled, savedTick = false, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { savedTick?: boolean }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  const wasPending = useRef(false);
  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || !savedTick) return;
    setDone(true);
    const timer = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(timer);
  }, [pending, savedTick]);
  const overlay = pending || done;
  return (
    <button type="submit" {...rest} className={`relative ${className}`} disabled={disabled || pending} aria-busy={pending || undefined}>
      <span className={overlay ? 'invisible' : undefined}>{children}</span>
      {overlay && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          {pending ? <Spinner /> : '✓'}
        </span>
      )}
      <span className="sr-only" role="status">
        {done ? t('common.saved') : ''}
      </span>
    </button>
  );
}
