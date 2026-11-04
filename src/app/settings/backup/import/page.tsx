import { redirect } from 'next/navigation';
import { cancelImportAction, confirmImportAction } from '@/app/backup-actions';
import { Alert, Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { readStaged } from '@/lib/backup';
import { SECTIONS, planTotals, type SectionName } from '@/lib/backup-format';
import { buildImportPlan } from '@/lib/import-plan';
import { formatMoney } from '@/lib/format';

const SAMPLE = 8;

/** Read-only: shows what the file would create, update and ignore. Nothing is written until "Confirm". */
export default async function ImportPreviewPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const { t, locale } = await getI18n();
  const staged = readStaged(token);
  if (!staged) redirect('/settings/backup?importError=expired');
  const result = buildImportPlan(staged.kind, staged.content);
  if (!result.ok) redirect(`/settings/backup?importError=${result.error}`);
  const { plan, invalid, csvInvalid } = result;
  const totals = planTotals(plan);
  const sections = SECTIONS.filter((s) => plan[s].create.length + plan[s].update.length + plan[s].ignore.length > 0);
  const nothing = totals.create + totals.update === 0;
  const money = (v: number) => formatMoney(v, locale);
  const label = (s: SectionName) => t(`backup.sections.${s}`);
  const field = (f: string) => t(`backup.fields.${f}`) || f;

  // Short human label of a record, for the sample lists.
  const describe = (s: SectionName, item: unknown): string => {
    const o = item as Record<string, never>;
    switch (s) {
      case 'transactions':
        return `${o.date} · ${o.description} · ${money(Number(o.amount))}`;
      case 'snapshots':
        return `${o.date} · ${o.account} · ${money(Number(o.value))}`;
      case 'monthBudgets':
        return String(o.month);
      case 't212History':
        return `${o.date} · ${money(Number(o.totalValue))}`;
      case 'rules':
        return `“${o.text}”`;
      default:
        return String(o.name);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('backup.previewTitle')} subtitle={t('backup.previewIntro')} />

      <div className="mb-4 space-y-2 empty:hidden">
        {nothing && <Alert tone="info">{t('backup.nothingToDo')}</Alert>}
        {invalid.length > 0 && <Alert tone="warning">{t('backup.invalidItems', { n: invalid.length })}</Alert>}
        {plan.unknownCategories.length > 0 && <Alert tone="warning">{t('backup.unknownCategories', { n: plan.unknownCategories.length })}</Alert>}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card text-center">
          <div className="eyebrow">{t('backup.willCreate')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-positive">{totals.create}</div>
        </div>
        <div className="card text-center">
          <div className="eyebrow">{t('backup.willUpdate')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-caution">{totals.update}</div>
        </div>
        <div className="card text-center">
          <div className="eyebrow">{t('backup.willIgnore')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.ignore}</div>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((s) => {
          const p = plan[s];
          return (
            <Card key={s} title={label(s)} subtitle={t('backup.sectionCounts', { create: p.create.length, update: p.update.length, ignore: p.ignore.length })}>
              {p.create.length > 0 && (
                <div className="mb-3">
                  <h3 className="eyebrow mb-1 text-positive">{t('backup.willCreate')}</h3>
                  <ul className="space-y-0.5 text-sm">
                    {p.create.slice(0, SAMPLE).map((item, i) => (
                      <li key={i} className="truncate">
                        {describe(s, item)}
                      </li>
                    ))}
                  </ul>
                  {p.create.length > SAMPLE && <p className="muted mt-1 text-xs">{t('backup.andMore', { n: p.create.length - SAMPLE })}</p>}
                </div>
              )}
              {p.update.length > 0 && (
                <div className="mb-3">
                  <h3 className="eyebrow mb-1 text-caution">{t('backup.willUpdate')}</h3>
                  <ul className="space-y-0.5 text-sm">
                    {p.update.slice(0, SAMPLE).map(({ item, changes }, i) => (
                      <li key={i}>
                        {describe(s, item)} <span className="muted text-xs">({changes.map(field).join(', ')})</span>
                      </li>
                    ))}
                  </ul>
                  {p.update.length > SAMPLE && <p className="muted mt-1 text-xs">{t('backup.andMore', { n: p.update.length - SAMPLE })}</p>}
                </div>
              )}
              {p.ignore.length > 0 && <p className="muted text-xs">{t('backup.ignoredExist', { n: p.ignore.length })}</p>}
            </Card>
          );
        })}
        {plan.profile && (
          <Card title={t('backup.profile')} subtitle={t('backup.sectionCounts', { create: 0, update: 1, ignore: 0 })}>
            <p className="text-sm">{plan.profile.changes.map(field).join(', ')}</p>
          </Card>
        )}
        {csvInvalid.length > 0 && (
          <Card title={t('backup.csvProblems')} subtitle={t('backup.csvProblemsHint', { n: csvInvalid.length })}>
            <ul className="space-y-0.5 text-sm">
              {csvInvalid.slice(0, 20).map((r) => (
                <li key={r.line}>{t('backup.csvLine', { line: r.line, reason: t(`backup.csvReasons.${r.reason}`) })}</li>
              ))}
            </ul>
            {csvInvalid.length > 20 && <p className="muted mt-1 text-xs">{t('backup.andMore', { n: csvInvalid.length - 20 })}</p>}
          </Card>
        )}
        {invalid.length > 0 && (
          <Card title={t('backup.jsonProblems')}>
            <ul className="space-y-0.5 text-sm">
              {invalid.slice(0, 20).map((r, i) => (
                <li key={i}>
                  {label(r.section as SectionName)} #{r.index + 1}: <span className="muted">{r.reason}</span>
                </li>
              ))}
            </ul>
            {invalid.length > 20 && <p className="muted mt-1 text-xs">{t('backup.andMore', { n: invalid.length - 20 })}</p>}
          </Card>
        )}
      </div>

      <p className="muted mb-3 mt-5 text-xs">{t('backup.safetyNote')}</p>
      <div className="flex flex-wrap gap-2">
        {!nothing && (
          <form action={confirmImportAction} className="flex-1 sm:flex-none">
            <input type="hidden" name="token" value={token} />
            <button className="btn-primary min-h-12 w-full">{t('backup.confirm', { n: totals.create + totals.update })}</button>
          </form>
        )}
        <form action={cancelImportAction} className="flex-1 sm:flex-none">
          <input type="hidden" name="token" value={token} />
          <button className="btn-ghost w-full">{nothing ? t('backup.back') : t('common.cancel')}</button>
        </form>
      </div>
    </div>
  );
}
