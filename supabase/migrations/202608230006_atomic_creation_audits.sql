create or replace function public.create_kumo_checkpoint(
  p_board_id text,
  p_room_id text,
  p_document jsonb,
  p_checksum text,
  p_name text,
  p_description text,
  p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.document_snapshots%rowtype;
begin
  insert into public.document_snapshots (
    board_id,
    liveblocks_room_id,
    document,
    checksum,
    name,
    description,
    created_by,
    kind
  )
  values (
    p_board_id,
    p_room_id,
    p_document,
    p_checksum,
    p_name,
    p_description,
    p_actor_id,
    'checkpoint'
  )
  returning * into created;

  insert into public.audit_events (board_id, actor_id, event_type, payload)
  values (
    p_board_id,
    p_actor_id,
    'version.checkpoint_created',
    jsonb_build_object('versionId', created.id, 'name', created.name, 'roomId', p_room_id)
  );

  return jsonb_build_object(
    'id', created.id,
    'board_id', created.board_id,
    'name', created.name,
    'description', created.description,
    'created_by', created.created_by,
    'kind', created.kind,
    'created_at', created.created_at,
    'checksum', created.checksum
  );
end;
$$;

create or replace function public.create_kumo_branch_record(
  p_id uuid,
  p_board_id text,
  p_name text,
  p_room_id text,
  p_actor_id text,
  p_base_checksum text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.document_branches%rowtype;
begin
  insert into public.document_branches (
    id,
    board_id,
    name,
    room_id,
    created_by,
    status,
    base_checksum
  )
  values (
    p_id,
    p_board_id,
    p_name,
    p_room_id,
    p_actor_id,
    'open',
    p_base_checksum
  )
  returning * into created;

  insert into public.audit_events (board_id, actor_id, event_type, payload)
  values (
    p_board_id,
    p_actor_id,
    'branch.created',
    jsonb_build_object('branchId', created.id, 'name', created.name)
  );

  return to_jsonb(created);
end;
$$;

revoke all on function public.create_kumo_checkpoint(text, text, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_kumo_branch_record(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_kumo_checkpoint(text, text, jsonb, text, text, text, text) to service_role;
grant execute on function public.create_kumo_branch_record(uuid, text, text, text, text, text) to service_role;
