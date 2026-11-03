import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {subtitle && <div className="muted mt-1 text-sm">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card scroll-mt-20 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="muted mt-0.5 text-xs">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'default' | 'positive' | 'negative' | 'caution' | 'muted';
export const toneText: Record<Tone, string> = {
  default: '',
  positive: 'text-positive',
  negative: 'text-negative',
  caution: 'text-caution',
  muted: 'text-subtle',
};

/** A labelled figure. `boxed` wraps it in its own card. */
export function Stat({ label, value, hint, tone = 'default', boxed = true }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; boxed?: boolean }) {
  return (
    <div className={boxed ? 'card' : ''}>
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${toneText[tone]}`}>{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}

/** Budget status from a spent/planned ratio: calm green, amber near the limit, soft red when over. */
export function budgetTone(ratio: number): 'positive' | 'caution' | 'negative' {
  return ratio > 1 ? 'negative' : ratio >= 0.85 ? 'caution' : 'positive';
}

const barFill = { positive: 'bg-bar-positive', caution: 'bg-bar-caution', negative: 'bg-bar-negative' } as const;

/**
 * Thin progress bar. Pass `color` for identity colours (goals, accounts) or `tone`
 * for budget status; `auto` derives the tone from the value.
 */
export function ProgressBar({
  value,
  color,
  tone,
  label,
  size = 'md',
}: {
  value: number;
  color?: string;
  tone?: 'positive' | 'caution' | 'negative' | 'auto';
  label?: string;
  size?: 'sm' | 'md';
}) {
  const ratio = Number.isFinite(value) ? value : 0;
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  const resolved = tone === 'auto' ? budgetTone(ratio) : tone;
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-raised ${size === 'sm' ? 'h-1.5' : 'h-2'}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${resolved ? barFill[resolved] : ''}`}
        style={{ width: `${pct}%`, background: resolved ? undefined : (color ?? 'rgb(var(--bar-positive))') }}
      />
    </div>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: Tone | 'info'; children: ReactNode }) {
  const cls = {
    default: 'bg-raised text-ink',
    muted: 'bg-raised text-subtle',
    positive: 'bg-positive/10 text-positive',
    caution: 'bg-caution/10 text-caution',
    negative: 'bg-negative/10 text-negative',
    info: 'bg-info/10 text-info',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function Alert({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info' | 'success'; children: ReactNode }) {
  const cls = {
    warning: 'border-caution/30 bg-caution/10',
    danger: 'border-negative/30 bg-negative/10',
    info: 'border-info/30 bg-info/10',
    success: 'border-positive/30 bg-positive/10',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-control border px-4 py-3 text-sm text-ink ${cls}`}>
      {children}
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted py-6 text-center text-sm">{children}</p>;
}

/** Friendly empty state with a single clear next action. Never shows invented numbers. */
export function EmptyState({ title, hint, action, compact = false }: { title: string; hint?: string; action?: { href: string; label: string }; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center px-4 text-center ${compact ? 'py-5' : 'py-8'}`}>
      <p className="font-medium">{title}</p>
      {hint && <p className="muted mt-1 max-w-sm text-sm">{hint}</p>}
      {action && (
        <Link href={action.href} className="btn-secondary mt-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
