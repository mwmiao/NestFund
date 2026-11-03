'use client';

import { useActionState } from 'react';
import { importCsvAction } from '@/app/actions';
import { useI18n } from '@/i18n/client';

export function ImportCsvForm() {
  const { t } = useI18n();
  const [result, action, pending] = useActionState(importCsvAction, null);
  return (
    <form action={action} className="space-y-3">
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm dark:file:bg-zinc-800 dark:file:text-zinc-200"
      />
      <p className="muted text-xs">{t('tx.importHint')}</p>
      <button className="btn-secondary w-full" disabled={pending}>
        ⬆ {pending ? '…' : t('tx.import')}
      </button>
      {result && (
        <p className="text-sm">
          {t('tx.importDone', { n: result.imported })}
          {result.skipped > 0 && <span className="muted"> · {t('tx.importErrors', { n: result.skipped })}</span>}
        </p>
      )}
    </form>
  );
}
