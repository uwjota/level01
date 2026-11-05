alter table public.settings add column weather_location jsonb;
alter table public.settings add constraint weather_location_shape check(weather_location is null or (jsonb_typeof(weather_location)='object' and weather_location ?& array['label','latitude','longitude','source'] and length(weather_location->>'label') between 1 and 200 and (weather_location->>'latitude')::numeric between -90 and 90 and (weather_location->>'longitude')::numeric between -180 and 180 and weather_location->>'source' in ('device','manual')));
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<4096 and endpoint ~ '^https://'),
 p256dh text not null check(length(p256dh) between 80 and 100), auth text not null check(length(auth) between 20 and 30),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,endpoint), unique(id,user_id)
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select,insert,update,delete on public.push_subscriptions to authenticated,service_role;
create policy owner_select on public.push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy owner_insert on public.push_subscriptions for insert to authenticated with check ((select auth.uid())=user_id);
create policy owner_update on public.push_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy owner_delete on public.push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);
create trigger touch before update on public.push_subscriptions for each row execute function private.touch_row();
create table public.push_deliveries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 subscription_id uuid not null, notification_id uuid not null,
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(), lease_until timestamptz,
 created_at timestamptz not null default now(), sent_at timestamptz, error_code text,
 foreign key(subscription_id,user_id) references public.push_subscriptions(id,user_id) on delete cascade,
 foreign key(notification_id,user_id) references public.notifications(id,user_id) on delete cascade,
 unique(subscription_id,notification_id)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon,authenticated;
grant all on public.push_deliveries to service_role;
create index push_deliveries_owner_idx on public.push_deliveries(user_id);
create index push_deliveries_subscription_owner_idx on public.push_deliveries(subscription_id,user_id);
create index push_deliveries_notification_owner_idx on public.push_deliveries(notification_id,user_id);
create index push_deliveries_pending_idx on public.push_deliveries(next_attempt_at) where status='pending';
-- MFA is optional until enrolled; once verified, every data path enforces AAL2.
create function private.mfa_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'));
$$;
revoke all on function private.mfa_allowed() from public,anon;
grant execute on function private.mfa_allowed() to authenticated;
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy require_mfa on public.%I as restrictive for all to authenticated using ((select private.mfa_allowed())) with check ((select private.mfa_allowed()))',t);
 end loop;
end $$;
create policy require_personal_mfa on storage.objects as restrictive for all to authenticated using (bucket_id<>'personal' or (select private.mfa_allowed())) with check (bucket_id<>'personal' or (select private.mfa_allowed()));
-- Runtime secrets stay encrypted in Supabase Vault and are never shipped to the browser.
create function public.get_push_runtime() returns jsonb language plpgsql security definer set search_path='' as $$
declare value jsonb; begin
 select decrypted_secret::jsonb into value from vault.decrypted_secrets where name='level01_push_runtime';
 return value;
end $$;
revoke all on function public.get_push_runtime() from public,anon,authenticated;
grant execute on function public.get_push_runtime() to service_role;
create function public.get_push_config() returns jsonb language plpgsql security definer set search_path='' as $$
declare value jsonb; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select decrypted_secret::jsonb into value from vault.decrypted_secrets where name='level01_push_runtime';
 return jsonb_build_object('publicKey',value->>'publicKey','configured',coalesce((value->>'enabled')::boolean,false));
end $$;
revoke all on function public.get_push_config() from public,anon;
grant execute on function public.get_push_config() to authenticated;
create function public.reminder_user_ids() returns setof uuid language sql security invoker set search_path='' as $$
 select user_id from public.settings union select user_id from public.tasks union select user_id from public.transactions union select user_id from public.goals union select user_id from public.push_subscriptions;
$$;
revoke all on function public.reminder_user_ids() from public,anon,authenticated;
grant execute on function public.reminder_user_ids() to service_role;
create function public.enqueue_push_deliveries() returns void language sql security invoker set search_path='' as $$
 insert into public.push_deliveries(user_id,subscription_id,notification_id)
 select n.user_id,s.id,n.id from public.notifications n join public.push_subscriptions s on s.user_id=n.user_id
 where n.read_at is null and n.created_at>=s.created_at and n.created_at>now()-interval '24 hours' and n.scheduled_at<=now()
 on conflict(subscription_id,notification_id) do nothing;
$$;
revoke all on function public.enqueue_push_deliveries() from public,anon,authenticated;
grant execute on function public.enqueue_push_deliveries() to service_role;
create function public.claim_push_deliveries() returns setof public.push_deliveries language sql security invoker set search_path='' as $$
 update public.push_deliveries set status='failed',error_code='attempts_exhausted' where status='pending' and attempts>=5 and lease_until<now();
 update public.push_deliveries set attempts=attempts+1,lease_until=now()+interval '2 minutes'
 where id in (select id from public.push_deliveries where status='pending' and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by next_attempt_at for update skip locked limit 50)
 returning *;
$$;
revoke all on function public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.claim_push_deliveries() to service_role;
create or replace function public.erase_personal_data() returns void language plpgsql security invoker set search_path='' as $$
declare t text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 foreach t in array array['push_subscriptions','attachments','study_notes','study_collections','vault_items','vault_configs','notifications','task_occurrences','tasks','transactions','financial_recurrence_rules','financial_categories','financial_accounts','goal_updates','goals','notes','settings'] loop
  execute format('delete from public.%I where user_id=$1',t) using auth.uid();
 end loop;
end $$;
revoke all on function public.erase_personal_data() from public,anon;
grant execute on function public.erase_personal_data() to authenticated;
