import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { configured, serverClient } from '@/lib/supabase/server';
import { schemas, type Entity } from '@/lib/schemas';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function context(req: NextRequest, params: Promise<{ entity: string }>) {
  const { entity } = await params;
  if (!Object.hasOwn(schemas, entity) && !['goal_updates', 'attachments'].includes(entity))
    return { error: reply({ error: 'Recurso inválido.' }, 404) };
  if (!configured())
    return { error: reply({ error: 'Configure o Supabase para continuar.' }, 503) };
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { error: reply({ error: 'Entre na sua conta.' }, 401) };
  if (req.method !== 'GET' && !isSameOrigin(req))
    return { error: reply({ error: 'Origem inválida.' }, 403) };
  return { db, user, entity };
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const c = await context(req, params);
  if (c.error) return c.error;
  const page = Math.max(0, Number(req.nextUrl.searchParams.get('page')) || 0);
  const pageSize = c.entity === 'vault_items' ? 10 : 100;
  const { data, error, count } = await c
    .db!.from(c.entity!)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  return error
    ? reply({ error: 'Não foi possível carregar os registros.' }, 400)
    : reply({ data, count });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  return save(req, params, false);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  return save(req, params, true);
}
async function save(req: NextRequest, params: Promise<{ entity: string }>, update: boolean) {
  const c = await context(req, params);
  if (c.error) return c.error;
  if (!Object.hasOwn(schemas, c.entity!)) return reply({ error: 'Operação indisponível.' }, 405);
  try {
    const body = await req.json();
    const input = schemas[c.entity as Entity].parse(body);
    const id = z
      .uuid()
      .parse(
        ['settings', 'vault_configs'].includes(c.entity!)
          ? c.user!.id
          : (body.id ?? crypto.randomUUID()),
      );
    if (c.entity === 'task_occurrences') {
      const { data, error } = await c.db!.rpc('save_task_occurrence', { payload: input });
      return error
        ? reply({ error: 'Não foi possível salvar a ocorrência.' }, 400)
        : reply({ data });
    }
    let query;
    if (update) query = c.db!.from(c.entity!).update(input).eq('id', id).eq('user_id', c.user!.id);
    else if (c.entity === 'settings')
      query = c
        .db!.from(c.entity!)
        .upsert({ ...input, id: c.user!.id, user_id: c.user!.id }, { onConflict: 'user_id' });
    else query = c.db!.from(c.entity!).insert({ ...input, id, user_id: c.user!.id });
    if (c.entity === 'vault_configs' && update) {
      const previous = schemas.vault_configs.shape.encrypted_data_key.parse(
        body.expected_wrapped_key,
      );
      query = query.eq('encrypted_data_key', JSON.stringify(previous));
    }
    const { data, error } = await query.select().single();
    return error
      ? reply({ error: 'Não foi possível salvar. Confira os vínculos e os campos.' }, 400)
      : reply({ data });
  } catch {
    return reply({ error: 'Dados inválidos. Revise os campos e tente novamente.' }, 422);
  }
}
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const c = await context(req, params);
  if (c.error) return c.error;
  if (['goal_updates', 'attachments'].includes(c.entity!))
    return reply({ error: 'Use a operação específica de arquivos.' }, 405);
  const id = req.nextUrl.searchParams.get('id');
  if (!z.uuid().safeParse(id).success) return reply({ error: 'Identificador inválido.' }, 422);
  const { error } = await c.db!.from(c.entity!).delete().eq('id', id!).eq('user_id', c.user!.id);
  return error
    ? reply({ error: 'Este registro possui vínculos. Remova os vínculos ou arquive-o.' }, 409)
    : reply({ ok: true });
}
