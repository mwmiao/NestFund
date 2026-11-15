import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real route handlers against a throwaway data folder.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-routes-'));
process.env.DATA_DIR = dir;

type DbModule = typeof import('@/lib/db');
let db: DbModule;
let attachments: typeof import('@/app/api/attachments/[name]/route');
let backupFile: typeof import('@/app/api/backup/file/route');
let health: typeof import('@/app/api/health/route');

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const getAttachment = (name: string) => attachments.GET(new Request('http://x'), { params: Promise.resolve({ name }) });
const getBackup = (qs: string) => backupFile.GET(new NextRequest(`http://x/api/backup/file${qs}`));

beforeAll(async () => {
  db = await import('@/lib/db');
  db.getDb();
  attachments = await import('@/app/api/attachments/[name]/route');
  backupFile = await import('@/app/api/backup/file/route');
  health = await import('@/app/api/health/route');
  fs.mkdirSync(db.UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(db.BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(db.UPLOADS_DIR, `${UUID}-receipt.png`), PNG);
  fs.writeFileSync(path.join(db.UPLOADS_DIR, `${UUID}-blob.bin`), 'xyz');
  fs.writeFileSync(path.join(db.BACKUP_DIR, 'nestfund-backup-test.json'), '{"ok":true}');
  fs.writeFileSync(path.join(db.BACKUP_DIR, 'nestfund-backup-test.db'), 'sqlite');
});

afterAll(() => {
  (globalThis as { __nestfundDb?: { close(): void } }).__nestfundDb?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  (globalThis as { __nestfundLimiters?: Map<string, unknown> }).__nestfundLimiters?.clear();
});

describe('GET /api/attachments/[name]', () => {
  it('serves a stored file with safe headers', async () => {
    const res = await getAttachment(`${UUID}-receipt.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('serves unknown extensions as a download', async () => {
    const res = await getAttachment(`${UUID}-blob.bin`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/);
  });

  it.each([
    ['a traversal path', '../../etc/passwd'],
    ['a name without uuid', 'receipt.png'],
    ['a uuid-prefixed name containing a slash', `${UUID}-a/b.png`],
    ['an encoded traversal', '..%2F..%2Fx'],
    ['a name longer than 80 chars after the uuid', `${UUID}-${'a'.repeat(81)}.png`],
    ['a valid-shaped name with no file', `${UUID}-missing.png`],
  ])('rejects %s with 404', async (_label, name) => {
    expect((await getAttachment(name)).status).toBe(404);
  });
});

describe('GET /api/backup/file', () => {
  it('downloads a saved JSON backup as an attachment', async () => {
    const res = await getBackup('?name=nestfund-backup-test.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('{"ok":true}');
  });

  it('never serves database copies', async () => {
    expect((await getBackup('?name=nestfund-backup-test.db')).status).toBe(404);
  });

  it.each([
    ['a parent path', '?name=../nestfund.db'],
    ['a dotted traversal', '?name=nestfund-../x.json'],
    ['an empty name', '?name='],
    ['a missing name', ''],
  ])('rejects %s with 404', async (_label, qs) => {
    expect((await getBackup(qs)).status).toBe(404);
  });

  it('rate limits to 30 requests per minute', async () => {
    for (let i = 0; i < 30; i++) expect((await getBackup('?name=nestfund-backup-test.json')).status).toBe(200);
    expect((await getBackup('?name=nestfund-backup-test.json')).status).toBe(429);
  });
});

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = health.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });
});
