'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { useI18n } from '@/i18n/client';

/** Shown when a page throws while rendering. `reset` re-renders the failed segment. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-xl font-semibold">{t('error.title')}</h1>
      <p className="muted mt-2 text-sm">{t('error.hint')}</p>
      {error.digest && <p className="muted mt-2 text-xs">{t('error.reference', { id: error.digest })}</p>}
      <div className="mt-6 flex justify-center gap-2">
        {/* reset() alone only re-renders the client boundary; refresh() refetches the server components */}
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(() => {
              router.refresh();
              reset();
            })
          }
        >
          {t('error.retry')}
        </button>
        <Link href="/" className="btn-secondary">
          {t('nav.dashboard')}
        </Link>
      </div>
    </div>
  );
}
