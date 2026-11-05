import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function GET(req: NextRequest) {
  const db = await serverClient();
  if (!(await db.auth.getUser()).data.user) return new Response(null, { status: 401 });
  const name = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (name.length < 2 || name.length > 100) return new Response(null, { status: 422 });
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '6', language: 'pt', format: 'json' })}`,
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) throw Error();
    const d = await r.json();
    return NextResponse.json({
      cities: (d.results ?? []).map(
        (c: {
          name: string;
          admin1?: string;
          country?: string;
          latitude: number;
          longitude: number;
        }) => ({
          label: [c.name, c.admin1, c.country].filter(Boolean).join(', '),
          latitude: c.latitude,
          longitude: c.longitude,
          source: 'manual',
        }),
      ),
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível buscar cidades.' }, { status: 502 });
  }
}
