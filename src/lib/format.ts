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
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
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
  return Number(s);
}

/** Default value for a decimal text input, in Portuguese style ("39,9"). */
export const toInputDecimal = (v: number) => String(v).replace('.', ',');

export const round2 =(n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
