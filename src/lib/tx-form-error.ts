/** The reasons the transaction form can be sent back to the user, carried in the form URL as `?error=`. */
export const TX_FORM_ERRORS = ['transfer', 'amount'] as const;
export type TxFormError = (typeof TX_FORM_ERRORS)[number];

/** Translation key of the message shown for each error. */
export const TX_FORM_ERROR_MESSAGE: Record<TxFormError, string> = {
  transfer: 'tx.transferError',
  amount: 'tx.amountError',
};

/** The `error` query value if it is one of ours, otherwise undefined. */
export const asTxFormError = (value: string | undefined): TxFormError | undefined => TX_FORM_ERRORS.find((e) => e === value);

/** Where to send the user so the new/edit form shows `error`. */
export const txFormErrorUrl = (id: number | null, error: TxFormError) => `/transactions/${id ?? 'new'}?error=${error}`;
