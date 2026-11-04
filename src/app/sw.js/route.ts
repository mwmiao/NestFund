import fs from 'node:fs';
import path from 'node:path';
import { serviceWorkerMain } from '@/lib/sw-main';

export const dynamic = 'force-dynamic';

/**
 * The build id changes with every build, so the service worker file changes on every release: browsers (and iOS)
 * notice it, install the new worker next to the old one and offer the update. That is what makes a Watchtower
 * image update reach installed copies of the app.
 */
function buildVersion(): string {
  try {
    const id = fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
    if (/^[A-Za-z0-9_-]{1,64}$/.test(id)) return id;
  } catch {
    // development: no BUILD_ID yet
  }
  return 'dev';
}

let cached: string | null = null;

export function GET() {
  cached ??= `// NestFund service worker\n(${serviceWorkerMain.toString()})(self, ${JSON.stringify(buildVersion())});\n`;
  return new Response(cached, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Must never be served from a cache: the browser compares it byte for byte to detect a new version.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
