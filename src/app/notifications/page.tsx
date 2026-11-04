import Link from 'next/link';
import { dismissAllNotificationsAction, dismissNotificationAction } from '@/app/notifications-actions';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { formatMoney, formatPercent } from '@/lib/format';
import { categoryName } from '@/lib/labels';
import { getNotificationPrefs, loadNotifications } from '@/lib/notifications';
import { PREF_KEYS } from '@/lib/notifications-calc';
import { listCategories } from '@/lib/repo';

export default async function NotificationsPage() {
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const prefs = getNotificationPrefs();
  const anyEnabled = PREF_KEYS.some((k) => prefs[k]);
  const list = loadNotifications();
  const catById = new Map(listCategories().map((c) => [c.id, c]));

  const text = (n: (typeof list)[number]) => {
    const d = n.data;
    switch (n.kind) {
      case 'weekly':
        return t('notifications.weekly', { n: d.n ?? 0 });
      case 'monthEnd':
        return t('notifications.monthEnd');
      case 'categoryBudget': {
        const category = categoryName(d.categoryId != null ? catById.get(d.categoryId) : undefined, t);
        return (d.ratio ?? 0) >= 1
          ? t('notifications.categoryOver', { category, spent: money(d.spent ?? 0), limit: money(d.limit ?? 0) })
          : t('notifications.categoryNear', { category, pct: formatPercent(d.ratio ?? 0, locale, 0), spent: money(d.spent ?? 0), limit: money(d.limit ?? 0) });
      }
      case 'negativeBudget':
        return t(d.which === 'planned' ? 'notifications.negativePlanned' : 'notifications.negativeReal', { amount: money(d.amount ?? 0) });
    }
  };
  // Where the notice can be looked at (informational pages only).
  const links = (n: (typeof list)[number]): { href: string; label: string }[] => {
    switch (n.kind) {
      case 'weekly':
        return [{ href: '/transactions?month=', label: t('notifications.viewTransactions') }];
      case 'monthEnd':
        return [
          { href: '/budget', label: t('nav.budget') },
          { href: '/goals', label: t('nav.goals') },
        ];
      default:
        return [{ href: '/budget', label: t('nav.budget') }];
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('notifications.title')}
        actions={
          <Link href="/settings/notifications" className="btn-secondary">
            {t('notifications.configure')}
          </Link>
        }
      />

      {!anyEnabled ? (
        <Card>
          <EmptyState title={t('notifications.offTitle')} hint={t('notifications.offHint')} action={{ href: '/settings/notifications', label: t('notifications.configure') }} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title={t('notifications.noneTitle')} hint={t('notifications.noneHint')} />
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {list.map((n) => (
              <li key={n.id}>
                <Alert tone={n.tone === 'caution' ? 'warning' : 'info'}>
                  <p>{text(n)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {links(n).map((l) => (
                      <Link key={l.href} href={l.href} className="link inline-flex min-h-9 items-center">
                        {l.label}
                      </Link>
                    ))}
                    <form action={dismissNotificationAction} className="ml-auto">
                      <input type="hidden" name="id" value={n.id} />
                      <button className="btn-ghost !px-3 !py-1.5 text-xs">{t('notifications.dismiss')}</button>
                    </form>
                  </div>
                </Alert>
              </li>
            ))}
          </ul>
          {list.length > 1 && (
            <form action={dismissAllNotificationsAction} className="mt-4">
              <button className="btn-secondary">{t('notifications.dismissAll')}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
