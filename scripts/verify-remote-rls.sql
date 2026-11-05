-- Administrative verification. All temporary records are rolled back.
begin;
select set_config('central.test_owner',(select id::text from auth.users order by created_at limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('central.test_owner'),true);
set local role authenticated;
do $$
declare owner_id uuid:=auth.uid(); task_id uuid; account_a uuid; account_b uuid; occurrence_a uuid; occurrence_b uuid; test_goal uuid; history_count int; affected int; rejected boolean:=false;
begin
 if owner_id is null then raise exception 'Provision an account before the integration test'; end if;
 insert into public.tasks(user_id,title,scheduled_on,recurrence) values(owner_id,'Temporary integration test',current_date,'{"frequency":"daily","interval":1}') returning id into task_id;
 select id into occurrence_a from public.save_task_occurrence(jsonb_build_object('task_id',task_id,'occurrence_date',current_date,'status','completed'));
 select id into occurrence_b from public.save_task_occurrence(jsonb_build_object('task_id',task_id,'occurrence_date',current_date,'status','pending'));
 if occurrence_a<>occurrence_b then raise exception 'Occurrence identity changed'; end if;
 insert into public.financial_accounts(user_id,name,type,opening_balance_minor) values(owner_id,'Temporary A','cash',10000) returning id into account_a;
 insert into public.financial_accounts(user_id,name,type) values(owner_id,'Temporary B','cash') returning id into account_b;
 insert into public.transactions(user_id,account_id,destination_account_id,type,description,amount_minor,occurred_on,status) values(owner_id,account_a,account_b,'transfer','Temporary transfer',2500,current_date,'confirmed');
 begin
  insert into public.transactions(user_id,account_id,destination_account_id,type,description,amount_minor,occurred_on,status) values(owner_id,account_a,account_a,'transfer','Invalid transfer',100,current_date,'confirmed');
 exception when check_violation then rejected:=true;
 end;
 if not rejected then raise exception 'Invalid transfer accepted'; end if;
 insert into public.goals(user_id,title,target_value,start_date) values(owner_id,'Temporary goal',10,current_date) returning id into test_goal;
 update public.goals set current_value=3 where id=test_goal;
 select count(*) into history_count from public.goal_updates g where g.goal_id=test_goal;
 if history_count<>2 then raise exception 'Goal history failure'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.tasks where id=task_id) then raise exception 'Cross-owner read'; end if;
 update public.tasks set title='Forbidden' where id=task_id;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Cross-owner update'; end if;
 delete from public.tasks where id=task_id;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Cross-owner delete'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 if not exists(select 1 from public.tasks where id=task_id) then raise exception 'Owner lost access'; end if;
end $$;
set local role anon;
do $$
declare rejected boolean:=false;
begin
 begin perform 1 from public.tasks limit 1; exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Anonymous table permission exposed'; end if;
end $$;
rollback;
select 'Remote RLS, CRUD, occurrence identity, transfer validation, goal history and rollback passed' as verification;
