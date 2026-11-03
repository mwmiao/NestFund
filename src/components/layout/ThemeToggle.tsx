'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setThemeAction } from '@/app/actions';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';

const SUN = 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M12 17a5 5 0 100-10 5 5 0 000 10z';
const MOON = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z';

export function ThemeToggle({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn-ghost !p-2"
      disabled={pending}
      title={`${t('common.theme')}: ${t(`common.${next}`)}`}
      aria-label={`${t('common.theme')}: ${t(`common.${next}`)}`}
      onClick={() =>
        start(async () => {
          document.documentElement.classList.toggle('dark', next === 'dark');
          await setThemeAction(next);
          router.refresh();
        })
      }
    >
      <Icon d={theme === 'dark' ? SUN : MOON} className="h-4 w-4" />
    </button>
  );
}
