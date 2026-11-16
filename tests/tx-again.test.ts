import { describe, expect, it } from 'vitest';
import { addAnotherUrl, parseAgainParams } from '@/lib/tx-again';

describe('save and add another', () => {
  it('builds the URL of a fresh form that keeps the kind and the date', () => {
    expect(addAnotherUrl({ type: 'income', date: '2026-11-14' }, 42)).toBe('/transactions/new?saved=1&type=income&date=2026-11-14&n=42');
  });
  it('reads its own parameters back', () => {
    expect(parseAgainParams({ saved: '1', type: 'income', date: '2026-11-14', n: '42' })).toEqual({ saved: true, type: 'income', date: '2026-11-14', formKey: '42' });
  });
  it('ignores values that are not ours', () => {
    expect(parseAgainParams({ saved: 'yes', type: 'gift', date: '2026-02-31', n: 'x<y' })).toEqual({ saved: false, type: undefined, date: undefined, formKey: 'new' });
    expect(parseAgainParams({})).toEqual({ saved: false, type: undefined, date: undefined, formKey: 'new' });
  });
});
