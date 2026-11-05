-- Private study collections and Markdown notes. Existing data is retained.
create table public.study_collections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('book','subject')),
 title text not null check(length(trim(title)) between 1 and 300),
 author text not null default '' check(length(author)<=300),
 description text not null default '' check(length(description)<=20000),
 status text not null default 'in_progress' check(status in ('planned','in_progress','completed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create table public.study_notes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 collection_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 300),
 content text not null default '' check(length(content)<=20000),
 source_url text not null default '' check(source_url='' or (length(source_url)<=2000 and source_url ~ '^https?://')),
 tags text[] not null default '{}' check(cardinality(tags)<=30),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id),
 foreign key(collection_id,user_id) references public.study_collections(id,user_id)
);
create unique index study_notes_title_idx on public.study_notes(collection_id,lower(title));
create index study_notes_collection_owner_idx on public.study_notes(collection_id,user_id);
alter table public.study_collections enable row level security;
revoke all on public.study_collections from anon;
grant select,insert,update,delete on public.study_collections to authenticated;
create policy owner_select on public.study_collections for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.study_collections for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.study_collections for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.study_collections for delete to authenticated using ((select auth.uid())=user_id);
create index study_collections_owner_idx on public.study_collections(user_id,created_at desc);
create trigger touch before update on public.study_collections for each row execute function private.touch_row();
alter table public.study_notes enable row level security;
revoke all on public.study_notes from anon;
grant select,insert,update,delete on public.study_notes to authenticated;
create policy owner_select on public.study_notes for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.study_notes for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.study_notes for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.study_notes for delete to authenticated using ((select auth.uid())=user_id);
create index study_notes_owner_idx on public.study_notes(user_id,created_at desc);
create trigger touch before update on public.study_notes for each row execute function private.touch_row();
alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check check(entity_type in ('notes','transactions','vault_items','study_notes'));
create trigger protect_attachments before delete on public.study_notes for each row execute function private.prevent_orphan_files();
create or replace function private.check_attachment() returns trigger language plpgsql set search_path='' as $$
declare found boolean;
begin
 if new.entity_type not in ('notes','transactions','vault_items','study_notes') then raise exception 'Invalid entity'; end if;
 execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',new.entity_type) into found using new.entity_id,new.user_id;
 if not found then raise exception 'Invalid attachment reference'; end if;
 if not exists(select 1 from storage.objects where bucket_id='personal' and name=new.storage_path) then raise exception 'Missing storage object'; end if;
 return new;
end $$;
create or replace function public.erase_personal_data() returns void language plpgsql security invoker set search_path='' as $$
declare t text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 foreach t in array array['attachments','study_notes','study_collections','vault_items','vault_configs','notifications','task_occurrences','tasks','transactions','financial_recurrence_rules','financial_categories','financial_accounts','goal_updates','goals','notes','settings'] loop
  execute format('delete from public.%I where user_id=$1',t) using auth.uid();
 end loop;
end $$;
revoke all on function public.erase_personal_data() from public,anon;
grant execute on function public.erase_personal_data() to authenticated;
create or replace function public.restore_backup(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t text; item jsonb; columns text; inserted integer:=0; skipped integer:=0; n integer; new_goals uuid[]:='{}'; already_exists boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(payload)<>'object' then raise exception 'Invalid payload'; end if;
 perform private.check_vault_backup(payload);
 for t in select jsonb_object_keys(payload) loop
  if t<>all(array['settings','tasks','task_occurrences','financial_accounts','financial_categories','financial_recurrence_rules','transactions','goals','goal_updates','notes','study_collections','study_notes','vault_configs','vault_items','attachments','notifications']) then raise exception 'Unknown table'; end if;
 end loop;
 foreach t in array array['settings','tasks','task_occurrences','financial_accounts','financial_categories','financial_recurrence_rules','transactions','goals','goal_updates','notes','study_collections','study_notes','vault_configs','vault_items','attachments','notifications'] loop
  if t='goal_updates' and payload ? 'goal_updates' then delete from public.goal_updates where goal_id=any(new_goals) and user_id=auth.uid(); end if;
  for item in select value from jsonb_array_elements(coalesce(payload->t,'[]')) loop
   if (item->>'user_id')::uuid is distinct from auth.uid() then raise exception 'Owner mismatch'; end if;
   if (item->>'id') is null then raise exception 'Missing identity'; end if;
   execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',t) into already_exists using (item->>'id')::uuid,auth.uid();
   if already_exists then skipped:=skipped+1; continue; end if;
   select string_agg(quote_ident(column_name),',') into columns from information_schema.columns where table_schema='public' and table_name=t;
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict do nothing',t,columns,columns,t) using item;
   get diagnostics n=row_count;
   inserted:=inserted+n; skipped:=skipped+(1-n);
   if t='goals' and n=1 then new_goals:=array_append(new_goals,(item->>'id')::uuid); end if;
  end loop;
 end loop;
 return jsonb_build_object('inserted',inserted,'skipped',skipped);
end $$;
revoke all on function public.restore_backup(jsonb) from public,anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
