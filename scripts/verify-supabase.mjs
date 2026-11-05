import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Configure URL e chave pública em .env.local.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of [
  'tasks',
  'transactions',
  'financial_accounts',
  'notes',
  'study_collections',
  'study_notes',
  'vault_configs',
  'vault_items',
  'attachments',
  'settings',
  'push_subscriptions',
  'push_deliveries',
  'push_public_config',
]) {
  const { data, error } = await db
    .from(table)
    .select(table === 'push_public_config' ? 'singleton' : 'id')
    .limit(1);
  if (!error && data?.length) {
    console.error(`FALHA: ${table} expõe dados sem autenticação.`);
    process.exit(1);
  }
  if (error && !['42501', 'PGRST301', 'PGRST302'].includes(error.code)) {
    console.error(`Não foi possível verificar ${table}: aplique as migrações e confira a conexão.`);
    process.exit(1);
  }
  console.log(`OK: ${table} não expõe registros anônimos.`);
}
const { data: files, error: fileError } = await db.storage.from('personal').list();
if (!fileError && files?.length) {
  console.error('FALHA: arquivos visíveis sem autenticação.');
  process.exit(1);
}
console.log(
  'OK: sem listagem anônima de arquivos. Verifique também o isolamento entre duas sessões autenticadas antes de produção.',
);
