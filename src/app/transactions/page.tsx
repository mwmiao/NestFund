import Link from 'next/link';
import { ImportCsvForm } from '@/components/transactions/ImportCsvForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Alert, Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { currentMonth, monthLabel } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { accountName, categoryName } from '@/lib/labels';
import { listCategories, listTransactions, materializeRecurring } from '@/lib/repo';
import { parseTxFilters } from '@/lib/tx-filters';
import { ACCOUNTS, PAYMENT_METHODS, TX_TYPES, isSpending, type AccountId } from '@/lib/types';

const FILTER_ACCOUNTS: AccountId[] = ['ctt', 'revolut', 'meal_card', 'trading212', 'traderepublic', 'cash'];

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

  const query = (overrides: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      month: filters.month,
      year: filters.year,
      category: filters.categoryId?.toString(),
      account: filters.account,
      method: filters.paymentMethod,
      type: filters.type,
      q: filters.q,
      ...overrides,
    };
    const qs = new URLSearchParams(Object.entries(base).filter((e): e is [string, string] => !!e[1])).toString();
    return qs ? `?${qs}` : '?month=';
  };
  const secondaryActive = !!(filters.year || filters.categoryId || filters.paymentMethod || filters.type);

  return (
    <>
      <PageHeader
        title={t('tx.title')}
        subtitle={filters.month ? `${monthLabel(filters.month, locale)} · ${t('tx.count', { n: txs.length })}` : t('tx.count', { n: txs.length })}
        actions={
          <>
            <Link href="/transactions/categories" className="btn-ghost">
              {t('tx.manageCategories')}
            </Link>
            <Link href="/transactions/new" className="btn-primary hidden sm:inline-flex">
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

      <form method="get" className="mb-4 space-y-3">
        {filters.account && <input type="hidden" name="account" value={filters.account} />}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input type="search" name="q" defaultValue={filters.q ?? ''} placeholder={t('tx.search')} aria-label={t('tx.search')} className="input" />
          <input type="month" name="month" defaultValue={filters.month ?? ''} className="input w-auto" aria-label={t('common.month')} />
        </div>

        {/* Account chips: one tap to see a single account; the meal card is clearly separate. */}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t('tx.account')}>
          <Link href={query({ account: undefined })} className={`chip shrink-0 ${!filters.account ? 'chip-active' : ''}`} aria-current={!filters.account ? 'true' : undefined}>
            {t('tx.anyAccount')}
          </Link>
          {FILTER_ACCOUNTS.map((a) => (
            <Link key={a} href={query({ account: a })} className={`chip shrink-0 ${filters.account === a ? 'chip-active' : ''}`} aria-current={filters.account === a ? 'true' : undefined}>
              <span className="h-2 w-2 rounded-full" style={{ background: ACCOUNTS[a].color }} aria-hidden />
              {accountName(a, t)}
            </Link>
          ))}
        </div>

        <div className="flex items-start gap-3">
        <details open={secondaryActive} className="min-w-0 flex-1">
          <summary className="link inline-flex cursor-pointer select-none py-2">{t('tx.filters')}</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <input name="year" inputMode="numeric" defaultValue={filters.year ?? ''} placeholder={t('common.year')} className="input" aria-label={t('common.year')} />
            <select name="category" defaultValue={filters.categoryId ?? ''} className="input" aria-label={t('tx.category')}>
              <option value="">{t('tx.anyCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, t)}
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
        <div className="flex shrink-0 gap-2">
          <Link href="/transactions?month=" className="btn-ghost">
            {t('common.clear')}
          </Link>
          <button className="btn-secondary">{t('common.apply')}</button>
        </div>
        </div>
      </form>

      <Card>
        <dl className="-mt-1 mb-4 flex flex-wrap gap-x-6 gap-y-1 border-b border-line pb-3 text-sm">
          <div className="flex gap-1.5">
            <dt className="muted">{t('tx.outflow')}</dt>
            <dd className="font-medium tabular-nums">{money(outflow)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="muted">{t('tx.inflow')}</dt>
            <dd className="font-medium tabular-nums text-positive">{money(inflow)}</dd>
          </div>
          {meal > 0 && (
            <div className="flex gap-1.5">
              <dt className="muted">{t('tx.mealCardTotal')}</dt>
              <dd className="font-medium tabular-nums" style={{ color: ACCOUNTS.meal_card.color }}>
                {money(meal)}
              </dd>
            </div>
          )}
        </dl>
        <TransactionList transactions={txs} categories={categories} locale={locale} />
        <p className="muted mt-4 text-xs">
          {t('tx.mealCardNote')} {t('tx.transferNote')}
        </p>
      </Card>

      <details className="card mt-4">
        <summary className="section-title cursor-pointer select-none">{t('tx.importExport')}</summary>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="muted mb-3 text-sm">{t('tx.exportHint')}</p>
            <a href={`/api/transactions/export${query({}) === '?month=' ? '' : query({})}`} className="btn-secondary">
              ⬇ {t('tx.export')}
            </a>
          </div>
          <ImportCsvForm />
        </div>
      </details>
    </>
  );
}
