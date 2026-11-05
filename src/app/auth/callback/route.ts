import { requestOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const db = await serverClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          req.nextUrl.searchParams.get('next') === '/auth/reset' ? '/auth/reset' : '/',
          requestOrigin(req) ?? req.nextUrl.origin,
        ),
      );
  }
  return NextResponse.redirect(new URL('/login', requestOrigin(req) ?? req.nextUrl.origin));
}
