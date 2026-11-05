import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { MAX_UPLOAD_BYTES, MAX_ATTACHMENT_BYTES, matchesMime } from '@/lib/files';
import { z } from 'zod';
const input = z.object({
  entity: z.enum(['notes', 'transactions', 'vault_items', 'study_notes']),
  id: z.uuid(),
  encrypted: z.boolean(),
});
const allowed = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/octet-stream',
];
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  if (Number(req.headers.get('content-length')) > MAX_UPLOAD_BYTES + 10000)
    return new Response(null, { status: 413 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get('file');
    const parsed = input.parse({
      entity: form.get('entity'),
      id: form.get('id'),
      encrypted: form.get('encrypted') === 'true',
    });
    if (!(file instanceof File) || file.size > MAX_UPLOAD_BYTES || !allowed.includes(file.type))
      throw Error();
    if (parsed.entity === 'vault_items' && !parsed.encrypted) throw Error();
    if (!parsed.encrypted && file.size > MAX_ATTACHMENT_BYTES) throw Error();
    if (!parsed.encrypted && !matchesMime(new Uint8Array(await file.arrayBuffer()), file.type))
      throw Error();
    const { data: owner } = await db.from(parsed.entity).select('id').eq('id', parsed.id).single();
    if (!owner) throw Error();
    const id = crypto.randomUUID(),
      path = `${user.id}/${parsed.entity}/${parsed.id}/${id}`;
    const { error } = await db.storage.from('personal').upload(path, file, {
      contentType: parsed.encrypted ? 'application/octet-stream' : file.type,
      upsert: false,
    });
    if (error) throw error;
    const { error: insertError } = await db.from('attachments').insert({
      id,
      user_id: user.id,
      entity_type: parsed.entity,
      entity_id: parsed.id,
      storage_path: path,
      is_encrypted: parsed.encrypted,
      metadata: parsed.encrypted
        ? {}
        : { name: file.name.slice(0, 200), type: file.type, size: file.size },
    });
    if (insertError) {
      await db.storage.from('personal').remove([path]);
      throw insertError;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível enviar. Confira o tipo e o limite de tamanho.' },
      { status: 422 },
    );
  }
}
export async function GET(req: NextRequest) {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 422 });
  const { data: row } = await db.from('attachments').select('*').eq('id', id!).single();
  if (!row) return new Response(null, { status: 404 });
  const { data, error } = await db.storage.from('personal').download(row.storage_path);
  if (error) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="arquivo"',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 422 });
  const { data: row } = await db.from('attachments').select('*').eq('id', id!).single();
  if (!row) return new Response(null, { status: 404 });
  const { error } = await db.storage.from('personal').remove([row.storage_path]);
  if (error) return new Response(null, { status: 500 });
  const { error: deleted } = await db.from('attachments').delete().eq('id', id!);
  return NextResponse.json({ ok: !deleted }, { status: deleted ? 500 : 200 });
}
