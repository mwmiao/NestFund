/** The reasons the transaction form can be sent back to the user, carried in the form URL as `?error=`. */
export const TX_FORM_ERRORS = ['transfer', 'amount', 'date'] as const;
export type TxFormError = (typeof TX_FORM_ERRORS)[number];

/** Translation key of the message shown for each error. */
export const TX_FORM_ERROR_MESSAGE: Record<TxFormError, string> = {
  transfer: 'tx.transferError',
  amount: 'tx.amountError',
  date: 'tx.dateError',
};

/** The `error` query value if it is one of ours, otherwise undefined. */
export const asTxFormError = (value: string | undefined): TxFormError | undefined => TX_FORM_ERRORS.find((e) => e === value);

/** True when a transfer has no destination account, or the destination is the source. */
export const transferNeedsDestination = (type: string, account: string, toAccount: string | null | undefined) =>
  type === 'transfer' && (!toAccount || toAccount === account);

/** Where to send the user so the new/edit form shows `error`. The transfer error reopens the new form on the Transfer tab. */
export const txFormErrorUrl = (id: number | null, error: TxFormError) =>
  `/transactions/${id ?? 'new'}?error=${error}${error === 'transfer' && id == null ? '&type=transfer' : ''}`;
