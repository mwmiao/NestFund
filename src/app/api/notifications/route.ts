import { loadNotifications } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/** Number of open in-app notices (drives the bell badge). */
export function GET() {
  return Response.json({ count: loadNotifications().length });
}
