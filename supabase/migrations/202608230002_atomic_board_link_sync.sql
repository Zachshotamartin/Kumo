create or replace function public.sync_kumo_board_links(
  p_source_board_id text,
  p_links jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.board_links
  where source_board_id = p_source_board_id;

  insert into public.board_links (source_board_id, target_board_id, shape_id)
  select
    p_source_board_id,
    link.target_board_id,
    link.shape_id
  from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb))
    as link(target_board_id text, shape_id text)
  join public.boards target
    on target.id = link.target_board_id
   and target.deleted_at is null
  where link.target_board_id <> p_source_board_id
  on conflict (source_board_id, shape_id)
  do update set target_board_id = excluded.target_board_id;
end;
$$;

revoke all on function public.sync_kumo_board_links(text, jsonb)
from public, anon, authenticated;

grant execute on function public.sync_kumo_board_links(text, jsonb)
to service_role;
