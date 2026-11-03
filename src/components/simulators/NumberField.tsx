'use client';

import { useState } from 'react';
import { parseDecimal } from '@/lib/format';

/** Decimal input accepting "1.234,56" or "1234.56"; reports the parsed value (last valid one while typing). */
export function NumberField({ label, value, onChange, suffix, hint }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: string }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseDecimal(e.target.value);
            if (n != null) onChange(n);
          }}
          className={`input tabular-nums ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && <span className="muted pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">{suffix}</span>}
      </div>
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}
