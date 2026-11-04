import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
};

// Stored names are "<uuid>-<sanitised original>"; anything else is rejected before touching the disk.
const SAFE_NAME = /^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,80}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = path.basename(name);
  if (!SAFE_NAME.test(file)) return new Response('Not found', { status: 404 });
  try {
    const data = await fs.readFile(path.join(UPLOADS_DIR, file));
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `${type === 'application/octet-stream' ? 'attachment' : 'inline'}; filename="${file.replace(/^[0-9a-f-]{36}-/, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
