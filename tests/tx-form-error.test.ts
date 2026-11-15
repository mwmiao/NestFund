import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en-US.json';
import pt from '@/i18n/locales/pt-PT.json';
import { asTxFormError, TX_FORM_ERROR_MESSAGE, TX_FORM_ERRORS, txFormErrorUrl } from '@/lib/tx-form-error';

describe('transaction form errors', () => {
  it('builds the form URL for the date error, for a new and an existing transaction', () => {
    expect(txFormErrorUrl(null, 'date')).toBe('/transactions/new?error=date');
    expect(txFormErrorUrl(7, 'date')).toBe('/transactions/7?error=date');
    expect(asTxFormError('date')).toBe('date');
    expect(asTxFormError('nope')).toBeUndefined();
  });
  it('has a translation in both languages for every error', () => {
    for (const e of TX_FORM_ERRORS) {
      const key = TX_FORM_ERROR_MESSAGE[e].replace('tx.', '');
      expect((en.tx as unknown as Record<string, string>)[key], `en ${e}`).toBeTruthy();
      expect((pt.tx as unknown as Record<string, string>)[key], `pt ${e}`).toBeTruthy();
    }
  });
});
