import Link from 'next/link';
import { dismissOnboardingAction } from '@/app/actions';
import type { TFunction } from '@/i18n/config';
import { ONBOARDING_STEPS, type OnboardingState } from '@/lib/repo';

/** "Start here" checklist shown on the dashboard until setup is finished or dismissed. */
export function SetupPanel({ onboarding, t }: { onboarding: OnboardingState; t: TFunction }) {
  const doneCount = onboarding.done.length;
  return (
    <section className="card mb-4 border-brand-500/30 bg-brand-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">{t('setup.cardTitle')}</h2>
          <p className="muted mt-0.5 text-sm">
            {t('setup.cardHint', { n: ONBOARDING_STEPS.length - doneCount })} · {t('setup.progress', { done: doneCount, total: ONBOARDING_STEPS.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={dismissOnboardingAction}>
            <button className="btn-ghost">{t('setup.notNow')}</button>
          </form>
          <Link href="/setup" className="btn-primary">
            {doneCount ? t('setup.resume') : t('setup.start')}
          </Link>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = onboarding.done.includes(step);
          return (
            <li key={step}>
              <Link href={`/setup?step=${step}`} className="flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm transition hover:border-brand-500/50">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${done ? 'bg-brand-600 text-white' : 'bg-raised'}`} aria-hidden>
                  {done ? '✓' : i + 1}
                </span>
                <span className="truncate font-medium">{t(`setup.steps.${step}`)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
