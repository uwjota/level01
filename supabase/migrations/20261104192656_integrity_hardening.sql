-- Conflict updates preserve occurrence identity, including concurrent first writes.
create function public.save_task_occurrence(payload jsonb) returns public.task_occurrences language plpgsql security invoker set search_path='' as $$
declare result public.task_occurrences;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.task_occurrences(user_id,task_id,occurrence_date,status,completed_at,override_data)
 values(auth.uid(),(payload->>'task_id')::uuid,(payload->>'occurrence_date')::date,payload->>'status',(payload->>'completed_at')::timestamptz,coalesce(payload->'override_data','{}'))
 on conflict(user_id,task_id,occurrence_date) do update set status=excluded.status,completed_at=excluded.completed_at,override_data=excluded.override_data
 returning * into result;
 return result;
end $$;
revoke all on function public.save_task_occurrence(jsonb) from public,anon;
grant execute on function public.save_task_occurrence(jsonb) to authenticated;
-- Never silently orphan private files when deleting their parent.
create function private.prevent_orphan_files() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.attachments where entity_type=TG_TABLE_NAME and entity_id=old.id and user_id=old.user_id) then raise exception 'Remove attachments first'; end if;
 return old;
end $$;
create trigger protect_attachments before delete on public.notes for each row execute function private.prevent_orphan_files();
create trigger protect_attachments before delete on public.transactions for each row execute function private.prevent_orphan_files();
create trigger protect_attachments before delete on public.vault_items for each row execute function private.prevent_orphan_files();
-- Do not combine envelopes from a backup with a different currently wrapped data key.
create function private.check_vault_backup(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.vault_configs c join jsonb_array_elements(coalesce(payload->'vault_configs','[]')) b on c.user_id=(b->>'user_id')::uuid where c.user_id=auth.uid() and c.encrypted_data_key is distinct from b->'encrypted_data_key') then raise exception 'Vault configuration differs'; end if;
end $$;
grant usage on schema private to authenticated;
grant execute on function private.check_vault_backup(jsonb) to authenticated;
create function private.prevent_category_mismatch() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type<>old.type and (exists(select 1 from public.transactions where category_id=old.id and user_id=old.user_id) or exists(select 1 from public.financial_recurrence_rules where category_id=old.id and user_id=old.user_id)) then raise exception 'Category is already in use'; end if;
 return new;
end $$;
create trigger category_type_guard before update on public.financial_categories for each row execute function private.prevent_category_mismatch();
-- Backups with metadata-only attachments must still reference an existing private object.
create or replace function private.check_attachment() returns trigger language plpgsql set search_path='' as $$
declare found boolean;
begin
 if new.entity_type not in ('notes','transactions','vault_items') then raise exception 'Invalid entity'; end if;
 execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',new.entity_type) into found using new.entity_id,new.user_id;
 if not found then raise exception 'Invalid attachment reference'; end if;
 if not exists(select 1 from storage.objects where bucket_id='personal' and name=new.storage_path) then raise exception 'Missing storage object'; end if;
 return new;
end $$;
create function public.erase_personal_data() returns void language plpgsql security invoker set search_path='' as $$
declare t text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 foreach t in array array['attachments','vault_items','vault_configs','notifications','task_occurrences','tasks','transactions','financial_recurrence_rules','financial_categories','financial_accounts','goal_updates','goals','notes','settings'] loop
  execute format('delete from public.%I where user_id=$1',t) using auth.uid();
 end loop;
end $$;
revoke all on function public.erase_personal_data() from public,anon;
grant execute on function public.erase_personal_data() to authenticated;
create function private.valid_recurrence(rule jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare weekday text;
begin
 if rule is null then return true; end if;
 if jsonb_typeof(rule)<>'object' or not(rule ?& array['frequency','interval']) then return false; end if;
 if rule->>'frequency' not in ('daily','weekly','monthly','yearly') or rule->>'interval' !~ '^[1-9][0-9]{0,2}$' then return false; end if;
 if (rule->>'interval')::int>365 then return false; end if;
 if rule ? 'weekdays' then
  if jsonb_typeof(rule->'weekdays')<>'array' or jsonb_array_length(rule->'weekdays')>7 then return false; end if;
  for weekday in select jsonb_array_elements_text(rule->'weekdays') loop if weekday !~ '^[0-6]$' then return false; end if; end loop;
 end if;
 return true;
end $$;
grant execute on function private.valid_recurrence(jsonb) to authenticated;
alter table public.tasks add constraint task_recurrence_shape check(private.valid_recurrence(recurrence));
alter table public.tasks add constraint task_recurrence_end check(recurrence->>'end_date' is null or (recurrence->>'end_date')::date>=scheduled_on);
alter table public.financial_recurrence_rules add constraint finance_recurrence_shape check(private.valid_recurrence(recurrence));
alter table public.financial_recurrence_rules add constraint finance_recurrence_end check(recurrence->>'end_date' is null or (recurrence->>'end_date')::date>=start_date);
alter table public.vault_configs add constraint vault_kdf_shape check(kdf_parameters ?& array['algorithm','iterations','salt']);
alter table public.vault_configs add constraint wrapped_key_shape check(encrypted_data_key ?& array['ciphertext','initialization_vector','encryption_version'] and length(encrypted_data_key->>'initialization_vector')=16 and (encrypted_data_key->>'encryption_version')::int=1);
