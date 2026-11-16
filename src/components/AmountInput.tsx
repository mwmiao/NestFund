'use client';

import type { InputHTMLAttributes } from 'react';
import { useI18n } from '@/i18n/client';
import { AMOUNT_PATTERN, SIGNED_AMOUNT_PATTERN } from '@/lib/format';

/**
 * Amount text field ("12,50"): digits with a comma or dot for the cents. When the browser rejects the value it says why in the
 * app's language, with an example, instead of its own generic bubble. All other input props pass through.
 */
export function AmountInput({ onInvalid, onInput, signed = false, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'pattern' | 'inputMode'> & { signed?: boolean }) {
  const { t } = useI18n();
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      pattern={signed ? SIGNED_AMOUNT_PATTERN : AMOUNT_PATTERN}
      onInvalid={(e) => {
        onInvalid?.(e);
        e.currentTarget.setCustomValidity(t(e.currentTarget.validity.valueMissing ? 'common.amountRequired' : 'common.amountInvalid'));
      }}
      onInput={(e) => {
        onInput?.(e);
        e.currentTarget.setCustomValidity(''); // clear the message as soon as the user edits, or the field would stay invalid
      }}
    />
  );
}
