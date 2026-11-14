'use client';

import type { FormHTMLAttributes } from 'react';

/**
 * A form that submits itself as soon as a select, month or date field changes,
 * so filters apply without a separate "Apply" press. Free-text fields still submit on Enter.
 */
export function AutoSubmitForm({ children, onChange, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      {...rest}
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
