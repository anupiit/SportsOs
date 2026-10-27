import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker builds set NEXT_STANDALONE=1 for a self-contained server; `next start` uses the regular output.
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  // Trace files from the monorepo root so the standalone bundle includes @sportsos/shared.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@sportsos/shared'],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
