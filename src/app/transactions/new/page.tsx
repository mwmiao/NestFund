import { TransactionForm } from '@/components/transactions/TransactionForm';
import { Card, PageHeader } from '@/components/ui';
import { getI18n, pageTitle } from '@/i18n/server';
import { todayISO } from '@/lib/dates';
import { parseAgainParams } from '@/lib/tx-again';
import { asTxFormError } from '@/lib/tx-form-error';
import { transactionFormOptions } from '@/lib/tx-options';

export const generateMetadata = pageTitle('tx.new');
export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ error?: string; type?: string; saved?: string; date?: string; n?: string }> }) {
  const sp = await searchParams;
  const again = parseAgainParams(sp);
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('tx.new')} />
      <Card>
        <TransactionForm
          key={again.formKey}
          {...transactionFormOptions(t)}
          today={todayISO()}
          back="/transactions"
          error={asTxFormError(sp.error)}
          initialType={sp.type}
          initialDate={again.date}
        />
      </Card>
    </div>
  );
}
