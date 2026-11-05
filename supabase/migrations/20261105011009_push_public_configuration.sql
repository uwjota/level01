-- Only the non-secret VAPID public key is readable by authenticated clients.
create table public.push_public_config (
 singleton boolean primary key default true check(singleton),
 public_key text not null,
 configured boolean not null default false
);
alter table public.push_public_config enable row level security;
revoke all on public.push_public_config from public,anon,authenticated;
grant select on public.push_public_config to authenticated;
grant all on public.push_public_config to service_role;
create policy authenticated_read on public.push_public_config for select to authenticated using ((select private.mfa_allowed()));
create or replace function public.get_push_config() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select jsonb_build_object('publicKey',public_key,'configured',configured) into result from public.push_public_config where singleton;
 return coalesce(result,'{"configured":false}'::jsonb);
end $$;
revoke all on function public.get_push_config() from public,anon;
grant execute on function public.get_push_config() to authenticated;
do $$ declare config jsonb; begin
 if to_regclass('vault.decrypted_secrets') is not null then
  select decrypted_secret::jsonb into config from vault.decrypted_secrets where name='level01_push_runtime';
  if config is not null then insert into public.push_public_config(singleton,public_key,configured) values(true,config->>'publicKey',coalesce((config->>'enabled')::boolean,false)); end if;
 end if;
end $$;
