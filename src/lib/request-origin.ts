import type { NextRequest } from 'next/server';

// Next may expose the listening address (0.0.0.0) in nextUrl. The Host header
// identifies the address used by the browser; do not trust X-Forwarded-Host.
export function requestOrigin(req: NextRequest): string | null {
  const host = req.headers.get('host');
  if (!host || /[\\/@?#\s]/.test(host)) return null;
  try {
    return new URL(`${req.nextUrl.protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(req: NextRequest): boolean {
  const origin = requestOrigin(req);
  return origin !== null && req.headers.get('origin') === origin;
}
