'use client';

import { stageImportAction } from '@/app/backup-actions';
import { useI18n } from '@/i18n/client';

/** Uploads a CSV for preview; the data is only written after the preview is confirmed. */
export function ImportCsvForm() {
  const { t } = useI18n();
  return (
    <form action={stageImportAction} className="space-y-3">
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink"
      />
      <p className="muted text-xs">{t('tx.importHint')}</p>
      <button className="btn-secondary w-full">⬆ {t('tx.import')}</button>
      <p className="muted text-xs">{t('backup.previewFirst')}</p>
    </form>
  );
}
