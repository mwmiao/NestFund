import { ACCOUNTS, type AccountId } from '@/lib/types';

const MEAL_ICON = 'M7 3v8m-2-8v4a2 2 0 004 0V3M7 11v10M17 3c-1.7 1-3 3.2-3 6v3h3v9';

/**
 * Colour-coded account label so Banco CTT, Revolut, Trading 212, Trade Republic and the
 * meal card are told apart at a glance. The meal card also gets a cutlery icon, so it is
 * distinguishable without relying on colour alone.
 */
export function AccountBadge({ id, label, size = 'sm' }: { id: AccountId; label: string; size?: 'sm' | 'xs' }) {
  const color = ACCOUNTS[id].color;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      style={{ background: `${color}1f`, color }}
    >
      {id === 'meal_card' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5" aria-hidden>
          <path d={MEAL_ICON} />
        </svg>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}
