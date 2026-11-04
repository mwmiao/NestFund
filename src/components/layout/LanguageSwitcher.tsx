'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setLocaleAction } from '@/app/actions';
import { useI18n } from '@/i18n/client';
import { LOCALES } from '@/i18n/config';

const LABELS: Record<string, string> = { 'pt-PT': 'PT', 'en-US': 'EN' };

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          aria-pressed={l === locale}
          onClick={() =>
            start(async () => {
              await setLocaleAction(l);
              router.refresh();
            })
          }
          className={`flex min-h-9 items-center rounded-md px-3 py-1 font-medium transition ${
            l === locale ? 'bg-brand-600 text-white' : 'text-subtle hover:text-ink'
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
