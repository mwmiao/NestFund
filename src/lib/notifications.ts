import 'server-only';
import { computeMonthSummary } from './calc';
import { getDb } from './db';
import { currentMonth, todayISO } from './dates';
import { DEFAULT_PREFS, PREF_KEYS, computeNotifications, type AppNotification, type NotificationPrefs } from './notifications-calc';
import { ensureMonthBudget, listCategories, listTransactions } from './repo';

const PREFS_KEY = 'notifications';
const DISMISSED_KEY = 'notifications_dismissed';
const MAX_DISMISSED = 200;

const readSetting = (key: string): unknown => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
};
const writeSetting = (key: string, value: unknown) => getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));

export function getNotificationPrefs(): NotificationPrefs {
  const raw = (readSetting(PREFS_KEY) ?? {}) as Partial<Record<keyof NotificationPrefs, unknown>>;
  return Object.fromEntries(PREF_KEYS.map((k) => [k, raw[k] === true ? true : DEFAULT_PREFS[k]])) as unknown as NotificationPrefs;
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  writeSetting(PREFS_KEY, Object.fromEntries(PREF_KEYS.map((k) => [k, prefs[k] === true])));
}

function getDismissed(): string[] {
  const raw = readSetting(DISMISSED_KEY);
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

/** Remembers dismissed notices (only their ids; the newest 200 are kept). */
export function dismissNotifications(ids: string[]) {
  const merged = [...new Set([...getDismissed(), ...ids])];
  writeSetting(DISMISSED_KEY, merged.slice(-MAX_DISMISSED));
}

/** Notices that apply right now, given the user's preferences. Read-only apart from creating the current month's budget row (as the dashboard does). */
export function loadNotifications(): AppNotification[] {
  const prefs = getNotificationPrefs();
  if (!PREF_KEYS.some((k) => prefs[k])) return [];

  const month = currentMonth();
  const categories = listCategories();
  const budget = ensureMonthBudget(month);
  const summary = computeMonthSummary(budget, listTransactions({ month }), categories);
  const uncategorized = (getDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE category_id IS NULL AND type != 'transfer'").get() as { n: number }).n;

  return computeNotifications({
    prefs,
    today: todayISO(),
    uncategorized,
    categories,
    spentByCategory: new Map(summary.byCategory.map((r) => [r.categoryId, r.total])),
    summary: {
      hasIncome: summary.income > 0,
      negativePlanned: summary.negativePlanned,
      plannedAvailable: summary.plannedAvailable,
      negativeReal: summary.negativeReal,
      realAvailable: summary.realAvailable,
    },
    dismissed: new Set(getDismissed()),
  });
}
