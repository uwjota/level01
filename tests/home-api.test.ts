import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), rpc: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverClient: async () => ({ auth: { getUser: mock.user }, from: mock.from, rpc: mock.rpc }),
}));
import { GET as weather } from '@/app/api/home/weather/route';
import { GET as cities } from '@/app/api/home/cities/route';
import { GET as push } from '@/app/api/push/route';
import { POST as testPush } from '@/app/api/push/test/route';
beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ data: { user: { id: 'owner' } } });
  vi.stubGlobal('fetch', mock.fetch);
});
afterEach(() => vi.unstubAllGlobals());
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const testReq = () =>
  new NextRequest('http://localhost:3000/api/push/test', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
  });
describe('Home API boundaries', () => {
  it('requires a session before consulting location services', async () => {
    mock.user.mockResolvedValue({ data: { user: null } });
    expect((await weather(req('/api/home/weather?lat=1&lon=2'))).status).toBe(401);
    expect((await cities(req('/api/home/cities?q=Recife'))).status).toBe(401);
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it('rejects missing/out-of-range coordinates before the external request', async () => {
    for (const query of ['lat=91&lon=0', 'lat=0', 'lat=abc&lon=0'])
      expect((await weather(req('/api/home/weather?' + query))).status).toBe(422);
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it('normalizes a real provider response into the fields rendered by WeatherCard', async () => {
    mock.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 28,
          apparent_temperature: 30,
          weather_code: 0,
          is_day: 1,
          time: '2026-11-04T12:00',
        },
        daily: {
          temperature_2m_min: [24],
          temperature_2m_max: [31],
          precipitation_probability_max: [10],
        },
        timezone: 'America/Recife',
      }),
    });
    const r = await weather(req('/api/home/weather?lat=-8.054&lon=-34.884'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      temperature: 28,
      feels: 30,
      code: 0,
      isDay: true,
      min: 24,
      max: 31,
      rain: 10,
      time: '2026-11-04T12:00',
      timezone: 'America/Recife',
    });
    expect(String(mock.fetch.mock.calls[0][0])).toContain('latitude=-8.05&longitude=-34.88');
  });
  it('returns a recoverable error for weather outages', async () => {
    mock.fetch.mockResolvedValue({ ok: false });
    const r = await weather(req('/api/home/weather?lat=0&lon=0'));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toContain('Tente novamente');
  });
  it('does not hide database errors as an unconfigured push service', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'database error' } });
    mock.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: [], error: null }) }) });
    const r = await push();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain('Tente novamente');
  });
  it('does not claim a test is scheduled if no device is registered', async () => {
    const upsert = vi.fn();
    mock.from.mockReturnValue({
      select: () => ({ eq: async () => ({ count: 0, error: null }) }),
      upsert,
    });
    const r = await testPush(testReq());
    expect(r.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('schedules tests for the authenticated owner when a subscription exists', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mock.from.mockReturnValue({
      select: () => ({ eq: async () => ({ count: 1, error: null }) }),
      upsert,
    });
    expect((await testPush(testReq())).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'owner', message: 'Teste de notificações do Level01' }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });
});
