import { MAX_AMOUNT } from './security';
const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number, locale: string, opts: { decimals?: number; sign?: boolean } = {}): string {
  const decimals = opts.decimals ?? 2;
  // Never show "-0,00 €" (from -0 or float dust) or "NaN €".
  if (!Number.isFinite(value) || Math.abs(value) < 0.5 / 10 ** decimals) value = 0;
  const cacheKey = `${locale}|${decimals}|${opts.sign ? 1 : 0}`;
  let fmt = moneyFormatters.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
      // pt-PT omits the thousands separator for 4-digit numbers by default.
      useGrouping: 'always',
    } as Intl.NumberFormatOptions);
    moneyFormatters.set(cacheKey, fmt);
  }
  // CLDR uses a space as pt-PT thousands separator; everyday Portuguese writes "1.750,00 €".
  if (locale !== 'pt-PT') return fmt.format(value);
  return fmt
    .formatToParts(value)
    .map((p) => (p.type === 'group' ? '.' : p.value))
    .join('');
}

export function formatPercent(ratio: number, locale: string, decimals = 1): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(ratio);
}

/**
 * Parses user-typed amounts in either Portuguese ("1.234,56") or English ("1,234.56") style.
 * The right-most separator is treated as the decimal separator when both are present.
 */
export function parseDecimal(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && Math.abs(input) <= MAX_AMOUNT ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[€\s ]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  // Absurdly large values (or ones that overflow to Infinity) are rejected instead of stored.
  return Number.isFinite(n) && Math.abs(n) <= MAX_AMOUNT ? n : null;
}

/**
 * Like parseDecimal, for amounts of money. Money has two decimals, so "1.500" or "1,500" (one separator, exactly three
 * digits after it) can only be a thousands separator: it is read as 1500, not 1.5. Everything else is read as parseDecimal does.
 * Use parseDecimal (not this) for fields that are not money, such as percentages and days worked.
 */
export function parseMoney(input: unknown): number | null {
  if (typeof input === 'string') {
    const s = input.trim().replace(/[€\s ]/g, '');
    const m = s.match(/^(-?)([1-9]\d{0,2})[.,](\d{3})$/);
    if (m) return parseDecimal(`${m[1]}${m[2]}${m[3]}`);
  }
  return parseDecimal(input);
}

/**
 * HTML `pattern` for an amount field: the (unsigned) numbers `parseDecimal` accepts, written out so the browser rejects what the
 * server would. Plain digits with one `,` or `.` for the cents, or digit groups with the other symbol as thousands separator
 * ("1.234,56" / "1,234.56"). Anything it matches, `parseDecimal` reads.
 */
export const AMOUNT_PATTERN = String.raw`\s*(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+,\d+|\d{1,3}(?:,\d{3})+\.\d+)\s*`;

/** Default value for a decimal text input, in Portuguese style ("39,9"). */
export const toInputDecimal = (v: number) => String(v).replace('.', ',');

export const round2 =(n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
