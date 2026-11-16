/** One-off confirmations carried in the URL after a redirect (`?saved=1`, `?deleted=1`). */
export const FLASH_PARAMS = ['saved', 'deleted'] as const;

/** Translation key of the confirmation to show for this URL, or null. */
export function flashMessageKey(pathname: string, params: URLSearchParams): string | null {
  if (params.get('deleted') === '1') return 'tx.deleted';
  if (params.get('saved') === '1') return pathname.startsWith('/transactions') ? 'tx.added' : 'common.saved';
  return null;
}

/** The same address without the confirmation parameters, so a reload does not show the message again. */
export function withoutFlash(pathname: string, params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  for (const p of FLASH_PARAMS) rest.delete(p);
  const qs = rest.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
