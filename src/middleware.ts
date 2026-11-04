import { NextResponse, type NextRequest } from 'next/server';
import { clientKey, constantTimeEqual, limiter, parseBasicAuth } from '@/lib/security';

/**
 * Optional HTTP Basic Auth. Enabled only when BASIC_AUTH_USER and BASIC_AUTH_PASSWORD are set.
 * For internet exposure through Cloudflare Tunnel, Cloudflare Access is the recommended layer;
 * this is a simple fallback. /api/health stays open for the Docker healthcheck.
 *
 * Hardening: credentials are compared in constant time, a malformed header is a 401 (never an error),
 * and repeated failures from one address are answered with 429 for a while (guessing protection).
 */
const FAILED_LOGINS = { max: 10, windowMs: 10 * 60 * 1000 };

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass || req.nextUrl.pathname === '/api/health') return NextResponse.next();

  const failures = limiter('auth-failures', FAILED_LOGINS.max, FAILED_LOGINS.windowMs);
  const who = clientKey(req.headers);
  const blocked = failures.blocked(who);
  if (!blocked.ok) return new NextResponse('Too many attempts', { status: 429, headers: { 'Retry-After': String(blocked.retryAfter) } });

  const creds = parseBasicAuth(req.headers.get('authorization'));
  // Both comparisons always run, so the response time does not reveal which part was wrong.
  const userOk = constantTimeEqual(creds?.user ?? '', user);
  const passOk = constantTimeEqual(creds?.pass ?? '', pass);
  if (creds && userOk && passOk) {
    failures.reset(who);
    return NextResponse.next();
  }
  if (creds) failures.hit(who); // only real wrong guesses count; the browser's first, credential-less request does not
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="NestFund", charset="UTF-8"' },
  });
}

export const config = {
  // The PWA files are public and contain nothing private; browsers fetch the manifest and icons without credentials.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html|apple-touch-icon.png|icons/).*)'],
};
