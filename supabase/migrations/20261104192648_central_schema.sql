-- One-time replacement of the legacy application, explicitly authorized by the owner.
-- DO NOT re-run this initial migration on a populated Central Pessoal deployment.
drop function if exists public.sync_note_links() cascade;
drop function if exists public.touch_note() cascade;
drop function if exists public.handle_new_user() cascade;
drop table if exists public.note_links, public.pomodoro_sessions, public.finances, public.projects, public.profiles, public.tasks, public.notes cascade;

-- Central Pessoal. All application data uses owner isolation.
create schema if not exists private;
revoke all on schema private from public;
create function private.touch_row() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' and (new.user_id <> old.user_id or new.id <> old.id) then raise exception 'Immutable ownership and identity'; end if;
 new.updated_at = now(); return new;
end $$;

create table public.settings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 display_name text not null default '', timezone text not null default 'America/Sao_Paulo', theme text not null default 'light' check(theme in ('light','dark','system')), week_starts_on integer not null default 1 check(week_starts_on in (0,1)), vault_timeout_minutes integer not null default 5 check(vault_timeout_minutes between 1 and 30), notification_preferences jsonb not null default '{"tasks":true,"finance":true,"goals":true,"advance_minutes":30}', unique(user_id), check(id=user_id), unique(id,user_id)
);
alter table public.settings enable row level security;
revoke all on public.settings from anon;
grant select,insert,update,delete on public.settings to authenticated;
create policy owner_select on public.settings for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.settings for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.settings for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.settings for delete to authenticated using ((select auth.uid())=user_id);
create index settings_owner_idx on public.settings(user_id,created_at desc);
create trigger touch before update on public.settings for each row execute function private.touch_row();

create table public.tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 title text not null check(length(title) between 1 and 300), description text not null default '', scheduled_on date not null, scheduled_time time, priority text not null default 'medium' check(priority in ('low','medium','high')), status text not null default 'pending' check(status in ('pending','completed','cancelled')), recurrence jsonb, reminder_minutes integer not null default 30 check(reminder_minutes between 0 and 10080), check(recurrence is null or (recurrence->>'frequency' in ('daily','weekly','monthly','yearly') and (recurrence->>'interval')::int between 1 and 365)), unique(id,user_id)
);
alter table public.tasks enable row level security;
revoke all on public.tasks from anon;
grant select,insert,update,delete on public.tasks to authenticated;
create policy owner_select on public.tasks for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.tasks for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.tasks for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.tasks for delete to authenticated using ((select auth.uid())=user_id);
create index tasks_owner_idx on public.tasks(user_id,created_at desc);
create trigger touch before update on public.tasks for each row execute function private.touch_row();

create table public.task_occurrences (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 task_id uuid not null, occurrence_date date not null, status text not null check(status in ('pending','completed','cancelled')), completed_at timestamptz, override_data jsonb not null default '{}', foreign key(task_id,user_id) references public.tasks(id,user_id) on delete cascade, unique(user_id,task_id,occurrence_date), unique(id,user_id)
);
alter table public.task_occurrences enable row level security;
revoke all on public.task_occurrences from anon;
grant select,insert,update,delete on public.task_occurrences to authenticated;
create policy owner_select on public.task_occurrences for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.task_occurrences for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.task_occurrences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.task_occurrences for delete to authenticated using ((select auth.uid())=user_id);
create index task_occurrences_owner_idx on public.task_occurrences(user_id,created_at desc);
create trigger touch before update on public.task_occurrences for each row execute function private.touch_row();

create table public.financial_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 name text not null check(length(name) between 1 and 300), type text not null check(type in ('checking','digital','cash','savings','other')), opening_balance_minor bigint not null default 0 check(abs(opening_balance_minor)<=9000000000000), color text not null default '#2563eb', archived_at timestamptz, unique(id,user_id)
);
alter table public.financial_accounts enable row level security;
revoke all on public.financial_accounts from anon;
grant select,insert,update,delete on public.financial_accounts to authenticated;
create policy owner_select on public.financial_accounts for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.financial_accounts for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.financial_accounts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.financial_accounts for delete to authenticated using ((select auth.uid())=user_id);
create index financial_accounts_owner_idx on public.financial_accounts(user_id,created_at desc);
create trigger touch before update on public.financial_accounts for each row execute function private.touch_row();

create table public.financial_categories (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 name text not null check(length(name) between 1 and 300), type text not null check(type in ('income','expense')), color text not null default '#2563eb', icon text not null default 'tag', unique(id,user_id)
);
alter table public.financial_categories enable row level security;
revoke all on public.financial_categories from anon;
grant select,insert,update,delete on public.financial_categories to authenticated;
create policy owner_select on public.financial_categories for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.financial_categories for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.financial_categories for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.financial_categories for delete to authenticated using ((select auth.uid())=user_id);
create index financial_categories_owner_idx on public.financial_categories(user_id,created_at desc);
create trigger touch before update on public.financial_categories for each row execute function private.touch_row();

create table public.financial_recurrence_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 description text not null check(length(description) between 1 and 300), type text not null check(type in ('income','expense')), amount_minor bigint not null check(amount_minor between 1 and 9000000000000), account_id uuid not null, category_id uuid, start_date date not null, recurrence jsonb not null, active boolean not null default true, foreign key(account_id,user_id) references public.financial_accounts(id,user_id), foreign key(category_id,user_id) references public.financial_categories(id,user_id), check(recurrence->>'frequency' in ('daily','weekly','monthly','yearly') and (recurrence->>'interval')::int between 1 and 365), unique(id,user_id)
);
alter table public.financial_recurrence_rules enable row level security;
revoke all on public.financial_recurrence_rules from anon;
grant select,insert,update,delete on public.financial_recurrence_rules to authenticated;
create policy owner_select on public.financial_recurrence_rules for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.financial_recurrence_rules for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.financial_recurrence_rules for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.financial_recurrence_rules for delete to authenticated using ((select auth.uid())=user_id);
create index financial_recurrence_rules_owner_idx on public.financial_recurrence_rules(user_id,created_at desc);
create trigger touch before update on public.financial_recurrence_rules for each row execute function private.touch_row();

create table public.transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 type text not null check(type in ('income','expense','transfer')), description text not null check(length(description) between 1 and 300), amount_minor bigint not null check(amount_minor between 1 and 9000000000000), account_id uuid not null, destination_account_id uuid, category_id uuid, occurred_on date not null, status text not null default 'confirmed' check(status in ('planned','confirmed')), notes text not null default '', recurrence_rule_id uuid, foreign key(account_id,user_id) references public.financial_accounts(id,user_id), foreign key(destination_account_id,user_id) references public.financial_accounts(id,user_id), foreign key(category_id,user_id) references public.financial_categories(id,user_id), foreign key(recurrence_rule_id,user_id) references public.financial_recurrence_rules(id,user_id), check((type='transfer' and destination_account_id is not null and destination_account_id<>account_id and category_id is null) or (type<>'transfer' and destination_account_id is null)), unique(user_id,recurrence_rule_id,occurred_on), unique(id,user_id)
);
alter table public.transactions enable row level security;
revoke all on public.transactions from anon;
grant select,insert,update,delete on public.transactions to authenticated;
create policy owner_select on public.transactions for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.transactions for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.transactions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.transactions for delete to authenticated using ((select auth.uid())=user_id);
create index transactions_owner_idx on public.transactions(user_id,created_at desc);
create trigger touch before update on public.transactions for each row execute function private.touch_row();

create table public.goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 title text not null check(length(title) between 1 and 300), description text not null default '', category text not null default 'Pessoal', target_value numeric not null check(target_value>0 and target_value<=1e12), current_value numeric not null default 0 check(current_value>=0 and current_value<=1e12), start_date date not null, target_date date, status text not null default 'active' check(status in ('active','completed','paused')), color text not null default '#2563eb', unique(id,user_id)
);
alter table public.goals enable row level security;
revoke all on public.goals from anon;
grant select,insert,update,delete on public.goals to authenticated;
create policy owner_select on public.goals for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.goals for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.goals for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.goals for delete to authenticated using ((select auth.uid())=user_id);
create index goals_owner_idx on public.goals(user_id,created_at desc);
create trigger touch before update on public.goals for each row execute function private.touch_row();

create table public.goal_updates (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 goal_id uuid not null, change_value numeric not null, resulting_value numeric not null, foreign key(goal_id,user_id) references public.goals(id,user_id) on delete cascade, unique(id,user_id)
);
alter table public.goal_updates enable row level security;
revoke all on public.goal_updates from anon;
grant select,insert,update,delete on public.goal_updates to authenticated;
create policy owner_select on public.goal_updates for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.goal_updates for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.goal_updates for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.goal_updates for delete to authenticated using ((select auth.uid())=user_id);
create index goal_updates_owner_idx on public.goal_updates(user_id,created_at desc);
create trigger touch before update on public.goal_updates for each row execute function private.touch_row();

create table public.notes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 title text not null check(length(title) between 1 and 300), content text not null default '', category text not null default 'Pessoal', tags text[] not null default '{}', favorite boolean not null default false, unique(id,user_id)
);
alter table public.notes enable row level security;
revoke all on public.notes from anon;
grant select,insert,update,delete on public.notes to authenticated;
create policy owner_select on public.notes for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.notes for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.notes for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.notes for delete to authenticated using ((select auth.uid())=user_id);
create index notes_owner_idx on public.notes(user_id,created_at desc);
create trigger touch before update on public.notes for each row execute function private.touch_row();

create table public.vault_configs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 encrypted_data_key jsonb not null, kdf_parameters jsonb not null, encryption_version integer not null check(encryption_version=1), unique(user_id), check(id=user_id), check(kdf_parameters->>'algorithm'='PBKDF2-SHA256' and (kdf_parameters->>'iterations')::integer between 600000 and 2000000), unique(id,user_id)
);
alter table public.vault_configs enable row level security;
revoke all on public.vault_configs from anon;
grant select,insert,update,delete on public.vault_configs to authenticated;
create policy owner_select on public.vault_configs for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.vault_configs for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.vault_configs for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.vault_configs for delete to authenticated using ((select auth.uid())=user_id);
create index vault_configs_owner_idx on public.vault_configs(user_id,created_at desc);
create trigger touch before update on public.vault_configs for each row execute function private.touch_row();

create table public.vault_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 item_type text not null default 'credential' check(item_type='credential'), ciphertext text not null check(length(ciphertext)>20), initialization_vector text not null check(length(initialization_vector)=16), encryption_version integer not null check(encryption_version=1), foreign key(user_id) references public.vault_configs(user_id) on delete restrict, unique(id,user_id)
);
alter table public.vault_items enable row level security;
revoke all on public.vault_items from anon;
grant select,insert,update,delete on public.vault_items to authenticated;
create policy owner_select on public.vault_items for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.vault_items for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.vault_items for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.vault_items for delete to authenticated using ((select auth.uid())=user_id);
create index vault_items_owner_idx on public.vault_items(user_id,created_at desc);
create trigger touch before update on public.vault_items for each row execute function private.touch_row();

create table public.attachments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 entity_type text not null check(entity_type in ('notes','transactions','vault_items')), entity_id uuid not null, storage_path text not null unique, metadata jsonb not null default '{}', is_encrypted boolean not null default false, check(entity_type<>'vault_items' or is_encrypted), check(split_part(storage_path,'/',1)=user_id::text), unique(id,user_id)
);
alter table public.attachments enable row level security;
revoke all on public.attachments from anon;
grant select,insert,update,delete on public.attachments to authenticated;
create policy owner_select on public.attachments for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.attachments for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.attachments for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.attachments for delete to authenticated using ((select auth.uid())=user_id);
create index attachments_owner_idx on public.attachments(user_id,created_at desc);
create trigger touch before update on public.attachments for each row execute function private.touch_row();

create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 type text not null check(type in ('task','finance','goal')), message text not null check(length(message)<=300), scheduled_at timestamptz not null, read_at timestamptz, idempotency_key text not null, unique(user_id,idempotency_key), unique(id,user_id)
);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
grant select,insert,update,delete on public.notifications to authenticated;
create policy owner_select on public.notifications for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.notifications for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.notifications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.notifications for delete to authenticated using ((select auth.uid())=user_id);
create index notifications_owner_idx on public.notifications(user_id,created_at desc);
create trigger touch before update on public.notifications for each row execute function private.touch_row();

create index task_schedule_idx on public.tasks(user_id,scheduled_on);
create index occurrence_task_idx on public.task_occurrences(user_id,task_id,occurrence_date);
create index transaction_date_idx on public.transactions(user_id,occurred_on desc);
create index transaction_account_idx on public.transactions(user_id,account_id);
create index transaction_destination_idx on public.transactions(user_id,destination_account_id);
create index transaction_category_idx on public.transactions(user_id,category_id);
create index recurrence_account_idx on public.financial_recurrence_rules(user_id,account_id);
create index recurrence_category_idx on public.financial_recurrence_rules(user_id,category_id);
create index goal_updates_goal_idx on public.goal_updates(user_id,goal_id);
create index attachments_entity_idx on public.attachments(user_id,entity_type,entity_id);
create index notifications_due_idx on public.notifications(user_id,scheduled_at) where read_at is null;
create function private.check_transaction() returns trigger language plpgsql set search_path='' as $$
begin
 if new.category_id is not null and not exists(select 1 from public.financial_categories c where c.id=new.category_id and c.user_id=new.user_id and c.type=new.type) then raise exception 'Category type mismatch'; end if;
 return new;
end $$;
create trigger validate_category before insert or update on public.transactions for each row execute function private.check_transaction();
create trigger validate_category before insert or update on public.financial_recurrence_rules for each row execute function private.check_transaction();
create function private.goal_history() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into public.goal_updates(user_id,goal_id,change_value,resulting_value) values(new.user_id,new.id,new.current_value,new.current_value);
 elsif new.current_value is distinct from old.current_value then
  insert into public.goal_updates(user_id,goal_id,change_value,resulting_value) values(new.user_id,new.id,new.current_value-old.current_value,new.current_value);
 end if;
 return new;
end $$;
create trigger goal_history after insert or update on public.goals for each row execute function private.goal_history();
create function private.check_attachment() returns trigger language plpgsql set search_path='' as $$
declare found boolean;
begin
 if new.entity_type not in ('notes','transactions','vault_items') then raise exception 'Invalid entity'; end if;
 execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',new.entity_type) into found using new.entity_id,new.user_id;
 if not found then raise exception 'Invalid attachment reference'; end if;
 return new;
end $$;
create trigger attachment_reference before insert or update on public.attachments for each row execute function private.check_attachment();
-- Restores only missing records. A failed constraint rolls the entire transaction back.
create function public.restore_backup(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t text; item jsonb; columns text; inserted integer:=0; skipped integer:=0; n integer; new_goals uuid[]:='{}'; already_exists boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(payload)<>'object' then raise exception 'Invalid payload'; end if;
 perform private.check_vault_backup(payload);
 for t in select jsonb_object_keys(payload) loop
  if t<>all(array['settings','tasks','task_occurrences','financial_accounts','financial_categories','financial_recurrence_rules','transactions','goals','goal_updates','notes','vault_configs','vault_items','attachments','notifications']) then raise exception 'Unknown table'; end if;
 end loop;
 foreach t in array array['settings','tasks','task_occurrences','financial_accounts','financial_categories','financial_recurrence_rules','transactions','goals','goal_updates','notes','vault_configs','vault_items','attachments','notifications'] loop
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
-- Storage objects are private and namespaced by owner. No public URL is used.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('personal','personal',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp','text/plain','application/octet-stream']) on conflict(id) do nothing;
create policy personal_read on storage.objects for select to authenticated using(bucket_id='personal' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy personal_insert on storage.objects for insert to authenticated with check(bucket_id='personal' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy personal_delete on storage.objects for delete to authenticated using(bucket_id='personal' and (storage.foldername(name))[1]=(select auth.uid())::text);
