import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_IDS } from '@/lib/types';

// Real repository code against a throwaway database.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-hidden-'));
process.env.DATA_DIR = dir;

let repo: typeof import('@/lib/repo');

beforeAll(async () => {
  repo = await import('@/lib/repo');
});

describe('hidden accounts', () => {
  it('shows every account by default', () => {
    expect(repo.getHiddenAccounts()).toEqual([]);
    expect(repo.visibleAccounts()).toEqual([...ACCOUNT_IDS]);
  });

  it('hides the chosen accounts and ignores unknown ids and duplicates', () => {
    repo.saveHiddenAccounts(['revolut', 'revolut', 'nope' as never, 'cash']);
    expect(repo.getHiddenAccounts()).toEqual(['revolut', 'cash']);
    expect(repo.visibleAccounts()).not.toContain('revolut');
    expect(repo.visibleAccounts()).not.toContain('cash');
    expect(repo.visibleAccounts()).toContain('ctt');
  });

  it('keeps a hidden account visible when an existing record still uses it', () => {
    repo.saveHiddenAccounts(['revolut']);
    expect(repo.visibleAccounts(['revolut'])).toContain('revolut');
    expect(repo.visibleAccounts([null, undefined])).not.toContain('revolut');
  });

  it('recovers from a corrupt stored value', async () => {
    const db = (await import('@/lib/db')).getDb();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hidden_accounts', ?)").run('{not json');
    expect(repo.getHiddenAccounts()).toEqual([]);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hidden_accounts', ?)").run('{"a":1}');
    expect(repo.getHiddenAccounts()).toEqual([]);
  });
});
