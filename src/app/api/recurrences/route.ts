import { isSameOrigin } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { occurs, today, type Rule } from '@/lib/domain';
import { addDays, format, parseISO } from 'date-fns';
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data: settings } = await db.from('settings').select('timezone').maybeSingle();
  const start = today(settings?.timezone || 'America/Sao_Paulo');
  const { data: rules, error } = await db
    .from('financial_recurrence_rules')
    .select('*')
    .eq('active', true);
  if (error)
    return NextResponse.json({ error: 'Falha ao carregar recorrências.' }, { status: 500 });
  const rows = [];
  for (const r of rules) {
    for (let d = parseISO(start); d <= addDays(parseISO(start), 90); d = addDays(d, 1)) {
      const date = format(d, 'yyyy-MM-dd');
      if (occurs(r.start_date, date, r.recurrence as Rule))
        rows.push({
          user_id: user.id,
          recurrence_rule_id: r.id,
          description: r.description,
          type: r.type,
          amount_minor: r.amount_minor,
          account_id: r.account_id,
          category_id: r.category_id,
          occurred_on: date,
          status: 'planned',
        });
    }
  }
  if (rows.length) {
    const { error } = await db.from('transactions').upsert(rows, {
      onConflict: 'user_id,recurrence_rule_id,occurred_on',
      ignoreDuplicates: true,
    });
    if (error)
      return NextResponse.json({ error: 'Não foi possível gerar as previsões.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length });
}
