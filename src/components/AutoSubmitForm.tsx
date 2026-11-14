'use client';

import type { FormHTMLAttributes } from 'react';

/**
 * A form that submits itself as soon as a select, month or date field changes,
 * so filters apply without a separate "Apply" press. Free-text fields still submit on Enter.
 */
export function AutoSubmitForm({ children, onChange, onSubmit, searchAllMonths, ...rest }: FormHTMLAttributes<HTMLFormElement> & { searchAllMonths?: boolean }) {
  return (
    <form
      {...rest}
      onSubmit={(e) => {
        onSubmit?.(e);
        if (!searchAllMonths) return;
        // A search covers every month unless the month field was changed on purpose:
        // leave an untouched month out of the request for the duration of the submit.
        const f = e.currentTarget.elements;
        const q = f.namedItem('q') as HTMLInputElement | null;
        const m = f.namedItem('month') as HTMLInputElement | null;
        if (q?.value.trim() && m && m.value === m.defaultValue) {
          m.disabled = true;
          setTimeout(() => {
            m.disabled = false;
          }, 0);
        }
      }}
      onChange={(e) => {
        onChange?.(e);
        const el = e.target as unknown as HTMLInputElement | HTMLSelectElement;
        const auto = el.tagName === 'SELECT' || (el.tagName === 'INPUT' && ['month', 'date'].includes((el as HTMLInputElement).type));
        if (auto && el.form?.checkValidity()) el.form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
