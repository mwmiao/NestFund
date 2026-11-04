import Link from 'next/link';
import { redirect } from 'next/navigation';
import { applyRuleAction } from '@/app/rules-actions';
import { AccountBadge } from '@/components/AccountBadge';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { formatMoney } from '@/lib/format';
import { accountName, categoryName } from '@/lib/labels';
import { listCategories } from '@/lib/repo';
import { getRule, previewRule } from '@/lib/rules-repo';

/** Read-only preview: lists what a rule WOULD change. Nothing is written until the user confirms with the form below. */
export default async function ApplyRulePage({ searchParams }: { searchParams: Promise<{ rule?: string; scope?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const rule = getRule(Number(sp.rule) || 0);
  if (!rule) redirect('/transactions/rules');
  const scope = sp.scope === 'all' ? 'all' : 'empty';
  const categories = listCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const target = catById.get(rule.categoryId);
  const matches = previewRule(rule, scope);
  const nameOf = (id: number | null) => {
    const c = id != null ? catById.get(id) : undefined;
    return c ? categoryName(c, t) : t('rules.noCategory');
  };

  return (
    <>
      <PageHeader
        title={t('rules.previewTitle')}
        subtitle={
          <>
            {t('rules.whenContains', { text: rule.text })}
            {rule.account ? ` · ${t('rules.whenAccount', { account: accountName(rule.account, t) })}` : ''} → {target ? categoryName(target, t) : ''}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group">
        {(['empty', 'all'] as const).map((s) => (
          <Link key={s} href={`/transactions/rules/apply?rule=${rule.id}&scope=${s}`} aria-current={scope === s ? 'true' : undefined} className={`chip ${scope === s ? 'chip-active' : ''}`}>
            {t(s === 'empty' ? 'rules.scopeEmpty' : 'rules.scopeAll')}
          </Link>
        ))}
      </div>

      <Card>
        {matches.length === 0 ? (
          <p className="muted py-6 text-center text-sm">{t('rules.noMatches')}</p>
        ) : (
          <form action={applyRuleAction}>
            <input type="hidden" name="rule" value={rule.id} />
            <p className="mb-1 text-sm">{t('rules.wouldChange', { n: matches.length, category: target ? categoryName(target, t) : '' })}</p>
            <p className="muted mb-3 text-xs">
              {t('rules.previewIntro')} {t('rules.backupNote')}
            </p>
            <ul className="divide-y divide-line/70">
              {matches.map((m) => (
                <li key={m.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                    <input type="checkbox" name="ids" value={m.id} defaultChecked className="h-5 w-5 shrink-0 accent-emerald-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.description}</span>
                      <span className="muted flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="tabular-nums">{m.date}</span>
                        <AccountBadge id={m.account} label={accountName(m.account, t)} size="xs" />
                        <span>
                          {nameOf(m.currentCategoryId)} → <span className="text-ink">{nameOf(rule.categoryId)}</span>
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">{formatMoney(m.amount, locale)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary min-h-12 flex-1 sm:flex-none">{t('rules.confirm')}</button>
              <Link href="/transactions/rules" className="btn-ghost flex-1 sm:flex-none">
                {t('common.cancel')}
              </Link>
            </div>
          </form>
        )}
      </Card>
      {matches.length === 0 && (
        <Link href="/transactions/rules" className="link mt-4 inline-block">
          ← {t('rules.back')}
        </Link>
      )}
    </>
  );
}
