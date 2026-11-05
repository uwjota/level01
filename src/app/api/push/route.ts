import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/request-origin';
import { pushSubscriptionSchema } from '@/lib/push';
export async function GET() {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data, error } = await db.rpc('get_push_config');
  const { data: subscriptions, error: subscriptionError } = await db
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id);
  return NextResponse.json(
    error || subscriptionError
      ? { error: 'Não foi possível consultar as notificações. Tente novamente.' }
      : { ...data, endpoints: (subscriptions ?? []).map((s) => s.endpoint) },
    {
      status: error || subscriptionError ? 503 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const value = pushSubscriptionSchema.parse(await req.json());
    const { error } = await db.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: value.endpoint,
        p256dh: value.keys.p256dh,
        auth: value.keys.auth,
      },
      { onConflict: 'user_id,endpoint' },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível registrar as notificações neste navegador.' },
      { status: 422 },
    );
  }
}
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const { endpoint } = await req.json();
    if (typeof endpoint !== 'string' || endpoint.length > 4096) throw Error();
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return new Response(null, { status: 400 });
  }
}
