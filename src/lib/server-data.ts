import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from './domain';
export async function readAllRows(db: SupabaseClient, table: string, userId: string) {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('id')
      .range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data ?? []));
    if (data.length < 500) return result;
  }
}
