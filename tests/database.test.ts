import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
async function asUser(id: string) {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage; create table auth.mfa_factors(id uuid default gen_random_uuid(),user_id uuid,status text); create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1'))$$; grant execute on function auth.jwt() to authenticated,anon; create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated; create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`,
  );
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
});
afterAll(async () => {
  await db.close();
});
describe('Database isolation and integrity', () => {
  it('enables RLS on every application table and exposes no anonymous data access', async () => {
    await db.exec('reset role');
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    await db.exec("set role anon; select set_config('request.jwt.claim.sub','',false)");
    for (const table of ['tasks', 'vault_items', 'transactions'])
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow();
    await expect(
      db.query(`insert into public.notes(user_id,title) values('${owner}','intrusion')`),
    ).rejects.toThrow();
  });
  it('allows CRUD only for owner and prevents changing ownership', async () => {
    await asUser(owner);
    const { rows } = await db.query<{ id: string }>(
      `insert into public.tasks(user_id,title,scheduled_on) values($1,'private task','2026-11-04') returning id`,
      [owner],
    );
    const id = rows[0].id;
    await asUser(other);
    expect((await db.query(`select * from public.tasks where id=$1`, [id])).rows).toHaveLength(0);
    expect(
      (await db.query(`update public.tasks set title='stolen' where id=$1 returning id`, [id]))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`delete from public.tasks where id=$1 returning id`, [id])).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `insert into public.tasks(user_id,title,scheduled_on) values($1,'intrusion','2026-11-04')`,
        [owner],
      ),
    ).rejects.toThrow();
    await asUser(owner);
    await expect(
      db.query(`update public.tasks set user_id=$1 where id=$2`, [other, id]),
    ).rejects.toThrow();
    await db.query(`update public.tasks set title='updated' where id=$1`, [id]);
    expect(
      (await db.query<{ title: string }>(`select title from public.tasks where id=$1`, [id]))
        .rows[0].title,
    ).toBe('updated');
  });
  it('blocks cross-owner financial foreign keys and invalid transfers', async () => {
    await asUser(other);
    const foreign = (
      await db.query<{ id: string }>(
        `insert into public.financial_accounts(user_id,name,type) values($1,'Other account','cash') returning id`,
        [other],
      )
    ).rows[0].id;
    await asUser(owner);
    await expect(
      db.query(
        `insert into public.transactions(user_id,account_id,type,description,amount_minor,occurred_on) values($1,$2,'expense','invalid',100,'2026-11-04')`,
        [owner, foreign],
      ),
    ).rejects.toThrow();
    const own = (
      await db.query<{ id: string }>(
        `insert into public.financial_accounts(user_id,name,type) values($1,'My account','cash') returning id`,
        [owner],
      )
    ).rows[0].id;
    await expect(
      db.query(
        `insert into public.transactions(user_id,account_id,destination_account_id,type,description,amount_minor,occurred_on) values($1,$2,$2,'transfer','invalid',100,'2026-11-04')`,
        [owner, own],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into public.transactions(user_id,account_id,type,description,amount_minor,occurred_on) values($1,$2,'expense','fractional',0,'2026-11-04')`,
        [owner, own],
      ),
    ).rejects.toThrow();
  });
  it('deduplicates financial recurrence and per-task occurrence keys', async () => {
    await asUser(owner);
    const a = (await db.query<{ id: string }>(`select id from financial_accounts limit 1`)).rows[0]
      .id;
    const rule = (
      await db.query<{ id: string }>(
        `insert into financial_recurrence_rules(user_id,description,type,amount_minor,account_id,start_date,recurrence) values($1,'Internet','expense',10000,$2,'2026-11-10','{"frequency":"monthly","interval":1}') returning id`,
        [owner, a],
      )
    ).rows[0].id;
    const sql = `insert into transactions(user_id,account_id,type,description,amount_minor,occurred_on,recurrence_rule_id,status) values($1,$2,'expense','Internet',10000,'2026-11-10',$3,'planned') on conflict(user_id,recurrence_rule_id,occurred_on) do nothing`;
    await db.query(sql, [owner, a, rule]);
    await db.query(sql, [owner, a, rule]);
    expect(
      (await db.query(`select * from transactions where recurrence_rule_id=$1`, [rule])).rows,
    ).toHaveLength(1);
    const t = (await db.query<{ id: string }>('select id from tasks limit 1')).rows[0].id;
    await db.query(
      `insert into task_occurrences(user_id,task_id,occurrence_date,status) values($1,$2,'2026-11-04','completed')`,
      [owner, t],
    );
    await expect(
      db.query(
        `insert into task_occurrences(user_id,task_id,occurrence_date,status) values($1,$2,'2026-11-04','pending')`,
        [owner, t],
      ),
    ).rejects.toThrow();
  });
  it('upserts an occurrence repeatedly without replacing identity or history of other days', async () => {
    await asUser(owner);
    const t = (await db.query<{ id: string }>('select id from tasks limit 1')).rows[0].id;
    const payload = {
      task_id: t,
      occurrence_date: '2026-11-05',
      status: 'completed',
      override_data: { title: 'Only this date' },
    };
    const first = (
      await db.query<{ row: { id: string; status: string } }>(
        'select to_jsonb(public.save_task_occurrence($1::jsonb)) as row',
        [JSON.stringify(payload)],
      )
    ).rows[0].row;
    const second = (
      await db.query<{ row: { id: string; status: string } }>(
        'select to_jsonb(public.save_task_occurrence($1::jsonb)) as row',
        [JSON.stringify({ ...payload, status: 'pending' })],
      )
    ).rows[0].row;
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('pending');
    expect(
      (
        await db.query<{ status: string }>(
          `select status from task_occurrences where task_id=$1 and occurrence_date='2026-11-04'`,
          [t],
        )
      ).rows[0].status,
    ).toBe('completed');
  });
  it('rejects incomplete recurrence rules before they can break the calendar', async () => {
    await asUser(owner);
    await expect(
      db.query(
        `insert into tasks(user_id,title,scheduled_on,recurrence) values($1,'Invalid recurrence','2026-11-04','{}')`,
        [owner],
      ),
    ).rejects.toThrow();
  });
  it('skips duplicate attachment metadata even if a restored file moved paths', async () => {
    await asUser(owner);
    const note = (
      await db.query<{ id: string }>(
        `insert into notes(user_id,title) values($1,'Attachment parent') returning id`,
        [owner],
      )
    ).rows[0];
    const oldPath = owner + '/notes/old-file',
      newPath = owner + '/restore/new-file';
    await db.query(
      `insert into storage.objects(bucket_id,name) values('personal',$1),('personal',$2)`,
      [oldPath, newPath],
    );
    const original = (
      await db.query<Record<string, unknown> & { id: string }>(
        `insert into attachments(user_id,entity_type,entity_id,storage_path) values($1,'notes',$2,$3) returning *`,
        [owner, note.id, oldPath],
      )
    ).rows[0];
    await db.query('update attachments set storage_path=$1 where id=$2', [newPath, original.id]);
    await db.query('delete from storage.objects where name=$1', [oldPath]);
    const result = (
      await db.query<{ restore_backup: { skipped: number } }>('select restore_backup($1::jsonb)', [
        JSON.stringify({ attachments: [original] }),
      ])
    ).rows[0];
    expect(result.restore_backup.skipped).toBe(1);
    expect(
      (
        await db.query<{ storage_path: string }>(
          'select storage_path from attachments where id=$1',
          [original.id],
        )
      ).rows[0].storage_path,
    ).toBe(newPath);
  });
  it('records goal progress atomically', async () => {
    await asUser(owner);
    const goal = (
      await db.query<{ id: string }>(
        `insert into goals(user_id,title,target_value,current_value,start_date) values($1,'Read',12,0,'2026-11-04') returning id`,
        [owner],
      )
    ).rows[0].id;
    await db.query(`update goals set current_value=3 where id=$1`, [goal]);
    const rows = (
      await db.query<{ change_value: string; resulting_value: string }>(
        `select change_value,resulting_value from goal_updates where goal_id=$1 order by created_at`,
        [goal],
      )
    ).rows;
    expect(Number(rows.at(-1)!.change_value)).toBe(3);
    expect(Number(rows.at(-1)!.resulting_value)).toBe(3);
  });
  it('keeps files private and denies spoofed namespaces', async () => {
    await asUser(owner);
    await db.query(`insert into storage.objects(bucket_id,name) values('personal',$1)`, [
      owner + '/notes/test/file',
    ]);
    await expect(
      db.query(`insert into storage.objects(bucket_id,name) values('personal',$1)`, [
        other + '/notes/test/file',
      ]),
    ).rejects.toThrow();
    await asUser(other);
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await db.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false); set role anon;",
    );
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
  });
  it('roundtrips a backup, preserves duplicates and rolls back invalid imports', async () => {
    await asUser(owner);
    const original = (
      await db.query<Record<string, unknown> & { id: string }>(
        `insert into notes(user_id,title,content) values($1,'Preserved note','my content') returning *`,
        [owner],
      )
    ).rows[0];
    await db.query('delete from notes where id=$1', [original.id]);
    const backup = { notes: [original] };
    const first = (
      await db.query<{ restore_backup: { inserted: number; skipped: number } }>(
        `select public.restore_backup($1::jsonb)`,
        [JSON.stringify(backup)],
      )
    ).rows[0].restore_backup;
    expect(first.inserted).toBe(1);
    const second = (
      await db.query<{ restore_backup: { inserted: number; skipped: number } }>(
        `select public.restore_backup($1::jsonb)`,
        [JSON.stringify(backup)],
      )
    ).rows[0].restore_backup;
    expect(second.skipped).toBe(1);
    const newId = '33333333-3333-4333-8333-333333333333';
    await expect(
      db.query(`select public.restore_backup($1::jsonb)`, [
        JSON.stringify({
          notes: [
            { ...original, id: newId },
            { ...original, id: '44444444-4444-4444-8444-444444444444', user_id: other },
          ],
        }),
      ]),
    ).rejects.toThrow();
    expect((await db.query('select * from notes where id=$1', [newId])).rows).toHaveLength(0);
    expect(
      (await db.query<{ content: string }>('select content from notes where id=$1', [original.id]))
        .rows[0].content,
    ).toBe('my content');
  });
});

describe('Study collections, notes and private files', () => {
  it('isolates study notes and rejects a collection owned by another account', async () => {
    await asUser(owner);
    const collection = (
      await db.query<{ id: string }>(
        `insert into study_collections(user_id,kind,title) values($1,'book','Private book') returning id`,
        [owner],
      )
    ).rows[0];
    const note = (
      await db.query<{ id: string }>(
        `insert into study_notes(user_id,collection_id,title,content) values($1,$2,'Chapter one','# Private content') returning id`,
        [owner, collection.id],
      )
    ).rows[0];
    await db.query(`update study_notes set content='Revised' where id=$1`, [note.id]);
    await asUser(other);
    expect((await db.query('select * from study_notes where id=$1', [note.id])).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query('select * from study_collections where id=$1', [collection.id])).rows,
    ).toHaveLength(0);
    await expect(
      db.query(`insert into study_notes(user_id,collection_id,title) values($1,$2,'Forbidden')`, [
        other,
        collection.id,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into study_notes(user_id,collection_id,title) values($1,$2,'Spoofed owner')`,
        [owner, collection.id],
      ),
    ).rejects.toThrow();
    await asUser(owner);
    await expect(
      db.query(`update study_notes set user_id=$1 where id=$2`, [other, note.id]),
    ).rejects.toThrow();
    await expect(
      db.query(`delete from study_collections where id=$1`, [collection.id]),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into study_notes(user_id,collection_id,title) values($1,$2,'CHAPTER ONE')`, [
        owner,
        collection.id,
      ]),
    ).rejects.toThrow();
    await db.query('delete from study_notes where id=$1', [note.id]);
    await db.query('delete from study_collections where id=$1', [collection.id]);
  });
  it('restores study collections before notes and rejects dangling references atomically', async () => {
    await asUser(owner);
    const collection = (
      await db.query<Record<string, unknown>>(
        `insert into study_collections(user_id,kind,title) values($1,'subject','Biology') returning *`,
        [owner],
      )
    ).rows[0];
    const note = (
      await db.query<Record<string, unknown>>(
        `insert into study_notes(user_id,collection_id,title,content) values($1,$2,'Cells','## Cells') returning *`,
        [owner, collection.id],
      )
    ).rows[0];
    await db.query('delete from study_notes where id=$1', [note.id]);
    await db.query('delete from study_collections where id=$1', [collection.id]);
    const payload = JSON.stringify({ study_notes: [note], study_collections: [collection] });
    const restored = (
      await db.query<{ restore_backup: { inserted: number; skipped: number } }>(
        'select restore_backup($1::jsonb)',
        [payload],
      )
    ).rows[0].restore_backup;
    expect(restored.inserted).toBe(2);
    expect(
      (
        await db.query<{ restore_backup: { skipped: number } }>(
          'select restore_backup($1::jsonb)',
          [payload],
        )
      ).rows[0].restore_backup.skipped,
    ).toBe(2);
    const badId = '66666666-6666-4666-8666-666666666666';
    await expect(
      db.query('select restore_backup($1::jsonb)', [
        JSON.stringify({
          study_collections: [{ ...collection, id: badId }],
          study_notes: [
            {
              ...note,
              id: '77777777-7777-4777-8777-777777777777',
              collection_id: '88888888-8888-4888-8888-888888888888',
            },
          ],
        }),
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query('select id from study_collections where id=$1', [badId])).rows,
    ).toHaveLength(0);
  });
  it('validates study attachment parents and blocks deletion until files are removed', async () => {
    await asUser(owner);
    const collection = (
      await db.query<{ id: string }>(
        `insert into study_collections(user_id,kind,title) values($1,'subject','Files') returning id`,
        [owner],
      )
    ).rows[0];
    const note = (
      await db.query<{ id: string }>(
        `insert into study_notes(user_id,collection_id,title) values($1,$2,'With PDF') returning id`,
        [owner, collection.id],
      )
    ).rows[0];
    const path = owner + '/study_notes/' + note.id + '/test';
    await db.query(`insert into storage.objects(bucket_id,name) values('personal',$1)`, [path]);
    const file = (
      await db.query<{ id: string }>(
        `insert into attachments(user_id,entity_type,entity_id,storage_path) values($1,'study_notes',$2,$3) returning id`,
        [owner, note.id, path],
      )
    ).rows[0];
    await expect(db.query('delete from study_notes where id=$1', [note.id])).rejects.toThrow();
    await asUser(other);
    expect((await db.query('select id from attachments where id=$1', [file.id])).rows).toHaveLength(
      0,
    );
    await asUser(owner);
    await db.query('delete from attachments where id=$1', [file.id]);
    await db.query('delete from storage.objects where name=$1', [path]);
    await db.query('delete from study_notes where id=$1', [note.id]);
  });
  it('includes studies in account data erasure', async () => {
    await asUser(other);
    const collection = (
      await db.query<{ id: string }>(
        `insert into study_collections(user_id,kind,title) values($1,'subject','Erase only mine') returning id`,
        [other],
      )
    ).rows[0];
    await db.query(
      `insert into study_notes(user_id,collection_id,title) values($1,$2,'Delete me')`,
      [other, collection.id],
    );
    await db.query('select erase_personal_data()');
    expect((await db.query('select * from study_notes')).rows).toHaveLength(0);
    expect((await db.query('select * from study_collections')).rows).toHaveLength(0);
    await asUser(owner);
    expect((await db.query('select * from study_collections')).rows.length).toBeGreaterThan(0);
  });
});

describe('Push queue and conditional MFA',()=>{
 it('requires a second factor for enrolled users even through direct database access',async()=>{
  await db.exec('reset role');await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')",[owner]);
  await asUser(owner);await db.exec("select set_config('request.jwt.claim.aal','aal1',false)");
  expect((await db.query('select * from study_collections')).rows).toHaveLength(0);
  await expect(db.query("insert into study_collections(user_id,kind,title) values($1,'book','Blocked by MFA')",[owner])).rejects.toThrow();
  await db.exec("select set_config('request.jwt.claim.aal','aal2',false)");
  expect((await db.query('select * from study_collections')).rows.length).toBeGreaterThan(0);
  await db.exec('reset role');await db.query('delete from auth.mfa_factors where user_id=$1',[owner]);await db.exec("select set_config('request.jwt.claim.aal','aal1',false)");
 });
 it('isolates subscriptions, restricts worker RPCs and does not claim a delivery twice',async()=>{
  await asUser(owner);
  const sub=(await db.query<{id:string}>(`insert into push_subscriptions(user_id,endpoint,p256dh,auth) values($1,'https://fcm.googleapis.com/test',$2,$3) returning id`,[owner,'a'.repeat(87),'b'.repeat(22)])).rows[0];
  await expect(db.query('select get_push_runtime()')).rejects.toThrow();
  await expect(db.query('select claim_push_deliveries()')).rejects.toThrow();
  await asUser(other);expect((await db.query('select * from push_subscriptions')).rows).toHaveLength(0);
  await db.exec('reset role');
  const notification=(await db.query<{id:string}>(`insert into notifications(user_id,type,message,scheduled_at,idempotency_key) values($1,'task','Queued',now(),'queue-test') returning id`,[owner])).rows[0];
  await db.query('select enqueue_push_deliveries()');await db.query('select enqueue_push_deliveries()');
  expect((await db.query('select * from push_deliveries where subscription_id=$1',[sub.id])).rows).toHaveLength(1);
  expect((await db.query('select * from claim_push_deliveries()')).rows).toHaveLength(1);
  expect((await db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await asUser(owner);await db.query('delete from push_subscriptions where id=$1',[sub.id]);
  await db.exec('reset role');expect((await db.query('select * from push_deliveries where notification_id=$1',[notification.id])).rows).toHaveLength(0);
 });
});
