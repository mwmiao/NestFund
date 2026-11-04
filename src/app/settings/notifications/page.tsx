import Link from 'next/link';
import { saveNotificationPrefsAction } from '@/app/notifications-actions';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { getNotificationPrefs } from '@/lib/notifications';
import { PREF_KEYS } from '@/lib/notifications-calc';

export default async function NotificationSettingsPage() {
  const { t } = await getI18n();
  const prefs = getNotificationPrefs();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('notifications.settingsTitle')}
        subtitle={
          <Link href="/settings" className="link">
            ← {t('settings.title')}
          </Link>
        }
      />
      <Card>
        <p className="muted mb-2 text-sm">{t('notifications.intro')}</p>
        <form action={saveNotificationPrefsAction} className="divide-y divide-line/70">
          {PREF_KEYS.map((key) => (
            <ToggleRow key={key} name={key} defaultChecked={prefs[key]} label={t(`notifications.prefs.${key}`)} hint={t(`notifications.prefs.${key}Hint`)} />
          ))}
        </form>
        <p className="muted mt-3 border-t border-line/70 pt-3 text-xs">{t('notifications.autosave')}</p>
      </Card>
      <p className="muted mt-4 text-xs">{t('notifications.pushNote')}</p>
      <Link href="/notifications" className="link mt-3 inline-block">
        {t('notifications.openInbox')} →
      </Link>
    </div>
  );
}
