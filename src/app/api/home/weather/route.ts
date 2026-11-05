import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
export async function GET(req: NextRequest) {
  const db = await serverClient();
  if (!(await db.auth.getUser()).data.user) return new Response(null, { status: 401 });
  const rawLat = req.nextUrl.searchParams.get('lat'),
    rawLon = req.nextUrl.searchParams.get('lon');
  const lat = Number(rawLat),
    lon = Number(rawLon);
  if (
    !rawLat ||
    !rawLon ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return new Response(null, { status: 422 });
  try {
    const query = new URLSearchParams({
      latitude: lat.toFixed(2),
      longitude: lon.toFixed(2),
      current: 'temperature_2m,apparent_temperature,weather_code,is_day',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: 'auto',
      forecast_days: '1',
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error();
    const d = await r.json();
    const values = [
      d.current?.temperature_2m,
      d.current?.apparent_temperature,
      d.current?.weather_code,
      d.daily?.temperature_2m_min?.[0],
      d.daily?.temperature_2m_max?.[0],
      d.daily?.precipitation_probability_max?.[0],
    ];
    if (!values.every(Number.isFinite)) throw Error();
    return NextResponse.json(
      {
        temperature: values[0],
        feels: values[1],
        code: values[2],
        isDay: d.current.is_day === 1,
        min: values[3],
        max: values[4],
        rain: values[5],
        time: d.current.time,
        timezone: d.timezone,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Clima indisponível. Tente novamente.' }, { status: 502 });
  }
}
