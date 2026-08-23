create table if not exists public.document_mutation_leases (
  room_id text primary key,
  lease_token uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.document_mutation_leases enable row level security;
revoke all on public.document_mutation_leases from public, anon, authenticated;
grant all on public.document_mutation_leases to service_role;

create or replace function public.acquire_kumo_document_lease(
  p_room_id text,
  p_lease_token uuid,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_token uuid;
begin
  insert into public.document_mutation_leases as lease (room_id, lease_token, expires_at, updated_at)
  values (p_room_id, p_lease_token, now() + make_interval(secs => greatest(10, least(p_ttl_seconds, 300))), now())
  on conflict (room_id) do update
  set lease_token = excluded.lease_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  where lease.expires_at <= now()
  returning lease_token into claimed_token;

  return claimed_token = p_lease_token;
end;
$$;

create or replace function public.release_kumo_document_lease(
  p_room_id text,
  p_lease_token uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.document_mutation_leases
  where room_id = p_room_id and lease_token = p_lease_token;
$$;

create or replace function public.complete_kumo_branch_merge(
  p_board_id text,
  p_branch_id uuid,
  p_actor_id text,
  p_checkpoint_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.document_branches
  set status = 'merged', merged_at = now(), updated_at = now()
  where id = p_branch_id and board_id = p_board_id and status = 'open';

  if not found then
    raise exception 'The branch is no longer open';
  end if;

  update public.boards set updated_at = now() where id = p_board_id and deleted_at is null;
  if not found then
    raise exception 'Board not found';
  end if;

  insert into public.audit_events (board_id, actor_id, event_type, payload)
  values (
    p_board_id,
    p_actor_id,
    'branch.merged',
    jsonb_build_object('branchId', p_branch_id, 'checkpointId', p_checkpoint_id)
  );
end;
$$;

create or replace function public.complete_kumo_version_restore(
  p_board_id text,
  p_actor_id text,
  p_version_id uuid,
  p_before_restore_id uuid,
  p_room_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.boards set updated_at = now() where id = p_board_id and deleted_at is null;
  if not found then
    raise exception 'Board not found';
  end if;

  insert into public.audit_events (board_id, actor_id, event_type, payload)
  values (
    p_board_id,
    p_actor_id,
    'version.restored',
    jsonb_build_object(
      'versionId', p_version_id,
      'beforeRestoreId', p_before_restore_id,
      'roomId', p_room_id
    )
  );
end;
$$;

revoke all on function public.complete_kumo_branch_merge(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_kumo_version_restore(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.acquire_kumo_document_lease(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_kumo_document_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.complete_kumo_branch_merge(text, uuid, text, uuid) to service_role;
grant execute on function public.complete_kumo_version_restore(text, text, uuid, uuid, text) to service_role;
grant execute on function public.acquire_kumo_document_lease(text, uuid, integer) to service_role;
grant execute on function public.release_kumo_document_lease(text, uuid) to service_role;
