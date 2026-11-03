// Month/date helpers. Months are 'YYYY-MM', dates are 'YYYY-MM-DD' (local time).

const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now = new Date()): string {
  return todayISO(now).slice(0, 7);
}

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function isISODate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Adds months to an ISO date, clamping the day (e.g. 31 Jan + 1 → 28/29 Feb). */
export function addMonthsToDate(date: string, n: number, anchorDay?: number): string {
  const month = addMonths(date.slice(0, 7), n);
  const day = Math.min(anchorDay ?? Number(date.slice(8, 10)), daysInMonth(month));
  return `${month}-${pad(day)}`;
}

export function isActiveInMonth(item: { startMonth: string | null; endMonth: string | null }, month: string) {
  return (!item.startMonth || item.startMonth <= month) && (!item.endMonth || item.endMonth >= month);
}

/** Portuguese date format (dd/mm/aaaa) is used for every locale, as required. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function monthLabel(month: string, locale: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat(locale, { month: style, year: 'numeric' }).format(new Date(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Accepts YYYY-MM-DD or DD/MM/YYYY (also with '-' or '.') and returns ISO, or null. */
export function parseFlexibleDate(input: string): string | null {
  const s = input.trim();
  if (isISODate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isISODate(iso) ? iso : null;
}

/** "03/11/2026, 17:10" in the server's timezone (TZ, Europe/Lisbon in Docker). */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en-US' ? 'en-GB' : locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: process.env.TZ || 'Europe/Lisbon',
  }).format(new Date(iso));
}
