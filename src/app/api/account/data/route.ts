import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase/server';
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user?.email) return new Response(null, { status: 401 });
  try {
    const body = await req.json();
    if (
      body.confirmation !== 'APAGAR' ||
      typeof body.password !== 'string' ||
      body.password.length > 1024
    )
      return new Response(null, { status: 422 });
    const verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: verified, error } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: body.password,
    });
    if (error || verified.user?.id !== user.id)
      return NextResponse.json(
        { error: 'Não foi possível confirmar a senha de acesso.' },
        { status: 403 },
      );
    await verifier.auth.signOut({ scope: 'local' });
    const files: string[] = [];
    async function collect(prefix: string, depth = 0) {
      if (depth > 8) throw Error('Unexpected storage structure');
      for (let offset = 0; ; offset += 100) {
        const { data: objects, error } = await db.storage
          .from('personal')
          .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;
        for (const object of objects) {
          const path = prefix + '/' + object.name;
          if (object.id) files.push(path);
          else await collect(path, depth + 1);
        }
        if (objects.length < 100) break;
      }
    }
    await collect(user.id);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await db.storage.from('personal').remove(files.slice(i, i + 100));
      if (error) throw error;
    }
    const { error: deleted } = await db.rpc('erase_personal_data');
    if (deleted) throw deleted;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          'Não foi possível concluir. Alguns arquivos podem já ter sido removidos. Tente novamente para terminar a exclusão.',
      },
      { status: 500 },
    );
  }
}
