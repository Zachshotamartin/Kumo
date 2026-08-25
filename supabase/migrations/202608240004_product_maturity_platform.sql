create table if not exists public.board_invitations (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  email text not null,
  role public.board_role not null check (role in ('editor', 'viewer')),
  token_hash text not null unique,
  include_linked_boards boolean not null default true,
  invited_by text not null references public.profiles(firebase_uid) on delete cascade,
  accepted_by text references public.profiles(firebase_uid) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists board_invitations_pending_email_idx
  on public.board_invitations(board_id, lower(email)) where status = 'pending';

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member', 'guest')),
  token_hash text not null unique,
  invited_by text not null references public.profiles(firebase_uid) on delete cascade,
  accepted_by text references public.profiles(firebase_uid) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists workspace_invitations_pending_email_idx
  on public.workspace_invitations(workspace_id, lower(email)) where status = 'pending';
alter table public.workspace_invitations
  add column if not exists last_sent_at timestamptz not null default now();

create table if not exists public.notification_preferences (
  user_id text primary key references public.profiles(firebase_uid) on delete cascade,
  email_enabled boolean not null default true,
  browser_enabled boolean not null default false,
  digest text not null default 'instant' check (digest in ('instant', 'daily', 'weekly', 'off')),
  board_comments text not null default 'all' check (board_comments in ('all', 'mentions', 'off')),
  branch_reviews boolean not null default true,
  library_updates boolean not null default true,
  access_changes boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.document_snapshots
  add column if not exists share_token_hash text,
  add column if not exists share_expires_at timestamptz,
  add column if not exists parent_snapshot_id uuid references public.document_snapshots(id) on delete set null;
create unique index if not exists document_snapshots_share_token_idx
  on public.document_snapshots(share_token_hash) where share_token_hash is not null;

alter table public.document_branches
  add column if not exists base_document jsonb,
  add column if not exists updated_from_main_at timestamptz,
  add column if not exists merge_description text;

create table if not exists public.branch_conflicts (
  branch_id uuid not null references public.document_branches(id) on delete cascade,
  shape_id text not null,
  base_value jsonb,
  main_value jsonb,
  branch_value jsonb,
  resolution text check (resolution in ('main', 'branch')),
  resolved_by text references public.profiles(firebase_uid) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (branch_id, shape_id)
);

alter table public.design_library_versions
  add column if not exists semantic_version text,
  add column if not exists release_status text not null default 'published' check (release_status in ('draft', 'review', 'published', 'deprecated')),
  add column if not exists approved_by text references public.profiles(firebase_uid) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists changelog jsonb not null default '[]'::jsonb;

alter table public.design_library_subscriptions
  add column if not exists last_notified_version integer not null default 0;

create table if not exists public.prototype_share_links (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  token_hash text not null unique,
  start_shape_id text,
  password_hash text,
  device_frame text not null default 'none' check (device_frame in ('none', 'phone', 'tablet', 'desktop')),
  expires_at timestamptz,
  created_by text not null references public.profiles(firebase_uid) on delete cascade,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.extension_catalog (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9.-]+$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  manifest jsonb not null,
  publisher_id text references public.profiles(firebase_uid) on delete set null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installed_extensions (
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  extension_id text not null references public.extension_catalog(id) on delete cascade,
  granted_permissions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  installed_at timestamptz not null default now(),
  primary key (user_id, extension_id)
);

create table if not exists public.community_publications (
  board_id text primary key references public.boards(id) on delete cascade,
  published_by text not null references public.profiles(firebase_uid) on delete cascade,
  slug text not null unique,
  description text not null default '',
  tags text[] not null default '{}',
  remix_allowed boolean not null default true,
  remix_count integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  reporter_id text not null references public.profiles(firebase_uid) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'removed')),
  created_at timestamptz not null default now(),
  unique(board_id, reporter_id)
);

create table if not exists public.api_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  user_id text primary key references public.profiles(firebase_uid) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '7 days'),
  cancelled_at timestamptz
);

create or replace function public.transfer_kumo_board_ownership(
  p_board_id text,
  p_actor_id text,
  p_new_owner_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.boards where id = p_board_id and owner_id = p_actor_id and deleted_at is null) then
    raise exception 'Only the owner can transfer this board';
  end if;
  if not exists (select 1 from public.board_members where board_id = p_board_id and user_id = p_new_owner_id) then
    raise exception 'The new owner must already be a board member';
  end if;
  update public.board_members set role = 'editor' where board_id = p_board_id and user_id = p_actor_id;
  update public.board_members set role = 'owner' where board_id = p_board_id and user_id = p_new_owner_id;
  update public.boards set owner_id = p_new_owner_id where id = p_board_id;
  insert into public.audit_events(board_id, actor_id, event_type, payload)
  values (p_board_id, p_actor_id, 'board.ownership_transferred', jsonb_build_object('new_owner_id', p_new_owner_id));
end;
$$;

create or replace function public.consume_kumo_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bucket public.api_rate_limits;
  elapsed integer;
begin
  insert into public.api_rate_limits(key_hash, window_started_at, hit_count)
  values (p_key_hash, now(), 1)
  on conflict (key_hash) do update set
    window_started_at = case when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then now() else public.api_rate_limits.window_started_at end,
    hit_count = case when public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1 else public.api_rate_limits.hit_count + 1 end,
    updated_at = now()
  returning * into bucket;
  elapsed := greatest(0, extract(epoch from (now() - bucket.window_started_at))::integer);
  return query select bucket.hit_count <= p_limit, greatest(0, p_limit - bucket.hit_count), greatest(0, p_window_seconds - elapsed);
end;
$$;

create or replace function public.accept_kumo_board_invitation(
  p_token_hash text,
  p_actor_id text,
  p_actor_email text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.board_invitations;
begin
  select * into invitation from public.board_invitations where token_hash = p_token_hash for update;
  if invitation.id is null or invitation.status <> 'pending' then raise exception 'Invitation is unavailable'; end if;
  if invitation.expires_at <= now() then
    update public.board_invitations set status = 'expired' where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(invitation.email) <> lower(p_actor_email) then raise exception 'Invitation belongs to another email address'; end if;
  insert into public.board_members(board_id, user_id, role)
  values (invitation.board_id, p_actor_id, invitation.role)
  on conflict (board_id, user_id) do update set role = excluded.role;
  update public.board_invitations set status = 'accepted', accepted_by = p_actor_id, accepted_at = now() where id = invitation.id;
  insert into public.audit_events(board_id, actor_id, event_type, payload)
  values (invitation.board_id, p_actor_id, 'board.invitation_accepted', jsonb_build_object('invitation_id', invitation.id));
  return invitation.board_id;
end;
$$;

create or replace function public.create_or_refresh_kumo_board_invitation(
  p_board_id text,
  p_email text,
  p_role public.board_role,
  p_token_hash text,
  p_include_linked_boards boolean,
  p_invited_by text
)
returns public.board_invitations
language plpgsql
security invoker
set search_path = ''
as $$
declare invitation public.board_invitations;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('board-invite:' || p_board_id || ':' || lower(p_email), 0));
  update public.board_invitations set
    role = p_role,
    token_hash = p_token_hash,
    include_linked_boards = p_include_linked_boards,
    invited_by = p_invited_by,
    expires_at = now() + interval '14 days',
    last_sent_at = now()
  where board_id = p_board_id and lower(email) = lower(p_email) and status = 'pending'
  returning * into invitation;
  if invitation.id is null then
    insert into public.board_invitations(board_id, email, role, token_hash, include_linked_boards, invited_by)
    values (p_board_id, lower(p_email), p_role, p_token_hash, p_include_linked_boards, p_invited_by)
    returning * into invitation;
  end if;
  return invitation;
end;
$$;

create or replace function public.accept_kumo_workspace_invitation(
  p_token_hash text,
  p_actor_id text,
  p_actor_email text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.workspace_invitations;
begin
  select * into invitation from public.workspace_invitations where token_hash = p_token_hash for update;
  if invitation.id is null or invitation.status <> 'pending' then raise exception 'Invitation is unavailable'; end if;
  if invitation.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(invitation.email) <> lower(p_actor_email) then raise exception 'Invitation belongs to another email address'; end if;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (invitation.workspace_id, p_actor_id, invitation.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  update public.workspace_invitations set status = 'accepted', accepted_by = p_actor_id, accepted_at = now() where id = invitation.id;
  return invitation.workspace_id;
end;
$$;

create or replace function public.create_or_refresh_kumo_workspace_invitation(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_invited_by text
)
returns public.workspace_invitations
language plpgsql
security invoker
set search_path = ''
as $$
declare invitation public.workspace_invitations;
begin
  if p_role not in ('admin', 'member', 'guest') then
    raise exception 'Invalid workspace role';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('workspace-invite:' || p_workspace_id::text || ':' || lower(p_email), 0));
  update public.workspace_invitations set
    role = p_role,
    token_hash = p_token_hash,
    invited_by = p_invited_by,
    expires_at = now() + interval '14 days',
    last_sent_at = now()
  where workspace_id = p_workspace_id and lower(email) = lower(p_email) and status = 'pending'
  returning * into invitation;
  if invitation.id is null then
    insert into public.workspace_invitations(workspace_id, email, role, token_hash, invited_by)
    values (p_workspace_id, lower(p_email), p_role, p_token_hash, p_invited_by)
    returning * into invitation;
  end if;
  return invitation;
end;
$$;

create or replace function public.transfer_kumo_workspace_ownership(
  p_workspace_id uuid,
  p_actor_id text,
  p_new_owner_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_actor_id = p_new_owner_id then
    raise exception 'Choose another workspace member';
  end if;
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = p_actor_id
    for update
  ) then
    raise exception 'Only the workspace owner can transfer ownership';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_new_owner_id
  ) then
    raise exception 'The new owner must already be a workspace member';
  end if;
  update public.workspace_members set role = 'admin'
  where workspace_id = p_workspace_id and user_id = p_actor_id;
  update public.workspace_members set role = 'owner'
  where workspace_id = p_workspace_id and user_id = p_new_owner_id;
  update public.workspaces set owner_id = p_new_owner_id, updated_at = now()
  where id = p_workspace_id;
  insert into public.audit_events(actor_id, event_type, payload)
  values (p_actor_id, 'workspace.ownership_transferred', jsonb_build_object(
    'workspace_id', p_workspace_id,
    'new_owner_id', p_new_owner_id
  ));
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'board_invitations', 'workspace_invitations', 'notification_preferences', 'branch_conflicts',
    'prototype_share_links', 'extension_catalog', 'installed_extensions', 'community_publications',
    'community_reports', 'api_rate_limits', 'account_deletion_requests'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

revoke all on function public.transfer_kumo_board_ownership(text, text, text) from public, anon, authenticated;
revoke all on function public.consume_kumo_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.accept_kumo_board_invitation(text, text, text) from public, anon, authenticated;
revoke all on function public.create_or_refresh_kumo_board_invitation(text, text, public.board_role, text, boolean, text) from public, anon, authenticated;
revoke all on function public.accept_kumo_workspace_invitation(text, text, text) from public, anon, authenticated;
revoke all on function public.create_or_refresh_kumo_workspace_invitation(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.transfer_kumo_workspace_ownership(uuid, text, text) from public, anon, authenticated;
grant execute on function public.transfer_kumo_board_ownership(text, text, text) to service_role;
grant execute on function public.consume_kumo_rate_limit(text, integer, integer) to service_role;
grant execute on function public.accept_kumo_board_invitation(text, text, text) to service_role;
grant execute on function public.create_or_refresh_kumo_board_invitation(text, text, public.board_role, text, boolean, text) to service_role;
grant execute on function public.accept_kumo_workspace_invitation(text, text, text) to service_role;
grant execute on function public.create_or_refresh_kumo_workspace_invitation(uuid, text, text, text, text) to service_role;
grant execute on function public.transfer_kumo_workspace_ownership(uuid, text, text) to service_role;
