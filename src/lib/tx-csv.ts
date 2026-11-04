// Parses a transactions CSV into validated records. Pure: nothing is written; the import page shows the result first.
import { parseCsv } from './csv';
import { parseFlexibleDate } from './dates';
import { parseDecimal } from './format';
import { txKey, type BTransaction } from './backup-format';
import { ACCOUNTS, ACCOUNT_IDS, PAYMENT_METHODS, RECURRENCES, TX_TYPES, type AccountId } from './types';

export const CSV_COLUMNS = ['date', 'type', 'amount', 'description', 'category', 'subcategory', 'account', 'to_account', 'payment_method', 'merchant', 'notes', 'recurring', 'recurrence'] as const;

// Portuguese headers are accepted too, so exports from spreadsheets import without renaming.
const HEADER_ALIASES: Record<string, (typeof CSV_COLUMNS)[number]> = {
  data: 'date',
  tipo: 'type',
  valor: 'amount',
  montante: 'amount',
  descricao: 'description',
  'descrição': 'description',
  categoria: 'category',
  subcategoria: 'subcategory',
  metodo: 'payment_method',
  'método': 'payment_method',
  metodo_pagamento: 'payment_method',
  loja: 'merchant',
  local: 'merchant',
  notas: 'notes',
};

/** Accepts account ids ("revolut") or display names ("Banco CTT", "Trade Republic"). */
export function parseAccount(raw: string): AccountId | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return null;
  return ACCOUNT_IDS.find((id) => id === v || ACCOUNTS[id].name.toLowerCase().replace(/\s+/g, '') === v || (id === 'ctt' && v.includes('ctt'))) ?? null;
}

export interface CsvInvalid {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  reason: 'date' | 'amount' | 'description' | 'type' | 'account' | 'transfer' | 'repeated';
}

export interface ParsedTransactionsCsv {
  transactions: BTransaction[];
  /** Raw category texts that were not resolved to an existing category (kept so the import can show them). */
  invalid: CsvInvalid[];
  /** false when the header has none of the required columns (date, amount) */
  hasHeader: boolean;
}

/**
 * @param resolveCategory maps the category text of a row to a category ref (existing or new); null/'' for none.
 */
export function parseTransactionsCsv(textInput: string, resolveCategory: (raw: string) => string | null): ParsedTransactionsCsv {
  const rows = parseCsv(textInput.replace(/^﻿/, ''));
  const out: ParsedTransactionsCsv = { transactions: [], invalid: [], hasHeader: false };
  if (rows.length === 0) return out;
  const header: string[] = rows[0].map((h) => {
    const k = h.trim().toLowerCase();
    return HEADER_ALIASES[k] ?? k;
  });
  out.hasHeader = header.includes('date') && header.includes('amount');
  if (!out.hasHeader) return out;
  const col = (row: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };

  const seen = new Set<string>();
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    if (row.every((c) => !c.trim())) return; // blank line
    const date = parseFlexibleDate(col(row, 'date'));
    const rawAmount = parseDecimal(col(row, 'amount'));
    const merchant = col(row, 'merchant');
    const description = col(row, 'description') || merchant;
    const fail = (reason: CsvInvalid['reason']) => out.invalid.push({ line, reason });
    if (!date) return fail('date');
    if (rawAmount == null || rawAmount === 0) return fail('amount');
    if (!description) return fail('description');
    const typeRaw = col(row, 'type').toLowerCase();
    if (typeRaw && !TX_TYPES.includes(typeRaw as never)) return fail('type');
    // Rows without a type are purchases; the sign of the amount is ignored.
    const type = (typeRaw || 'purchase') as BTransaction['type'];
    const accountRaw = col(row, 'account');
    const account = accountRaw ? parseAccount(accountRaw) : 'ctt';
    if (!account) return fail('account');
    const toRaw = col(row, 'to_account');
    const toAccount = toRaw ? parseAccount(toRaw) : null;
    if (toRaw && !toAccount) return fail('account');
    if (type === 'transfer' && (!toAccount || toAccount === account)) return fail('transfer');
    const method = col(row, 'payment_method').toLowerCase();
    const recurrence = col(row, 'recurrence').toLowerCase();
    const recurring = ['1', 'true', 'yes', 'sim'].includes(col(row, 'recurring').toLowerCase()) && (RECURRENCES as readonly string[]).includes(recurrence);
    // An identical line earlier in the same file is treated as an accidental repeat and skipped (shown in the preview).
    const key = txKey({ date, amount: Math.round(Math.abs(rawAmount) * 100) / 100, type, description, account, toAccount: type === 'transfer' ? toAccount : null });
    if (seen.has(key)) return fail('repeated');
    seen.add(key);
    out.transactions.push({
      date,
      amount: Math.round(Math.abs(rawAmount) * 100) / 100,
      type,
      description,
      category: resolveCategory(col(row, 'category')),
      subcategory: col(row, 'subcategory') || null,
      account,
      toAccount: type === 'transfer' ? toAccount : null,
      paymentMethod: (PAYMENT_METHODS as readonly string[]).includes(method) ? method : 'other',
      merchant: merchant || null,
      notes: col(row, 'notes') || null,
      recurring,
      recurrence: recurring ? recurrence : null,
    });
  });
  return out;
}
