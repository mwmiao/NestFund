'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';

/**
 * Small "i" next to a term. Tap or press Enter to show the explanation (hover and focus also show it);
 * Escape or a tap elsewhere hides it. The text is always in the page for assistive technology.
 */
export function Hint({ text }: { text: string }) {
  const { t } = useI18n();
  // Hover (mouse only) and tap/Enter ("pinned") are tracked apart so a touch tap's emulated mouseenter cannot cancel the click.
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [dx, setDx] = useState(0);

  // Keep the popover inside the viewport (8px margin) wherever the "i" sits.
  useLayoutEffect(() => {
    if (!open || !tip.current) {
      setDx(0);
      return;
    }
    const r = tip.current.getBoundingClientRect();
    const left = r.left - dx;
    const right = r.right - dx;
    let next = 0;
    if (right > window.innerWidth - 8) next = window.innerWidth - 8 - right;
    if (left + next < 8) next = 8 - left;
    setDx(next);
    // dx is deliberately left out: it is subtracted to recover the natural position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPinned(false);
      setHover(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative ml-1 inline-block align-middle normal-case" onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(false); }}>
      <button
        type="button"
        aria-label={t('common.moreInfo')}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line text-xs font-semibold leading-none text-subtle hover:text-ink"
      >
        i
      </button>
      <span
        id={id}
        ref={tip}
        role="tooltip"
        style={open ? { marginLeft: dx } : undefined}
        className={open ? 'absolute left-1/2 top-full z-30 mt-1 w-56 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-control border border-line bg-surface p-2 text-xs font-normal leading-snug text-ink shadow-pop' : 'sr-only'}
      >
        {text}
      </span>
    </span>
  );
}
