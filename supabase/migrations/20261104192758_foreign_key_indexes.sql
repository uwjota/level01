-- Match composite foreign-key column order for referential operations.
drop index public.occurrence_task_idx;
create index occurrence_task_idx on public.task_occurrences(task_id,user_id,occurrence_date);
drop index public.transaction_account_idx;
create index transaction_account_idx on public.transactions(account_id,user_id);
drop index public.transaction_destination_idx;
create index transaction_destination_idx on public.transactions(destination_account_id,user_id);
drop index public.transaction_category_idx;
create index transaction_category_idx on public.transactions(category_id,user_id);
create index transaction_recurrence_idx on public.transactions(recurrence_rule_id,user_id);
drop index public.recurrence_account_idx;
create index recurrence_account_idx on public.financial_recurrence_rules(account_id,user_id);
drop index public.recurrence_category_idx;
create index recurrence_category_idx on public.financial_recurrence_rules(category_id,user_id);
drop index public.goal_updates_goal_idx;
create index goal_updates_goal_idx on public.goal_updates(goal_id,user_id);
