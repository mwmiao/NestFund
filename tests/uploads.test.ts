import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// moveUploadsTo imports ./db, so the data dir must point at a throwaway folder before the dynamic import.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-uploads-'));
process.env.DATA_DIR = path.join(root, 'data');
const { moveUploadsTo } = await import('@/lib/uploads');

let n = 0;
const fresh = () => {
  const base = path.join(root, `case-${n++}`);
  fs.mkdirSync(base, { recursive: true });
  return { uploads: path.join(base, 'uploads'), dest: path.join(base, 'moved') };
};

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('moveUploadsTo', () => {
  it('moves files with identical contents and leaves an empty folder behind', () => {
    const { uploads, dest } = fresh();
    fs.mkdirSync(uploads);
    fs.writeFileSync(path.join(uploads, 'a.pdf'), 'receipt-a');
    expect(moveUploadsTo(dest, uploads)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'a.pdf'), 'utf8')).toBe('receipt-a');
    expect(fs.readdirSync(uploads)).toEqual([]);
  });

  it('returns false for an empty or missing folder and creates no destination', () => {
    const empty = fresh();
    fs.mkdirSync(empty.uploads);
    expect(moveUploadsTo(empty.dest, empty.uploads)).toBe(false);
    expect(fs.existsSync(empty.dest)).toBe(false);
    expect(fs.existsSync(empty.uploads)).toBe(true);

    const missing = fresh();
    expect(moveUploadsTo(missing.dest, missing.uploads)).toBe(false);
    expect(fs.existsSync(missing.dest)).toBe(false);
    expect(fs.existsSync(missing.uploads)).toBe(true);
  });

  it('throws when the destination exists and keeps the receipts in place', () => {
    const { uploads, dest } = fresh();
    fs.mkdirSync(uploads);
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(uploads, 'a.pdf'), 'receipt-a');
    expect(() => moveUploadsTo(dest, uploads)).toThrow();
    expect(fs.readFileSync(path.join(uploads, 'a.pdf'), 'utf8')).toBe('receipt-a');
  });

  it('keeps nested content', () => {
    const { uploads, dest } = fresh();
    fs.mkdirSync(path.join(uploads, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(uploads, 'sub', 'b.png'), 'receipt-b');
    expect(moveUploadsTo(dest, uploads)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'sub', 'b.png'), 'utf8')).toBe('receipt-b');
  });
});
