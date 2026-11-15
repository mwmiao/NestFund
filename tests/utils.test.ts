import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import enUS from '@/i18n/locales/en-US.json';
import ptPT from '@/i18n/locales/pt-PT.json';
import { makeT } from '@/i18n/config';
import { parseCsv, toCsv } from '@/lib/csv';
import { addMonths, addMonthsToDate, formatDate, isActiveInMonth, isISODate, parseFlexibleDate } from '@/lib/dates';
import { formatMoney, parseDecimal } from '@/lib/format';

describe('parseDecimal', () => {
  it.each([
    ['12,50', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['39.90', 39.9],
    ['9 242,30 €', 9242.3],
    ['-5', -5],
  ])('%s → %s', (input, expected) => expect(parseDecimal(input)).toBe(expected));

  it('rejects garbage', () => {
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
});

describe('dates', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });
  it('clamps day of month for recurring transactions', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDate('2026-01-31', 2, 31)).toBe('2026-03-31');
  });
  it('formats dates in Portuguese style', () => {
    expect(formatDate('2026-11-03')).toBe('03/11/2026');
    expect(parseFlexibleDate('3/11/2026')).toBe('2026-11-03');
  });
  it('accepts real dates and rejects impossible ones', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true); // leap year
    expect(isISODate('2026-12-31')).toBe(true);
    for (const bad of ['2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31', '2026-06-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-05', '', 'not a date'])
      expect(isISODate(bad)).toBe(false);
    expect(isISODate(20260228)).toBe(false);
    expect(isISODate(null)).toBe(false);
  });
  it('parseFlexibleDate rejects impossible dates in every accepted format', () => {
    expect(parseFlexibleDate('31/02/2026')).toBeNull();
    expect(parseFlexibleDate('31.04.2026')).toBeNull();
    expect(parseFlexibleDate('2026-02-31')).toBeNull();
    expect(parseFlexibleDate('29/02/2028')).toBe('2028-02-29');
    expect(parseFlexibleDate('3/11/2026')).toBe('2026-11-03'); // existing behavior unchanged
  });
  it('supports future-dated budget lines (e.g. Muay Thai from January)', () => {
    const item = { startMonth: '2027-01', endMonth: null };
    expect(isActiveInMonth(item, '2026-12')).toBe(false);
    expect(isActiveInMonth(item, '2027-01')).toBe(true);
  });
});

describe('money formatting', () => {
  it('uses euros with Portuguese grouping', () => {
    expect(formatMoney(1750, 'pt-PT').replace(/\s/g, ' ')).toBe('1.750,00 €'.replace(/\s/g, ' '));
  });
});

describe('csv', () => {
  it('round-trips quoted fields', () => {
    const rows = [
      ['date', 'description'],
      ['2026-11-01', 'Jantar, "amigos"\nnovo'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('detects semicolon separators', () => {
    expect(parseCsv('date;amount\n2026-11-01;12,50')).toEqual([
      ['date', 'amount'],
      ['2026-11-01', '12,50'],
    ]);
  });
});

describe('i18n', () => {
  const keys = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

  it('pt-PT and en-US have the same keys', () => {
    expect(keys(enUS).sort()).toEqual(keys(ptPT).sort());
  });

  it('every static t("...") key used in the source exists', () => {
    const known = new Set(keys(ptPT));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(path.resolve(__dirname, '../src'));
    const missing: string[] = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) {
        if (!known.has(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
      }
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/key:\s*'(nav\.\w+)'/g)) {
        if (!known.has(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('interpolates variables', () => {
    expect(makeT(ptPT)('tx.count', { n: 3 })).toBe('3 transações');
    expect(makeT(enUS)('tx.count', { n: 3 })).toBe('3 transactions');
  });
});
