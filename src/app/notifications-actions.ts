'use server';

import { revalidatePath } from 'next/cache';
import { PREF_KEYS, type NotificationPrefs } from '@/lib/notifications-calc';
import { dismissNotifications, loadNotifications, saveNotificationPrefs } from '@/lib/notifications';

/** Saves the toggles. A checkbox that is not in the form means "off". */
export async function saveNotificationPrefsAction(fd: FormData) {
  const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, fd.get(k) === 'on'])) as unknown as NotificationPrefs;
  saveNotificationPrefs(prefs);
  revalidatePath('/', 'layout');
}

export async function dismissNotificationAction(fd: FormData) {
  const id = fd.get('id');
  // Only ids of notices that really exist right now can be stored.
  if (typeof id === 'string' && loadNotifications().some((n) => n.id === id)) dismissNotifications([id]);
  revalidatePath('/', 'layout');
}

export async function dismissAllNotificationsAction() {
  dismissNotifications(loadNotifications().map((n) => n.id));
  revalidatePath('/', 'layout');
}
