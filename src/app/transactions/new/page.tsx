import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { todayISO } from '@/lib/dates';
import { transactionFormOptions } from '@/lib/tx-options';

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ error?: string; type?: string }> }) {
  const { error, type } = await searchParams;
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('tx.new')} />
      <Card>
        <TransactionForm {...transactionFormOptions(t)} today={todayISO()} back="/transactions" error={error} initialType={type} />
      </Card>
    </div>
  );
}
