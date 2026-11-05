import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/request-origin';
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { count, error: subscriptionError } = await db
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (subscriptionError)
    return NextResponse.json(
      { error: 'Não foi possível verificar este dispositivo.' },
      { status: 503 },
    );
  if (!count)
    return NextResponse.json(
      { error: 'Ative as notificações neste dispositivo antes de testar.' },
      { status: 409 },
    );
  const minute = new Date().toISOString().slice(0, 16);
  const { error } = await db.from('notifications').upsert(
    {
      user_id: user.id,
      type: 'task',
      message: 'Teste de notificações do Level01',
      scheduled_at: new Date().toISOString(),
      idempotency_key: `push-test:${minute}`,
    },
    { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true },
  );
  return NextResponse.json(
    error ? { error: 'Não foi possível agendar o teste. Tente novamente.' } : { ok: true },
    { status: error ? 500 : 200 },
  );
}
