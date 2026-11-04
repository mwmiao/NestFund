import { deleteRuleAction, moveRuleAction, saveRuleAction, toggleRuleAction } from '@/app/rules-actions';
import { AccountBadge } from '@/components/AccountBadge';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Badge, Card, EmptyState, Field, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { accountName, categoryName } from '@/lib/labels';
import { listCategories } from '@/lib/repo';
import { listRules } from '@/lib/rules-repo';
import { ACCOUNT_IDS } from '@/lib/types';

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ applied?: string }> }) {
  const { applied } = await searchParams;
  const { t } = await getI18n();
  const categories = listCategories();
  const rules = listRules();
  const catById = new Map(categories.map((c) => [c.id, c]));

  const categorySelect = (value?: number) => (
    <select name="categoryId" required defaultValue={value ?? ''} className="input">
      <option value="" disabled>
        —
      </option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {categoryName(c, t)}
        </option>
      ))}
    </select>
  );
  const accountSelect = (value?: string | null) => (
    <select name="account" defaultValue={value ?? ''} className="input">
      <option value="">{t('rules.anyAccount')}</option>
      {ACCOUNT_IDS.map((a) => (
        <option key={a} value={a}>
          {accountName(a, t)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHeader title={t('rules.title')} subtitle={t('rules.subtitle')} />

      {applied !== undefined && (
        <p role="status" className="mb-4 rounded-control border border-positive/30 bg-positive/10 px-3 py-2 text-sm">
          {t('rules.applied', { n: Number(applied) || 0 })}
        </p>
      )}

      <Card title={t('rules.new')} className="mb-4">
        <form action={saveRuleAction} className="grid gap-3 sm:grid-cols-2">
          <Field label={t('rules.ifContains')} className="sm:col-span-2">
            <input name="text" required maxLength={80} autoComplete="off" placeholder="Continente" className="input" />
          </Field>
          <Field label={t('rules.ifAccount')}>{accountSelect()}</Field>
          <Field label={t('rules.thenCategory')}>{categorySelect()}</Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="applyAfter" value="1" className="h-4 w-4 accent-emerald-600" />
            {t('rules.applyAfter')}
          </label>
          <button className="btn-primary sm:col-span-2 sm:justify-self-start">{t('rules.add')}</button>
        </form>
      </Card>

      {rules.length === 0 ? (
        <Card>
          <EmptyState title={t('rules.empty')} hint={t('rules.emptyHint')} />
        </Card>
      ) : (
        <ol className="space-y-3">
          {rules.map((r, i) => {
            const cat = catById.get(r.categoryId);
            return (
              <li key={r.id} className={`card ${r.enabled ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <div className="eyebrow mb-1">{t('rules.priority', { n: i + 1 })}</div>
                    <p className="break-words font-medium">{t('rules.whenContains', { text: r.text })}</p>
                    <p className="muted mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                      {r.account && (
                        <>
                          <AccountBadge id={r.account} label={accountName(r.account, t)} size="xs" />
                          {t('rules.whenAccount', { account: accountName(r.account, t) })} →
                        </>
                      )}
                      {!r.account && <span aria-hidden>→</span>}
                      {cat && (
                        <span className="inline-flex items-center gap-1.5 text-ink">
                          <span className="h-2 w-2 rounded-full" style={{ background: cat.color }} aria-hidden />
                          {categoryName(cat, t)}
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge tone={r.enabled ? 'positive' : 'muted'}>{r.enabled ? t('rules.active') : t('rules.off')}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={toggleRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="enabled" value={r.enabled ? '0' : '1'} />
                    <button className="btn-secondary" aria-pressed={r.enabled}>
                      {r.enabled ? t('rules.off') : t('rules.active')}
                    </button>
                  </form>
                  <form action={moveRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button className="btn-secondary" disabled={i === 0} aria-label={t('rules.moveUp')} title={t('rules.moveUp')}>
                      ↑
                    </button>
                  </form>
                  <form action={moveRuleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button className="btn-secondary" disabled={i === rules.length - 1} aria-label={t('rules.moveDown')} title={t('rules.moveDown')}>
                      ↓
                    </button>
                  </form>
                  <a href={`/transactions/rules/apply?rule=${r.id}`} className="btn-secondary">
                    {t('rules.apply')}
                  </a>
                  <form action={deleteRuleAction} className="ml-auto">
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton className="btn-danger">{t('common.delete')}</ConfirmButton>
                  </form>
                </div>

                <details className="mt-3">
                  <summary className="link inline-flex cursor-pointer select-none">{t('rules.edit')}</summary>
                  <form action={saveRuleAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={r.id} />
                    <Field label={t('rules.ifContains')} className="sm:col-span-2">
                      <input name="text" required maxLength={80} defaultValue={r.text} className="input" />
                    </Field>
                    <Field label={t('rules.ifAccount')}>{accountSelect(r.account)}</Field>
                    <Field label={t('rules.thenCategory')}>{categorySelect(r.categoryId)}</Field>
                    <button className="btn-primary sm:col-span-2 sm:justify-self-start">{t('rules.save')}</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
