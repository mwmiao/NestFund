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

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = path.basename(name);
  try {
    const data = await fs.readFile(path.join(UPLOADS_DIR, file));
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `${type === 'application/octet-stream' ? 'attachment' : 'inline'}; filename="${file.replace(/^[0-9a-f-]{36}-/, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
