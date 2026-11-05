import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isSameOrigin } from '@/lib/request-origin';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  configured: () => true,
  serverClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
import { POST, PATCH, DELETE } from '@/app/api/data/[entity]/route';
import { GET as callback } from '@/app/auth/callback/route';

const owner = '66f53e94-6d2e-44cb-8e65-a69a3da23888';
const id = '6c1398f8-b562-44fc-b439-ac233ea10834';
const task = {
  id,
  title: 'Testar gravação',
  scheduled_on: '2026-11-04',
  priority: 'medium',
  status: 'pending',
  recurrence: null,
};
const params = () => ({ params: Promise.resolve({ entity: 'tasks' }) });
function request(method: string, origin: string | null = 'http://localhost:3000') {
  const headers = new Headers({ host: 'localhost:3000', 'content-type': 'application/json' });
  if (origin !== null) headers.set('origin', origin);
  return new NextRequest(`http://0.0.0.0:3000/api/data/tasks?id=${id}`, {
    method,
    headers,
    ...(['POST', 'PATCH'].includes(method) ? { body: JSON.stringify(task) } : {}),
  });
}
function databaseQuery() {
  const query = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: task, error: null }),
    error: null,
  };
  mocks.from.mockReturnValue(query);
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: owner } } });
});

describe('mutation API behind a wildcard listening address', () => {
  it('sends a same-origin creation to Supabase with the authenticated owner', async () => {
    const query = databaseQuery();
    const response = await POST(request('POST'), params());
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('tasks');
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id, user_id: owner, title: task.title }),
    );
    expect(await response.json()).toEqual({ data: task });
  });
  it('allows updates and scopes them to the owner', async () => {
    const query = databaseQuery();
    expect((await PATCH(request('PATCH'), params())).status).toBe(200);
    expect(query.update).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('id', id);
    expect(query.eq).toHaveBeenCalledWith('user_id', owner);
  });
  it('allows deletion and scopes it to the owner', async () => {
    const query = databaseQuery();
    expect((await DELETE(request('DELETE'), params())).status).toBe(200);
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', owner);
  });
  it.each([
    'https://attacker.example',
    'http://localhost:4000',
    'https://localhost:3000',
    'null',
    null,
  ])('rejects untrusted or absent origin %s before writing', async (origin) => {
    databaseQuery();
    expect((await POST(request('POST', origin), params())).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('still requires a valid authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request('POST'), params())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('public request origin', () => {
  it.each(['http://127.0.0.1:3000', 'http://[::1]:3000', 'https://central.example'])(
    'accepts the actual host %s',
    (origin) => {
      const req = new NextRequest(`${new URL(origin).protocol}//0.0.0.0:3000/api/data/tasks`, {
        headers: { host: new URL(origin).host, origin },
      });
      expect(isSameOrigin(req)).toBe(true);
    },
  );
  it('does not let X-Forwarded-Host authorize an external origin', () => {
    const req = request('POST', 'https://attacker.example');
    req.headers.set('x-forwarded-host', 'attacker.example');
    expect(isSameOrigin(req)).toBe(false);
  });
  it.each([
    '',
    'localhost:3000/anything',
    'user@localhost:3000',
    'localhost:3000\\attacker.example',
  ])('rejects invalid host %s', (host) => {
    const req = request('POST');
    req.headers.set('host', host);
    expect(isSameOrigin(req)).toBe(false);
  });
  it('keeps authentication redirects on the browser host', async () => {
    const req = new NextRequest('http://0.0.0.0:3000/auth/callback', {
      headers: { host: 'localhost:3000' },
    });
    expect((await callback(req)).headers.get('location')).toBe('http://localhost:3000/login');
  });
});
