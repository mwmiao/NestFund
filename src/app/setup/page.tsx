import Link from 'next/link';
import { dismissOnboardingAction, resetDataAction, setupBalancesAction, setupGoalsAction, setupIncomeAction } from '@/app/actions';
import { AccountBadge } from '@/components/AccountBadge';
import { ConfirmButton } from '@/components/ConfirmButton';
import { FixedExpensesForm } from '@/components/setup/FixedExpensesForm';
import { Alert, Card, Field, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { formatMoney, toInputDecimal } from '@/lib/format';
import { accountName, categoryName } from '@/lib/labels';
import { ONBOARDING_STEPS, accountBalances, getOnboarding, getProfile, hasSampleData, listBudgetItems, listCategories, listGoals, type OnboardingStep } from '@/lib/repo';

type Step = OnboardingStep | 'done';

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; reset?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const onboarding = getOnboarding();
  const firstOpen = ONBOARDING_STEPS.find((s) => !onboarding.done.includes(s));
  const step: Step = ONBOARDING_STEPS.includes(sp.step as OnboardingStep) || sp.step === 'done' ? (sp.step as Step) : (firstOpen ?? 'done');
  const nextHref = (s: OnboardingStep) => {
    const i = ONBOARDING_STEPS.indexOf(s);
    return i < ONBOARDING_STEPS.length - 1 ? `/setup?step=${ONBOARDING_STEPS[i + 1]}` : '/setup?step=done';
  };

  const balances = accountBalances();
  const profile = getProfile();
  const goals = listGoals();
  const fixed = listBudgetItems().filter((i) => i.kind === 'fixed');
  const categories = listCategories()
    .filter((c) => c.kind === 'expense')
    .map((c) => ({ id: c.id, label: categoryName(c, t) }));

  const actions = (s: OnboardingStep) => (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Link href={nextHref(s)} className="btn-secondary">
        {t('setup.skip')}
      </Link>
      <button className="btn-primary">{t('setup.saveContinue')}</button>
    </div>
  );
  const amountInput = (name: string, value?: number) => (
    <input name={name} inputMode="decimal" placeholder="0,00 €" defaultValue={value ? toInputDecimal(value) : ''} className="input tabular-nums" />
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('setup.title')} subtitle={t('setup.subtitle')} />

      <div className="mb-4 space-y-2 empty:hidden">
        {sp.reset && <Alert tone="success">{t('setup.resetDone')}</Alert>}
        {hasSampleData() && <Alert tone="warning">{t('setup.sampleDetected')}</Alert>}
      </div>

      <ol className="mb-4 grid grid-cols-4 gap-1.5" aria-label={t('setup.title')}>
        {ONBOARDING_STEPS.map((s, i) => {
          const done = onboarding.done.includes(s);
          const current = s === step;
          return (
            <li key={s}>
              <Link
                href={`/setup?step=${s}`}
                aria-current={current ? 'step' : undefined}
                className={`flex flex-col gap-1 rounded-xl border px-2 py-2 text-xs transition sm:px-3 ${
                  current ? 'border-brand-500 bg-brand-500/10' : 'border-line '
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${done ? 'bg-brand-600 text-white' : 'bg-raised '}`}>
                  {done ? '✓' : i + 1}
                </span>
                <span className="truncate font-medium">{t(`setup.steps.${s}`)}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      {step === 'balances' && (
        <Card title={t('setup.steps.balances')}>
          <p className="muted mb-4 text-sm">{t('setup.balancesHint')}</p>
          <form action={setupBalancesAction} className="space-y-3">
            {(['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card'] as const).map((a) => (
              <div key={a} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                <div>
                  <AccountBadge id={a} label={accountName(a, t)} />
                  <div className="muted mt-1 text-xs">{t(`accounts.purpose.${a}`)}</div>
                </div>
                {amountInput(a, balances[a].since ? balances[a].balance : undefined)}
              </div>
            ))}
            <Field label={t('setup.investedHint')}>{amountInput('trading212_invested', balances.trading212.since ? balances.trading212.invested : undefined)}</Field>
            {actions('balances')}
          </form>
        </Card>
      )}

      {step === 'income' && (
        <Card title={t('setup.steps.income')}>
          <p className="muted mb-4 text-sm">{t('setup.incomeHint')}</p>
          <form action={setupIncomeAction} className="space-y-3">
            <Field label={`${t('setup.salary')} (€)`}>{amountInput('salary', profile.defaultIncome)}</Field>
            <Field label={`${t('dashboard.mealCard')} (€)`}>{amountInput('mealCard', profile.mealCard)}</Field>
            <p className="muted text-xs">{t('dashboard.mealCardHint')}</p>
            {actions('income')}
          </form>
        </Card>
      )}

      {step === 'fixed' && (
        <Card title={t('setup.steps.fixed')}>
          <p className="muted mb-4 text-sm">{t('setup.fixedHint')}</p>
          {fixed.length > 0 && (
            <ul className="mb-4 divide-y divide-line/70 rounded-xl border border-line text-sm">
              {fixed.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-3 py-2">
                  <span>{i.name}</span>
                  <span className="tabular-nums">{money(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <FixedExpensesForm categories={categories} skipHref={nextHref('fixed')} />
        </Card>
      )}

      {step === 'goals' && (
        <Card title={t('setup.steps.goals')}>
          <p className="muted mb-4 text-sm">{t('setup.goalsHint')}</p>
          <form action={setupGoalsAction} className="space-y-5">
            {(['emergency', 'house'] as const).map((kind) => {
              const g = goals.find((x) => x.kind === kind);
              return (
                <fieldset key={kind} className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold">{t(`goals.kinds.${kind}`)}</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`${t('goals.target')} (€)`}>{amountInput(`${kind}Target`, g?.target)}</Field>
                    <Field label={`${t('goals.monthly')} (€)`}>{amountInput(`${kind}Monthly`, g?.monthly)}</Field>
                  </div>
                  <Field label={`${t('goals.targetDate')} (${t('common.optional')})`}>
                    <input type="month" name={`${kind}Date`} defaultValue={g?.targetDate ?? ''} className="input" />
                  </Field>
                </fieldset>
              );
            })}
            <p className="muted text-xs">{t('setup.goalsAccountNote')}</p>
            {actions('goals')}
          </form>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <div className="py-4 text-center">
            <div className="text-4xl">🎉</div>
            <h2 className="mt-2 text-lg font-semibold">{t('setup.doneTitle')}</h2>
            <p className="muted mx-auto mt-1 max-w-md text-sm">{t('setup.doneHint')}</p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href="/transactions/new" className="btn-primary">
                + {t('common.quickAdd')}
              </Link>
              <Link href="/budget" className="btn-secondary">
                {t('setup.adjustBudget')}
              </Link>
              <Link href="/" className="btn-ghost">
                {t('nav.dashboard')}
              </Link>
            </div>
          </div>
        </Card>
      )}

      {step !== 'done' && (
        <form action={dismissOnboardingAction} className="mt-3 text-center">
          <button className="btn-ghost text-sm">{t('setup.later')}</button>
        </form>
      )}

      <section id="reset" className="mt-10 rounded-card border border-negative/30 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-negative">{t('setup.resetTitle')}</h2>
        <p className="muted mt-1 text-sm">{t('setup.resetHint')}</p>
        <form action={resetDataAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="1" required className="h-4 w-4 accent-rose-600" />
            {t('setup.resetConfirm')}
          </label>
          <ConfirmButton className="btn border border-negative/40 text-negative hover:bg-negative/10">
            {t('setup.resetButton')}
          </ConfirmButton>
        </form>
      </section>
    </div>
  );
}
