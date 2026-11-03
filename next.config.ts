import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a minimal self-contained server in .next/standalone for the Docker image.
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    serverActions: {
      // Allows attachments (receipts, invoices) to be uploaded through server actions.
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
