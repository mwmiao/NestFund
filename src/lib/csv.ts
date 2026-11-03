// Minimal RFC 4180 CSV parsing/serialisation (quotes, escaped quotes, newlines inside quotes).

export function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const escapeField = (v: string, delimiter: string) => (/[",\n\r;]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: (string | number | null | undefined)[][], delimiter = ','): string {
  return rows.map((r) => r.map((v) => escapeField(v == null ? '' : String(v), delimiter)).join(delimiter)).join('\r\n');
}
