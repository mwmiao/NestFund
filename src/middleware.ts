import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional HTTP Basic Auth. Enabled only when BASIC_AUTH_USER and BASIC_AUTH_PASSWORD are set.
 * For internet exposure through Cloudflare Tunnel, Cloudflare Access is the recommended layer;
 * this is a simple fallback. /api/health stays open for the Docker healthcheck.
 */
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass || req.nextUrl.pathname === '/api/health') return NextResponse.next();

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [u, ...rest] = atob(header.slice(6)).split(':');
    if (u === user && rest.join(':') === pass) return NextResponse.next();
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="NestFund", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
