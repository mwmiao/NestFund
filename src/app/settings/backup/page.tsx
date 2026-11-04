import Link from 'next/link';
import { createBackupAction, stageImportAction } from '@/app/backup-actions';
import { Alert, Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { listBackups } from '@/lib/backup';
import { formatDateTime } from '@/lib/dates';

const DATASETS = ['transactions', 'accounts', 'snapshots', 'categories', 'budgets', 'goals', 't212'] as const;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function BackupPage({ searchParams }: { searchParams: Promise<{ created?: string; imported?: string; importError?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const backups = listBackups();
  const [created, updated] = (sp.imported ?? '').split('-').map(Number);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('backup.title')}
        subtitle={
          <Link href="/settings" className="link">
            ← {t('settings.title')}
          </Link>
        }
      />

      <div className="mb-4 space-y-2 empty:hidden">
        {sp.created && <Alert tone="success">{t('backup.created')}</Alert>}
        {sp.imported && <Alert tone="success">{t('backup.imported', { created: created || 0, updated: updated || 0 })}</Alert>}
        {sp.importError && <Alert tone="danger">{t(`backup.importErrors.${sp.importError}`)}</Alert>}
      </div>

      <Card title={t('backup.nowTitle')} subtitle={t('backup.nowHint')} className="mb-4">
        <form action={createBackupAction}>
          <button className="btn-primary w-full sm:w-auto">{t('backup.now')}</button>
        </form>
        {backups.length > 0 && (
          <ul className="mt-4 divide-y divide-line/70 border-t border-line/70">
            {backups.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="min-w-0 flex-1 break-all font-mono text-xs">{b.name}</span>
                <span className="muted text-xs">
                  {formatDateTime(b.modified, locale)} · {kb(b.size)}
                </span>
                {b.name.endsWith('.json') ? (
                  <a href={`/api/backup/file?name=${encodeURIComponent(b.name)}`} className="link" download>
                    {t('backup.download')}
                  </a>
                ) : (
                  <span className="muted text-xs">{t('backup.volumeOnly')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('backup.exportTitle')} subtitle={t('backup.exportHint')} className="mb-4">
        <form method="get" action="/api/backup/export" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">{t('backup.from')}</span>
              <input type="date" name="from" className="input" />
            </label>
            <label className="block">
              <span className="label">{t('backup.to')}</span>
              <input type="date" name="to" className="input" />
            </label>
          </div>
          <p className="muted text-xs">{t('backup.periodHint')}</p>
          <div>
            <button name="format" value="json" className="btn-primary w-full sm:w-auto">
              ⬇ {t('backup.exportJson')}
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-line/70 pt-4">
            <label className="block min-w-0 flex-1 basis-48">
              <span className="label">{t('backup.csvDataset')}</span>
              <select name="dataset" className="input">
                {DATASETS.map((d) => (
                  <option key={d} value={d}>
                    {t(`backup.datasets.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            <button name="format" value="csv" className="btn-secondary">
              ⬇ {t('backup.exportCsv')}
            </button>
          </div>
        </form>
        <p className="muted mt-3 text-xs">{t('backup.noSecrets')}</p>
      </Card>

      <Card title={t('backup.importTitle')} subtitle={t('backup.importHint')} className="mb-4">
        <form action={stageImportAction} className="space-y-3">
          <input
            type="file"
            name="file"
            accept=".json,.csv,application/json,text/csv"
            required
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink"
          />
          <button className="btn-secondary w-full sm:w-auto">⬆ {t('backup.preview')}</button>
        </form>
        <p className="muted mt-3 text-xs">{t('backup.previewFirst')}</p>
      </Card>

      <p className="muted text-xs">{t('backup.readmeNote')}</p>
    </div>
  );
}
