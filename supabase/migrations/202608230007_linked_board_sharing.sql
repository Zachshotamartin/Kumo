create or replace function public.share_kumo_board_set(
  p_board_ids text[],
  p_actor_id text,
  p_user_id text,
  p_role public.board_role
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer;
begin
  if p_role not in ('editor', 'viewer') then
    raise exception 'Only editor or viewer access can be granted';
  end if;

  select count(distinct board_id)::integer into requested_count
  from unnest(coalesce(p_board_ids, array[]::text[])) as board_id;

  if requested_count = 0 then
    raise exception 'At least one board is required';
  end if;

  if exists (
    select 1
    from unnest(p_board_ids) as requested(board_id)
    left join public.boards board
      on board.id = requested.board_id
     and board.deleted_at is null
     and board.owner_id = p_actor_id
    where board.id is null
  ) then
    raise exception 'Actor cannot manage every requested board';
  end if;

  insert into public.board_members (board_id, user_id, role)
  select distinct board_id, p_user_id, p_role
  from unnest(p_board_ids) as board_id
  on conflict (board_id, user_id)
  do update set role = excluded.role;

  insert into public.audit_events (board_id, actor_id, event_type, payload)
  select distinct board_id, p_actor_id, 'board.member_invited',
    jsonb_build_object('memberId', p_user_id, 'role', p_role, 'linkedShare', requested_count > 1)
  from unnest(p_board_ids) as board_id;

  return requested_count;
end;
$$;

revoke all on function public.share_kumo_board_set(text[], text, text, public.board_role)
from public, anon, authenticated;

grant execute on function public.share_kumo_board_set(text[], text, text, public.board_role)
to service_role;

create or replace function public.remove_kumo_board_member_set(
  p_board_ids text[],
  p_actor_id text,
  p_user_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count integer;
begin
  if exists (
    select 1
    from unnest(coalesce(p_board_ids, array[]::text[])) as requested(board_id)
    left join public.boards board
      on board.id = requested.board_id
     and board.deleted_at is null
     and board.owner_id = p_actor_id
    where board.id is null
  ) then
    raise exception 'Actor cannot manage every requested board';
  end if;

  with removed as (
    delete from public.board_members
    where board_id = any(p_board_ids)
      and user_id = p_user_id
      and role <> 'owner'
    returning board_id
  )
  select count(*)::integer into removed_count from removed;

  insert into public.audit_events (board_id, actor_id, event_type, payload)
  select distinct board_id, p_actor_id, 'board.member_removed',
    jsonb_build_object('memberId', p_user_id, 'linkedShare', cardinality(p_board_ids) > 1)
  from unnest(p_board_ids) as board_id;

  return removed_count;
end;
$$;

revoke all on function public.remove_kumo_board_member_set(text[], text, text)
from public, anon, authenticated;

grant execute on function public.remove_kumo_board_member_set(text[], text, text)
to service_role;
