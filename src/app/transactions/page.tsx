import Link from 'next/link';
import { ImportCsvForm } from '@/components/transactions/ImportCsvForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Alert, Card, PageHeader, Stat } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { currentMonth } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { accountName, categoryName } from '@/lib/labels';
import { listCategories, listTransactions, materializeRecurring } from '@/lib/repo';
import { parseTxFilters } from '@/lib/tx-filters';
import { ACCOUNT_IDS, PAYMENT_METHODS, TX_TYPES, isSpending } from '@/lib/types';

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  materializeRecurring();

  // Default to the current month when no filter is given at all.
  const hasFilter = ['month', 'year', 'category', 'account', 'method', 'type', 'q'].some((k) => sp[k] !== undefined);
  const filters = parseTxFilters(hasFilter ? sp : { ...sp, month: currentMonth() });
  const categories = listCategories();
  const txs = listTransactions(filters);

  const sum = (list: typeof txs) => list.reduce((s, x) => s + x.amount, 0);
  const outflow = sum(txs.filter((x) => isSpending(x.type) && x.account !== 'meal_card'));
  const inflow = sum(txs.filter((x) => x.type === 'income' && x.account !== 'meal_card'));
  const meal = sum(txs.filter((x) => isSpending(x.type) && x.account === 'meal_card'));
  const money = (v: number) => formatMoney(v, locale);

  const exportQuery = new URLSearchParams(
    Object.entries({
      month: filters.month,
      year: filters.year,
      category: filters.categoryId?.toString(),
      account: filters.account,
      method: filters.paymentMethod,
      type: filters.type,
      q: filters.q,
    }).filter(
      (e): e is [string, string] => !!e[1],
    ),
  ).toString();

  return (
    <>
      <PageHeader
        title={t('tx.title')}
        subtitle={t('tx.count', { n: txs.length })}
        actions={
          <>
            <Link href="/transactions/categories" className="btn-secondary">
              {t('tx.manageCategories')}
            </Link>
            <Link href="/transactions/new" className="btn-primary">
              + {t('tx.new')}
            </Link>
          </>
        }
      />

      {sp.saved && (
        <div className="mb-4">
          <Alert tone="success">{t('tx.added')}</Alert>
        </div>
      )}

      <Card className="mb-4">
        <form className="space-y-2" method="get">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input type="search" name="q" defaultValue={filters.q ?? ''} placeholder={t('tx.search')} aria-label={t('tx.search')} className="input" />
            <input type="month" name="month" defaultValue={filters.month ?? ''} className="input" aria-label={t('common.month')} />
          </div>
          {/* Secondary filters stay collapsed on mobile unless one is active, so the list is reachable quickly. */}
          <details open={!!(filters.year || filters.categoryId || filters.account || filters.paymentMethod || filters.type)} className="group">
            <summary className="cursor-pointer select-none py-1 text-sm text-brand-500">{t('tx.filters')}</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
          <input name="year" inputMode="numeric" defaultValue={filters.year ?? ''} placeholder={t('common.year')} className="input" aria-label={t('common.year')} />
          <select name="category" defaultValue={filters.categoryId ?? ''} className="input" aria-label={t('tx.category')}>
            <option value="">{t('tx.anyCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryName(c, t)}
              </option>
            ))}
          </select>
          <select name="account" defaultValue={filters.account ?? ''} className="input" aria-label={t('tx.account')}>
            <option value="">{t('tx.anyAccount')}</option>
            {ACCOUNT_IDS.map((a) => (
              <option key={a} value={a}>
                {accountName(a, t)}
              </option>
            ))}
          </select>
          <select name="method" defaultValue={filters.paymentMethod ?? ''} className="input" aria-label={t('tx.paymentMethod')}>
            <option value="">{t('tx.anyMethod')}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`tx.methods.${m}`)}
              </option>
            ))}
          </select>
          <select name="type" defaultValue={filters.type ?? ''} className="input" aria-label={t('tx.type')}>
            <option value="">{t('tx.anyType')}</option>
            {TX_TYPES.map((m) => (
              <option key={m} value={m}>
                {t(`tx.types.${m}`)}
              </option>
            ))}
          </select>
            </div>
          </details>
          <div className="flex justify-end gap-2">
            <Link href="/transactions?month=" className="btn-ghost">
              {t('common.clear')}
            </Link>
            <button className="btn-primary">{t('common.apply')}</button>
          </div>
        </form>
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label={t('tx.outflow')} value={money(outflow)} />
        <Stat label={t('tx.inflow')} value={money(inflow)} tone="positive" />
        <Stat label={t('tx.mealCardTotal')} value={money(meal)} tone="muted" />
      </div>
      <p className="muted mb-4 text-xs">
        {t('tx.mealCardNote')} {t('tx.transferNote')}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <TransactionList transactions={txs} categories={categories} locale={locale} />
        </Card>
        <div className="space-y-4">
          <Card title={t('tx.export')}>
            <a href={`/api/transactions/export${exportQuery ? '?' + exportQuery : ''}`} className="btn-secondary w-full">
              ⬇ {t('tx.export')}
            </a>
          </Card>
          <Card title={t('tx.import')}>
            <ImportCsvForm />
          </Card>
        </div>
      </div>
    </>
  );
}
