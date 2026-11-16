import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en-US.json';
import pt from '@/i18n/locales/pt-PT.json';
import { flashMessageKey, withoutFlash } from '@/lib/flash';

const q = (s: string) => new URLSearchParams(s);

describe('one-off confirmations', () => {
  it('picks the message for the page', () => {
    expect(flashMessageKey('/transactions', q('month=2026-11&saved=1'))).toBe('tx.added');
    expect(flashMessageKey('/transactions/new', q('saved=1&type=income'))).toBe('tx.added');
    expect(flashMessageKey('/', q('saved=1'))).toBe('common.saved');
    expect(flashMessageKey('/transactions', q('deleted=1'))).toBe('tx.deleted');
    expect(flashMessageKey('/transactions', q('month=2026-11'))).toBeNull();
    expect(flashMessageKey('/transactions', q('saved=yes'))).toBeNull();
  });
  it('removes only its own parameters from the address', () => {
    expect(withoutFlash('/transactions', q('q=lidl&saved=1&page=2'))).toBe('/transactions?q=lidl&page=2');
    expect(withoutFlash('/', q('saved=1'))).toBe('/');
    expect(withoutFlash('/transactions', q('month=&deleted=1'))).toBe('/transactions?month=');
  });
  it('has the deleted message in both languages', () => {
    expect((en.tx as unknown as Record<string, string>).deleted).toBeTruthy();
    expect((pt.tx as unknown as Record<string, string>).deleted).toBeTruthy();
  });
});
