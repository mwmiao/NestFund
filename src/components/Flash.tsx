'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { flashMessageKey, withoutFlash } from '@/lib/flash';

const VISIBLE_MS = 4000;

/**
 * Shows the one-off confirmation a redirect left in the URL (`?saved=1`, `?deleted=1`) as a toast, then removes the
 * parameter from the address bar so a reload or the back button does not repeat it.
 */
export function Flash() {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = flashMessageKey(pathname, params);
    if (!key) return; // also the case right after the parameter was removed: the toast stays until its timer ends
    setMessage(t(key));
    window.history.replaceState(null, '', withoutFlash(pathname, params) + window.location.hash);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, params]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The live region is always in the page so screen readers announce the text when it appears.
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-[4.25rem] z-50 flex justify-center lg:left-64 lg:top-4">
      {message && <p className="pointer-events-auto rounded-control border border-positive/30 bg-surface px-4 py-3 text-sm shadow-pop">{message}</p>}
    </div>
  );
}
