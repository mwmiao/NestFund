import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// backup.ts imports ./db, so the data dir must point at a throwaway folder before the dynamic import.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-prune-'));
process.env.DATA_DIR = path.join(root, 'data');
const { pruneBackups } = await import('@/lib/backup');

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15);
let n = 0;
const fresh = () => {
  const dir = path.join(root, `case-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const stampOf = (i: number) => new Date(Date.UTC(2026, 0, 1, 10, 0, i)).toISOString().replace(/[:.]/g, '-');
/** Creates a file whose mtime is `ageDays` before NOW, plus `i` seconds so ordering is deterministic. */
const make = (dir: string, name: string, ageDays: number, i: number) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, 'x');
  const t = (NOW - ageDays * DAY) / 1000 + i;
  fs.utimesSync(f, t, t);
};
const names = (prefix: string, ext: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${stampOf(i)}.${ext}`);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('pruneBackups', () => {
  it('keeps the newest 10 of a kind and removes the older ones', () => {
    const dir = fresh();
    const files = names('nestfund-backup', 'db', 15);
    files.forEach((f, i) => make(dir, f, 60, i));
    const removed = pruneBackups(dir, NOW);
    expect(removed.sort()).toEqual(files.slice(0, 5).sort());
    expect(fs.readdirSync(dir).sort()).toEqual(files.slice(5).sort());
  });

  it('removes nothing that is newer than 30 days', () => {
    const dir = fresh();
    names('nestfund-backup', 'db', 15).forEach((f, i) => make(dir, f, 5, i));
    expect(pruneBackups(dir, NOW)).toEqual([]);
    expect(fs.readdirSync(dir)).toHaveLength(15);
  });

  it('prunes each kind on its own', () => {
    const dir = fresh();
    names('nestfund-before-import', 'db', 12).forEach((f, i) => make(dir, f, 60, i));
    names('nestfund-before-reset', 'db', 3).forEach((f, i) => make(dir, f, 60, i));
    const removed = pruneBackups(dir, NOW);
    expect(removed.sort()).toEqual(names('nestfund-before-import', 'db', 2).sort());
    expect(fs.readdirSync(dir).filter((f) => f.includes('before-reset'))).toHaveLength(3);
  });

  it('treats different rule ids as different kinds', () => {
    const dir = fresh();
    names('nestfund-before-rule-1', 'db', 6).forEach((f, i) => make(dir, f, 60, i));
    names('nestfund-before-rule-2', 'db', 6).forEach((f, i) => make(dir, f, 60, i));
    expect(pruneBackups(dir, NOW)).toEqual([]);
  });

  it('ignores unrelated files and a missing directory', () => {
    const dir = fresh();
    make(dir, 'notes.txt', 90, 0);
    make(dir, 'random.db', 90, 0);
    expect(pruneBackups(dir, NOW)).toEqual([]);
    expect(fs.readdirSync(dir).sort()).toEqual(['notes.txt', 'random.db']);
    expect(pruneBackups(path.join(root, 'does-not-exist'), NOW)).toEqual([]);
  });

  it('treats .db and .json manual backups as different kinds', () => {
    const dir = fresh();
    names('nestfund-backup', 'db', 12).forEach((f, i) => make(dir, f, 60, i));
    names('nestfund-backup', 'json', 12).forEach((f, i) => make(dir, f, 60, i));
    const removed = pruneBackups(dir, NOW);
    expect(removed.filter((f) => f.endsWith('.db'))).toHaveLength(2);
    expect(removed.filter((f) => f.endsWith('.json'))).toHaveLength(2);
    expect(removed).toHaveLength(4);
  });

  it('removes the receipts folder of a pruned .db and nothing else', () => {
    const dir = fresh();
    const files = names('nestfund-backup', 'db', 12);
    files.forEach((f, i) => {
      make(dir, f, 60, i);
      const up = path.join(dir, f.replace(/\.db$/, '-uploads'));
      fs.mkdirSync(up);
      fs.writeFileSync(path.join(up, 'r.pdf'), 'receipt');
    });
    const orphan = path.join(dir, `nestfund-backup-${stampOf(-100)}-uploads`);
    fs.mkdirSync(orphan);
    fs.mkdirSync(path.join(dir, 'somedir'));

    const removed = pruneBackups(dir, NOW);
    expect(removed.sort()).toEqual(files.slice(0, 2).sort());
    for (const f of files.slice(0, 2)) {
      expect(fs.existsSync(path.join(dir, f))).toBe(false);
      expect(fs.existsSync(path.join(dir, f.replace(/\.db$/, '-uploads')))).toBe(false);
    }
    for (const f of files.slice(2)) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
      expect(fs.existsSync(path.join(dir, f.replace(/\.db$/, '-uploads'), 'r.pdf'))).toBe(true);
    }
    expect(fs.existsSync(orphan)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'somedir'))).toBe(true);
  });

  it('does not throw when a pruned .db has no uploads folder', () => {
    const dir = fresh();
    names('nestfund-backup', 'db', 11).forEach((f, i) => make(dir, f, 60, i));
    expect(() => pruneBackups(dir, NOW)).not.toThrow();
    expect(fs.readdirSync(dir)).toHaveLength(10);
  });
});
