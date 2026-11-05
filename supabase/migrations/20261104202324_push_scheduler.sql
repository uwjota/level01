-- Hosted-only extensions are not available in the embedded PostgreSQL test runner.
do $$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;
 end if;
end $$;
create function private.run_reminder_tick() returns bigint language plpgsql security invoker set search_path='' as $$
declare config jsonb; request_id bigint;
begin
 select decrypted_secret::jsonb into config from vault.decrypted_secrets where name='level01_push_runtime';
 if not coalesce((config->>'enabled')::boolean,false) then return null; end if;
 select net.http_post(
  url := 'https://gbmagplhoavukopvvssw.supabase.co/functions/v1/level01-reminders',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (config->>'cronSecret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 ) into request_id;
 return request_id;
end $$;
revoke all on function private.run_reminder_tick() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('level01-reminders','* * * * *','select private.run_reminder_tick();');
 end if;
end $$;
