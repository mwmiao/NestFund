import 'server-only';
import { headers } from 'next/headers';
import { clientKey, limiter } from './security';

/** For server actions: true when this client has used up `max` attempts of `name` within `windowMs`. */
export async function tooMany(name: string, max: number, windowMs: number): Promise<boolean> {
  return !limiter(name, max, windowMs).hit(clientKey(await headers())).ok;
}

/** For route handlers: a 429 response when the client is over the limit, otherwise null. */
export function rateLimited(req: Request, name: string, max: number, windowMs: number): Response | null {
  const r = limiter(name, max, windowMs).hit(clientKey(req.headers));
  return r.ok ? null : new Response('Too many requests', { status: 429, headers: { 'Retry-After': String(r.retryAfter) } });
}
