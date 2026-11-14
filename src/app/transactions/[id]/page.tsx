import { notFound } from 'next/navigation';
import { deleteTransactionAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { todayISO } from '@/lib/dates';
import { getTransaction } from '@/lib/repo';
import { transactionFormOptions } from '@/lib/tx-options';

export default async function EditTransactionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const tx = getTransaction(Number(id));
  if (!tx) notFound();
  const { t } = await getI18n();
  const back = `/transactions?month=${tx.date.slice(0, 7)}`;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t('tx.editTitle')}
        subtitle={tx.parentId ? t('tx.generated') : undefined}
        actions={
          <form action={deleteTransactionAction}>
            <input type="hidden" name="id" value={tx.id} />
            <input type="hidden" name="back" value={back} />
            <ConfirmButton>{t('common.delete')}</ConfirmButton>
          </form>
        }
      />
      <Card>
        <TransactionForm {...transactionFormOptions(t)} transaction={tx} today={todayISO()} back={back} error={error} />
      </Card>
    </div>
  );
}
