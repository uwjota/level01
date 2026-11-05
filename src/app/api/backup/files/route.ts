import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { MAX_UPLOAD_BYTES } from '@/lib/files';
import { z } from 'zod';
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
    const batch = z.uuid().parse(form.get('batch')),
      id = z.uuid().parse(form.get('id')),
      file = form.get('file');
    if (!(file instanceof File) || file.size > MAX_UPLOAD_BYTES) throw Error();
    const path = `${user.id}/restore/${batch}/${id}`;
    const { error } = await db.storage
      .from('personal')
      .upload(path, file, { contentType: 'application/octet-stream', upsert: false });
    if (error) throw error;
    return NextResponse.json({ path });
  } catch {
    return NextResponse.json(
      { error: 'Falha ao preparar os arquivos do backup.' },
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
  const path = req.nextUrl.searchParams.get('path') ?? '';
  const parts = path.split('/');
  if (
    parts.length !== 4 ||
    parts[0] !== user.id ||
    parts[1] !== 'restore' ||
    !z.uuid().safeParse(parts[2]).success ||
    !z.uuid().safeParse(parts[3]).success
  )
    return new Response(null, { status: 422 });
  const { data: linked, error: lookupError } = await db
    .from('attachments')
    .select('id')
    .eq('storage_path', path)
    .limit(1);
  if (lookupError) return new Response(null, { status: 500 });
  if (linked?.length) return NextResponse.json({ kept: true });
  const { error } = await db.storage.from('personal').remove([path]);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
