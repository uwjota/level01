import { requestOrigin } from '@/lib/request-origin';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co${development ? ' http://localhost:* ws://localhost:*' : ''}; object-src 'none'; frame-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const finish = (response: NextResponse) => {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Content-Security-Policy', csp);
    return response;
  };
  let response = next();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    return finish(response);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values, headers) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          requestHeaders.set('cookie', request.headers.get('cookie') ?? '');
          response = next();
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (
    data?.claims &&
    !path.startsWith('/auth') &&
    !path.startsWith('/login') &&
    data.claims.aal !== 'aal2'
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.factors?.some((f) => f.status === 'verified')) {
      const response = path.startsWith('/api')
        ? NextResponse.json(
            { error: 'Confirme o código do autenticador.', code: 'MFA_REQUIRED' },
            { status: 403 },
          )
        : NextResponse.redirect(
            new URL('/auth/mfa', requestOrigin(request) ?? request.nextUrl.origin),
          );
      return finish(response);
    }
  }
  if (
    !data?.claims &&
    !path.startsWith('/login') &&
    !path.startsWith('/auth') &&
    !path.startsWith('/api')
  ) {
    const dest = new URL('/login', requestOrigin(request) ?? request.nextUrl.origin);
    const redirect = NextResponse.redirect(dest);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return finish(redirect);
  }
  return finish(response);
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|brand/|icon|manifest.webmanifest|sw.js).*)'],
};
