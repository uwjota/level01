import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { serverClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/request-origin';
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user?.email) return new Response(null, { status: 401 });
  const { data: aal, error: aalError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'))
    return NextResponse.json(
      { error: 'Confirme o código de duas etapas antes de alterar a senha.' },
      { status: 403 },
    );
  try {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(1024),
        password: z.string().min(12).max(1024),
      })
      .parse(await req.json());
    const verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const verified = await verifier.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });
    if (verified.error || verified.data.user?.id !== user.id)
      return NextResponse.json({ error: 'A senha atual não confere.' }, { status: 400 });
    await verifier.auth.signOut({ scope: 'local' });
    const { error } = await db.auth.updateUser({ password: input.password });
    if (error)
      return NextResponse.json(
        { error: 'Não foi possível alterar a senha. Use uma senha diferente e forte.' },
        { status: 400 },
      );
    const logout = await db.auth.signOut({ scope: 'others' });
    return NextResponse.json({ ok: true, othersRevoked: !logout.error });
  } catch {
    return NextResponse.json(
      { error: 'Use uma nova senha com pelo menos 12 caracteres.' },
      { status: 422 },
    );
  }
}
