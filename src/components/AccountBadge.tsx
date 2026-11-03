import { ACCOUNTS, type AccountId } from '@/lib/types';

/** Colour-coded account label so Banco CTT, Revolut, Trading 212, Trade Republic and the meal card are told apart at a glance. */
export function AccountBadge({ id, label, size = 'sm' }: { id: AccountId; label: string; size?: 'sm' | 'xs' }) {
  const color = ACCOUNTS[id].color;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ${size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      style={{ background: `${color}22`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
