import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { buildReminders } from '@/lib/reminder-jobs';
import { readAllRows } from '@/lib/server-data';
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const [settings, tasks, occurrences, transactions, goals] = await Promise.all(
      ['settings', 'tasks', 'task_occurrences', 'transactions', 'goals'].map((t) =>
        readAllRows(db, t, user.id),
      ),
    );
    const rows = buildReminders(user.id, settings[0], tasks, occurrences, transactions, goals);
    if (rows.length) {
      const { error } = await db
        .from('notifications')
        .upsert(rows, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Falha nos lembretes.' }, { status: 500 });
  }
}
