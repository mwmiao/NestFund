import { rateLimited } from '@/lib/rate-limit';
import fs from 'node:fs';
import type { NextRequest } from 'next/server';
import { backupJsonPath } from '@/lib/backup';

export const dynamic = 'force-dynamic';

const LIMIT = { name: 'backup-file', max: 30, windowMs: 60_000 };

/** Download of a saved portable backup (.json) from the data volume. The name is validated; no other file can be reached. */
export function GET(req: NextRequest) {
  const limited = rateLimited(req, LIMIT.name, LIMIT.max, LIMIT.windowMs);
  if (limited) return limited;
  const name = req.nextUrl.searchParams.get('name') ?? '';
  const file = backupJsonPath(name);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
