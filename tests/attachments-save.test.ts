import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('NEXT_REDIRECT:' + url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn() }), headers: async () => new Headers() }));

// Real action and storage code against a throwaway database and uploads folder.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-attach-'));
process.env.DATA_DIR = dir;

let actions: typeof import('@/app/actions');
let repo: typeof import('@/lib/repo');
let UPLOADS_DIR: string;

beforeAll(async () => {
  const db = await import('@/lib/db');
  UPLOADS_DIR = db.UPLOADS_DIR;
  repo = await import('@/lib/repo');
  actions = await import('@/app/actions');
});

afterAll(() => {
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(fd: FormData): Promise<string> {
  try {
    await actions.saveTransactionAction(fd);
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m.startsWith('NEXT_REDIRECT:')) return m.slice('NEXT_REDIRECT:'.length);
    throw e;
  }
  throw new Error('expected a redirect');
}

function form(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  const base = { type: 'purchase', amount: '10', description: 'Lunch', date: '2026-11-02', account: 'ctt', ...fields };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  if (file) fd.set('attachment', file);
  return fd;
}
const png = () => new File([new Uint8Array([1, 2, 3])], 'r.png', { type: 'image/png' });
const files = () => fs.readdirSync(UPLOADS_DIR);
const exists = (name: string) => fs.existsSync(path.join(UPLOADS_DIR, name));

describe('receipt handling when saving a transaction', () => {
  let id: number;
  let first: string;

  it('stores a receipt on create', async () => {
    await call(form({}, png()));
    const row = repo.listTransactions()[0];
    id = row.id;
    expect(row.attachment).toBeTruthy();
    first = row.attachment!;
    expect(exists(first)).toBe(true);
  });

  it('replaces the receipt and deletes the old file', async () => {
    await call(form({ id: String(id) }, png()));
    const row = repo.getTransaction(id)!;
    expect(row.attachment).toBeTruthy();
    expect(row.attachment).not.toBe(first);
    expect(exists(row.attachment!)).toBe(true);
    expect(exists(first)).toBe(false);
    first = row.attachment!;
  });

  it('keeps the old receipt and leaves no orphan when a transfer is invalid', async () => {
    const url = await call(form({ id: String(id), type: 'transfer', toAccount: 'ctt' }, png()));
    expect(url).toContain('?error=transfer');
    expect(exists(first)).toBe(true);
    expect(repo.getTransaction(id)!.attachment).toBe(first);
    expect(files()).toEqual([first]);
  });

  it('removes the receipt on request', async () => {
    await call(form({ id: String(id), removeAttachment: '1' }));
    expect(repo.getTransaction(id)!.attachment).toBeNull();
    expect(exists(first)).toBe(false);
  });
});
