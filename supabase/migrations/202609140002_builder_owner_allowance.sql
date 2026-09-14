-- Exempt the server-verified owner from monetary allowances, while retaining
-- leases, concurrency limits, step bounds, and the complete usage ledger.
create or replace function public.builder_transition(p_actor text, p_run uuid, p_lease text, p_action text, p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.builder_runs;
  s public.builder_steps;
  o public.builder_operations;
  bucket public.builder_budget_buckets;
  keys text[];
  limits bigint[];
  available bigint;
  input_cost bigint;
  output_limit integer;
  reservation bigint;
  actual bigint;
  idx integer;
  op jsonb;
  pending jsonb;
  unmetered boolean := coalesce((p_input->>'unmetered')::boolean, false);
begin
  perform pg_advisory_xact_lock(184916, 902);
  -- Expired executors cannot keep a user/board busy forever. An uncertain paid
  -- request retains its reservation; expiry never frees possibly-spent money.
  update public.builder_runs set state = 'interrupted', message = 'Executor disconnected. Review applied work before continuing.'
    where lease_until < now() and state in ('preparing', 'awaiting_model', 'awaiting_apply', 'checking');
  update public.builder_steps set status='uncertain' where status='reserved' and created_at<now()-interval '5 minutes';
  select * into r from public.builder_runs where id = p_run;
  if p_action = 'create' and r.id is null then
    if exists(select 1 from public.builder_runs where user_id = p_actor and state in ('preparing','awaiting_model','awaiting_apply','checking'))
      or (nullif(p_input->>'boardId','') is not null and exists(select 1 from public.builder_runs where board_id = p_input->>'boardId' and state in ('preparing','awaiting_model','awaiting_apply','checking')))
      then raise exception 'A builder run is already active.'; end if;
    insert into public.builder_runs(id,user_id,board_id,scope,selection_ids,room_id,lease_hash,effort,continuation)
      values(p_run,p_actor,nullif(p_input->>'boardId',''),p_input->>'scope',p_input->'selectionIds',p_input->>'roomId',p_lease,p_input->>'effort',p_input->'continuation') returning * into r;
  end if;
  if r.id is null or r.user_id <> p_actor or r.lease_hash <> p_lease then raise exception 'Builder executor is unavailable.'; end if;
  if p_action in ('reserve','start','navigate') and r.state in ('completed','stopped','failed','budget_exhausted','interrupted') then raise exception 'Builder run has ended.'; end if;
  if p_action = 'update' then
    update public.builder_runs set effort = coalesce(p_input->>'effort',effort),
      state = case when p_input->>'state' = 'stopped' then 'stopped' else state end,
      lease_until = now() + interval '5 minutes', updated_at = now() where id=p_run returning * into r;
  elsif p_action = 'resume' then
    if r.steps >= 6 or r.state in ('completed','budget_exhausted','failed') then raise exception 'Start a new run for the remaining task.'; end if;
    if exists(select 1 from public.builder_steps where run_id=p_run and status in ('reserved','uncertain'))
      or exists(select 1 from public.builder_operations where run_id=p_run and status='started') then raise exception 'Review uncertain operations before starting a new run. They cannot be replayed.'; end if;
    if exists(select 1 from public.builder_runs where id<>p_run and (user_id=p_actor or board_id=r.board_id) and state in ('preparing','awaiting_model','awaiting_apply','checking')) then raise exception 'Another builder run is active.'; end if;
    update public.builder_runs set state=case when exists(select 1 from public.builder_operations where run_id=p_run and status='issued') then 'awaiting_apply' else 'preparing' end,
      lease_until=now()+interval '5 minutes', updated_at=now() where id=p_run returning * into r;
  elsif p_action = 'navigate' then
    if r.scope <> 'workspace' then raise exception 'Workspace scope is required to switch boards.'; end if;
    if exists(select 1 from public.builder_runs where id<>p_run and board_id=p_input->>'boardId' and state in ('preparing','awaiting_model','awaiting_apply','checking')) then raise exception 'A builder run is already active on that board.'; end if;
    update public.builder_runs set board_id=nullif(p_input->>'boardId',''), room_id=p_input->>'roomId', updated_at=now() where id=p_run returning * into r;
  elsif p_action = 'reserve' then
    if r.state <> 'preparing' or r.steps >= 6 then raise exception 'No more model steps are available.'; end if;
    if (select count(*) from public.builder_steps where status='reserved') >= 2 then raise exception 'Builder is busy. Please try again shortly.'; end if;
    keys := array['user:'||p_actor,'run:'||p_run::text,'day:'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),'month:'||to_char(now() at time zone 'UTC','YYYY-MM')];
    -- Only the trusted API service role can set this flag, after verifying identity.
    -- Separate buckets keep owner usage from consuming the public allowance.
    if unmetered then
      for idx in 1..4 loop keys[idx] := 'unmetered:' || keys[idx]; end loop;
    end if;
    limits := array[(p_input->>'userCap')::bigint,(p_input->>'runCap')::bigint,(p_input->>'dayCap')::bigint,(p_input->>'monthCap')::bigint];
    available := limits[1];
    for idx in 1..4 loop
      if not unmetered and (limits[idx] is null or limits[idx] <= 0) then raise exception 'A positive builder budget is required.'; end if;
      insert into public.builder_budget_buckets(key) values(keys[idx]) on conflict do nothing;
      select * into bucket from public.builder_budget_buckets where key=keys[idx];
      available := least(available,limits[idx]-bucket.spent_micros-bucket.reserved_micros);
    end loop;
    input_cost := (p_input->>'inputCost')::bigint;
    if input_cost is null or input_cost < 0 then raise exception 'Invalid input reservation.'; end if;
    output_limit := case when unmetered then 16000 else least(16000, (available-input_cost)/50) end;
    if output_limit < 1024 then
      update public.builder_runs set state='budget_exhausted',message='The available allowance cannot cover another AI step.' where id=p_run returning * into r;
    else
      reservation := input_cost + output_limit*50;
      insert into public.builder_steps(id,run_id,effort,output_limit,reserved_micros,bucket_keys)
        values((p_input->>'stepId')::uuid,p_run,r.effort,output_limit,reservation,keys) returning * into s;
      update public.builder_budget_buckets set reserved_micros=reserved_micros+reservation where key=any(keys);
      update public.builder_runs set state='awaiting_model',steps=steps+1,lease_until=now()+interval '5 minutes',updated_at=now() where id=p_run returning * into r;
    end if;
  elsif p_action = 'settle' then
    select * into s from public.builder_steps where id=(p_input->>'stepId')::uuid and run_id=p_run;
    if s.id is null then raise exception 'Builder step not found.'; end if;
    if s.status='reserved' then
      -- Missing usage is not treated as a free request, including timeouts.
      actual := coalesce((p_input->>'actualMicros')::bigint,s.reserved_micros);
      if actual<0 then raise exception 'Invalid provider usage.'; end if;
      update public.builder_steps set status=case when p_input->>'actualMicros' is null then 'uncertain' else 'settled' end,
        actual_micros=actual,usage=p_input->'usage',provider_response_id=coalesce(p_input->>'responseId',provider_response_id) where id=s.id;
      update public.builder_budget_buckets set reserved_micros=reserved_micros-s.reserved_micros,spent_micros=spent_micros+actual where key=any(s.bucket_keys);
      if r.state='awaiting_model' then
        for op in select value from jsonb_array_elements(coalesce(p_input->'operations','[]')) loop
          insert into public.builder_operations(id,run_id,step_id,operation,position) values((op->>'id')::uuid,p_run,s.id,op,coalesce((op->>'position')::integer,0));
        end loop;
      end if;
      update public.builder_runs set spent_micros=spent_micros+actual,
        state=case when state<>'awaiting_model' then state else p_input->>'state' end,
        continuation=coalesce(p_input->'continuation',continuation),message=coalesce(p_input->>'message',''),updated_at=now()
        where id=p_run returning * into r;
    end if;
  elsif p_action in ('start','ack') then
    select * into o from public.builder_operations where id=(p_input->>'operationId')::uuid and run_id=p_run;
    if o.id is null then raise exception 'Operation was not issued to this executor.'; end if;
    if p_action='start' then
      if exists(select 1 from public.builder_operations where step_id=o.step_id and position<o.position and status<>'finished') then raise exception 'Apply operations in their issued order.'; end if;
      if o.status='started' then raise exception 'Operation outcome is uncertain. It will not be replayed.'; end if;
      if o.status='issued' then update public.builder_operations set status='started' where id=o.id returning * into o; end if;
    elsif o.status='started' then
      update public.builder_operations set status='finished',result=p_input->'result' where id=o.id returning * into o;
      if not exists(select 1 from public.builder_operations where run_id=p_run and status<>'finished') then
        update public.builder_runs set state=case when state<>'awaiting_apply' then state when steps>=6 then 'completed' else 'preparing' end,updated_at=now() where id=p_run returning * into r;
      end if;
    elsif o.status<>'finished' then raise exception 'Operation has not started.';
    end if;
  end if;
  select coalesce(jsonb_agg(operation order by created_at,position),'[]') into pending from public.builder_operations where run_id=p_run and status<>'finished';
  return to_jsonb(r) || jsonb_build_object('pending',pending,'step',case when s.id is null then null else to_jsonb(s) end,'operation',case when o.id is null then null else to_jsonb(o) end);
end;
$$;
revoke all on function public.builder_transition(text,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.builder_transition(text,uuid,text,text,jsonb) to service_role;

insert into public.kumo_schema_releases(version) values ('202609140002') on conflict (version) do nothing;
