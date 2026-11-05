import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { backupSchema, backupTables, schemas } from '@/lib/schemas';
export const dynamic = 'force-dynamic';
export async function GET() {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const tables: Record<string, unknown[]> = {};
  for (const table of [...backupTables, 'goal_updates', 'attachments']) {
    tables[table] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await db
        .from(table)
        .select('*')
        .order('id')
        .range(page * 500, page * 500 + 499);
      if (error) return NextResponse.json({ error: 'Falha ao exportar.' }, { status: 500 });
      tables[table].push(...data);
      if (data.length < 500) break;
    }
  }
  const payload = {
    version: 1,
    user_id: user.id,
    exported_at: new Date().toISOString(),
    tables,
    attachments: [],
  };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 3_000_000)
    return NextResponse.json(
      { error: 'Os registros do backup excedem o limite de 3 MB.' },
      { status: 413 },
    );
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'attachment; filename="central-backup.json"',
    },
  });
}
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 3_000_000) throw Error();
    const input = backupSchema.parse(JSON.parse(raw));
    if (input.user_id !== user.id)
      return NextResponse.json(
        {
          error:
            'Este backup pertence a outra conta. A restauração do Cofre exige o mesmo proprietário.',
        },
        { status: 422 },
      );
    for (const [table, rows] of Object.entries(input.tables)) {
      if (!(table in schemas) && !['goal_updates', 'attachments'].includes(table)) throw Error();
      for (const row of rows) {
        if (row.user_id !== user.id) throw Error();
        if (table in schemas) schemas[table as keyof typeof schemas].parse(row);
      }
    }
    const { data, error } = await db.rpc('restore_backup', { payload: input.tables });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: 'Backup inválido ou vínculos incompatíveis. Nenhum registro foi importado.' },
      { status: 422 },
    );
  }
}
