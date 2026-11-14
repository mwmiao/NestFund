import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDecimal } from '@/lib/format';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const locales = ['en-US', 'pt-PT'].map((f) => JSON.parse(read(`src/i18n/locales/${f}.json`)));

describe('amount fields', () => {
  it('both amount fields use AmountInput; no raw pattern input is left', () => {
    for (const f of ['src/components/transactions/TransactionForm.tsx', 'src/components/dashboard/AccountsPanel.tsx']) {
      const src = read(f);
      expect(src, f).toContain('<AmountInput');
      expect(src, f).not.toContain('pattern="[0-9');
    }
  });

  it('the server redirects an unreadable amount back to the form with an error', () => {
    expect(read('src/app/actions.ts')).toContain("?error=amount");
  });

  it('the form shows the amount error, and every message exists in both languages', () => {
    expect(read('src/components/transactions/TransactionForm.tsx')).toContain("'tx.amountError'");
    for (const dict of locales) {
      expect(typeof dict.common.amountRequired).toBe('string');
      expect(typeof dict.common.amountInvalid).toBe('string');
      expect(typeof dict.tx.amountError).toBe('string');
    }
  });

  it('the values the pattern lets through but the server cannot read really are rejected by parseDecimal', () => {
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('12,50')).toBe(12.5);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
  });
});
