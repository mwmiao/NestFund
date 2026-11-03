import { EtfSimulator } from '@/components/simulators/EtfSimulator';
import { HouseSimulator } from '@/components/simulators/HouseSimulator';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { currentMonth } from '@/lib/dates';
import { accountBalances, ensureMonthBudget, getProfile } from '@/lib/repo';

export default async function SimulatorsPage() {
  const { t } = await getI18n();
  const profile = getProfile();
  const budget = ensureMonthBudget(currentMonth());
  const sumKind = (k: string) => budget.items.filter((i) => i.kind === k).reduce((s, i) => s + i.amount, 0);
  const balances = accountBalances();

  return (
    <>
      <PageHeader title={t('sim.title')} subtitle={t('app.disclaimer')} />
      <div className="space-y-4">
        <Card title={t('sim.house')}>
          <p className="muted -mt-1 mb-4 text-sm">{t('sim.houseHint')}</p>
          <HouseSimulator
            defaults={{
              housePrice: 250_000,
              downPaymentPct: 10,
              purchaseCostsPct: 7,
              monthlyContribution: sumKind('savings') || 600,
              annualBonus: profile.annualBonus,
              initialBalance: balances.traderepublic.balance,
            }}
          />
        </Card>
        <Card title={t('sim.etf')}>
          <p className="muted -mt-1 mb-4 text-sm">{t('sim.etfHint')}</p>
          <EtfSimulator defaults={{ monthlyContribution: sumKind('etf') || 500, currentValue: balances.trading212.balance }} />
        </Card>
      </div>
    </>
  );
}
