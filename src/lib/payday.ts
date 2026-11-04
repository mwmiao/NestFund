// Portuguese national holidays, pay-date calculation and the working-days income estimate.
// Pure functions (no database), so they are easy to test. Dates are 'YYYY-MM-DD'.

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Easter Sunday (Meeus/Jones/Butcher algorithm) as a UTC date. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const fromUTC = (d: Date) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

/** National holidays in Portugal for a year: date → name key (translated in the UI as `payday.holidays.<key>`). */
export function portugueseHolidays(year: number): Map<string, string> {
  const e = easter(year);
  const list: [string, string][] = [
    [iso(year, 1, 1), 'newYear'],
    [fromUTC(shift(e, -2)), 'goodFriday'],
    [fromUTC(e), 'easter'],
    [iso(year, 4, 25), 'freedomDay'],
    [iso(year, 5, 1), 'labourDay'],
    [fromUTC(shift(e, 60)), 'corpusChristi'],
    [iso(year, 6, 10), 'portugalDay'],
    [iso(year, 8, 15), 'assumption'],
    [iso(year, 10, 5), 'republicDay'],
    [iso(year, 11, 1), 'allSaints'],
    [iso(year, 12, 1), 'independence'],
    [iso(year, 12, 8), 'immaculate'],
    [iso(year, 12, 25), 'christmas'],
  ];
  return new Map(list);
}

export function holidayName(date: string): string | null {
  return portugueseHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isBusinessDay(date: string): boolean {
  const w = weekday(date);
  return w !== 0 && w !== 6 && holidayName(date) == null;
}

export type PayShiftReason = 'saturday' | 'sunday' | 'holiday';

export interface PayDate {
  /** Nominal pay day of the month (e.g. 25). */
  nominal: string;
  /** Date the money is expected: the nominal day, or the last business day before it. */
  date: string;
  /** Why it was brought forward; null when paid on the nominal day. */
  reason: PayShiftReason | null;
  /** Name key of the holiday when reason = 'holiday' (or when a weekend shift ran into one). */
  holiday: string | null;
}

/** Expected pay date: `day` of the month, moved back to the previous business day when it is not one. */
export function expectedPayDate(month: string, day = 25): PayDate {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nominal = iso(y, m, Math.min(Math.max(Math.round(day) || 25, 1), last));
  let reason: PayShiftReason | null = null;
  let holiday: string | null = null;
  const w = weekday(nominal);
  const nominalHoliday = holidayName(nominal);
  if (nominalHoliday) {
    reason = 'holiday';
    holiday = nominalHoliday;
  } else if (w === 6) reason = 'saturday';
  else if (w === 0) reason = 'sunday';
  let date = nominal;
  while (!isBusinessDay(date)) {
    const [yy, mm, dd] = date.split('-').map(Number);
    date = fromUTC(new Date(Date.UTC(yy, mm - 1, dd - 1)));
  }
  return { nominal, date, reason, holiday };
}

export interface DaysEstimateInput {
  normalDays: number;
  holidayDays: number;
  perDay: number;
}

/** (normal days × rate) + (holiday days × rate × 2). Holidays worked are paid double. */
export function estimateFromDays({ normalDays, holidayDays, perDay }: DaysEstimateInput): number {
  const n = Math.max(0, normalDays) || 0;
  const h = Math.max(0, holidayDays) || 0;
  const r = Math.max(0, perDay) || 0;
  return Math.round((n * r + h * r * 2) * 100) / 100;
}

/** Paid-day equivalents: a worked holiday counts as 2. */
export const paidDayEquivalents = (normalDays: number, holidayDays: number) => normalDays + holidayDays * 2;
