begin;
set local role service_role;
insert into public.profiles(firebase_uid,email,display_name,username) values
 ('builder-test-a','builder-a@example.com','Builder A','builder-test-a'),
 ('builder-test-b','builder-b@example.com','Builder B','builder-test-b'),
 ('builder-test-c','builder-c@example.com','Builder C','builder-test-c');
do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  c uuid := '33333333-3333-4333-8333-333333333333';
  step_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  step_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  op_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  created jsonb := '{"scope":"workspace","selectionIds":[],"effort":"low","continuation":[]}';
  limits jsonb := '{"userCap":1000000,"runCap":1000000,"dayCap":1200000,"monthCap":25000000,"inputCost":10000}';
  value jsonb;
  total bigint;
begin
  perform public.builder_transition('builder-test-a',a,'lease-a','create',created);
  perform public.builder_transition('builder-test-b',b,'lease-b','create',created);
  perform public.builder_transition('builder-test-c',c,'lease-c','create',created);
  -- Create retries are idempotent; another actor/lease never takes ownership.
  perform public.builder_transition('builder-test-a',a,'lease-a','create',created);
  begin
    perform public.builder_transition('builder-test-b',a,'lease-a','get');
    raise exception 'TEST: crossed actor boundary';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  begin
    perform public.builder_transition('builder-test-a',a,'wrong-lease','get');
    raise exception 'TEST: crossed lease boundary';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  value := public.builder_transition('builder-test-a',a,'lease-a','reserve',limits||jsonb_build_object('stepId',step_a));
  if value->'step'->>'output_limit' <> '16000' then raise exception 'Output reservation was not bounded'; end if;
  perform public.builder_transition('builder-test-a',a,'lease-a','update','{"effort":"max"}');
  if (select effort from public.builder_steps where id=step_a) <> 'low' then raise exception 'In-flight effort changed'; end if;
  value := public.builder_transition('builder-test-b',b,'lease-b','reserve',limits||jsonb_build_object('stepId',step_b));
  if value->'step'->>'output_limit' <> '7600' then raise exception 'Global reservations did not reduce available output'; end if;
  select spent_micros+reserved_micros into total from public.builder_budget_buckets where key='day:'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
  if total <> 1200000 then raise exception 'Concurrent reservations exceeded the cap'; end if;
  begin
    perform public.builder_transition('builder-test-c',c,'lease-c','reserve',limits||jsonb_build_object('stepId',gen_random_uuid()));
    raise exception 'TEST: exceeded global concurrency';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform public.builder_transition('builder-test-a',a,'lease-a','settle',jsonb_build_object('stepId',step_a,'actualMicros',100000,'state','awaiting_apply','operations',jsonb_build_array(jsonb_build_object('id',op_id,'capability','canvas.select','args','[]'::jsonb))));
  -- Duplicate provider completion cannot charge again or issue more operations.
  perform public.builder_transition('builder-test-a',a,'lease-a','settle',jsonb_build_object('stepId',step_a,'actualMicros',900000,'state','completed'));
  if (select spent_micros from public.builder_runs where id=a) <> 100000 then raise exception 'Provider settlement was duplicated'; end if;
  perform public.builder_transition('builder-test-a',a,'lease-a','start',jsonb_build_object('operationId',op_id));
  begin
    perform public.builder_transition('builder-test-a',a,'lease-a','start',jsonb_build_object('operationId',op_id));
    raise exception 'TEST: replayed an uncertain operation';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform public.builder_transition('builder-test-a',a,'lease-a','update','{"state":"stopped"}');
  value := public.builder_transition('builder-test-a',a,'lease-a','ack',jsonb_build_object('operationId',op_id,'result','{"applied":true}'::jsonb));
  if value->>'state'<>'stopped' then raise exception 'A late acknowledgement restarted a stopped run'; end if;
  begin
    perform public.builder_transition('builder-test-a',a,'lease-a','reserve',limits||jsonb_build_object('stepId',gen_random_uuid()));
    raise exception 'TEST: stopped run called provider';
  exception when raise_exception then if sqlerrm like 'TEST:%' then raise; end if; end;
  perform public.builder_transition('builder-test-b',b,'lease-b','settle',jsonb_build_object('stepId',step_b,'state','failed'));
  if (select spent_micros from public.builder_runs where id=b)<>390000 then raise exception 'Uncertain provider usage was refunded'; end if;
  value := public.builder_transition('builder-test-c',c,'lease-c','reserve',limits||jsonb_build_object('stepId',gen_random_uuid(),'userCap',1000));
  if value->>'state'<>'budget_exhausted' then raise exception 'Insufficient budget did not stop the run'; end if;
end $$;
-- The flag is accepted only through the service-role transition. Unmetered
-- accounting must never reduce public allowances, even when every cap is empty.
do $$
declare
  owner_run uuid := gen_random_uuid();
  step_id uuid := gen_random_uuid();
  result jsonb;
  public_before jsonb;
begin
  select jsonb_agg(to_jsonb(b) order by key) into public_before from public.builder_budget_buckets b;
  perform public.builder_transition('builder-test-a',owner_run,'owner-lease','create','{"scope":"workspace","selectionIds":[],"effort":"high","continuation":[]}');
  result := public.builder_transition('builder-test-a',owner_run,'owner-lease','reserve',jsonb_build_object('unmetered',true,'userCap',0,'runCap',0,'dayCap',0,'monthCap',0,'inputCost',900000,'stepId',step_id));
  if result->'step'->>'output_limit' <> '16000' then raise exception 'Owner allowance was not exempted'; end if;
  perform public.builder_transition('builder-test-a',owner_run,'owner-lease','settle',jsonb_build_object('stepId',step_id,'actualMicros',2000000,'state','completed'));
  if (select spent_micros from public.builder_runs where id=owner_run)<>2000000 then raise exception 'Owner usage was not recorded'; end if;
  if (select jsonb_agg(to_jsonb(b) order by key) from public.builder_budget_buckets b where key not like 'unmetered:%') is distinct from public_before then raise exception 'Owner usage changed the public budget'; end if;
  if (select spent_micros from public.builder_budget_buckets where key='unmetered:user:builder-test-a')<>2000000 then raise exception 'Owner ledger is missing'; end if;
end $$;
rollback;
