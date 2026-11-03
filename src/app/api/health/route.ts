import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  getDb().prepare('SELECT 1').get();
  return Response.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
}
