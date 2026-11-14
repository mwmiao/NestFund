'use client';

import { useId, useRef } from 'react';
import { useI18n } from '@/i18n/client';

/**
 * Small "i" next to a term. Tap or press Enter to show the explanation. It is a native popover, so the browser handles
 * Escape, tapping elsewhere and keyboard access; the text stays linked to the button for assistive technology.
 */
export function Hint({ text }: { text: string }) {
  const { t } = useI18n();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  return (
    <span className="ml-1 inline-block align-middle normal-case">
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-label={t('common.moreInfo')}
        aria-describedby={id}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-xs font-semibold leading-none text-subtle hover:text-ink"
      >
        i
      </button>
      <span
        id={id}
        popover="auto"
        onToggle={(e) => {
          // A popover is placed by the page, not by its parent: put it under the "i", at least 8px inside the viewport.
          if (e.newState !== 'open' || !button.current) return;
          const el = e.currentTarget;
          const anchor = button.current.getBoundingClientRect();
          const left = anchor.left + anchor.width / 2 - el.offsetWidth / 2;
          el.style.top = `${anchor.bottom + 4}px`;
          el.style.left = `${Math.min(Math.max(left, 8), window.innerWidth - el.offsetWidth - 8)}px`;
        }}
        className="m-0 h-fit w-56 max-w-[calc(100vw-1rem)] inset-auto rounded-control border border-line bg-surface p-2 text-xs font-normal leading-snug text-ink shadow-pop"
      >
        {text}
      </span>
    </span>
  );
}
