import { describe, expect, it } from 'vitest';
import { txBackTarget, txEditHref } from '@/lib/tx-links';

describe('returning from the edit page', () => {
  it('remembers the page a transaction was opened from', () => {
    expect(txEditHref(7)).toBe('/transactions/7');
    expect(txEditHref(7, '/transactions?q=lidl&account=meal_card')).toBe('/transactions/7?from=%2Ftransactions%3Fq%3Dlidl%26account%3Dmeal_card');
  });
  it('returns there, or to the month of the transaction', () => {
    expect(txBackTarget('/transactions?q=lidl&page=3', '2026-11-14')).toBe('/transactions?q=lidl&page=3');
    expect(txBackTarget('/', '2026-11-14')).toBe('/');
    expect(txBackTarget(undefined, '2026-11-14')).toBe('/transactions?month=2026-11');
  });
  it('never returns to another site', () => {
    for (const bad of ['https://example.com', '//example.com', 'javascript:alert(1)', '/\\example.com'])
      expect(txBackTarget(bad, '2026-11-14'), bad).toBe('/transactions?month=2026-11');
  });
});
