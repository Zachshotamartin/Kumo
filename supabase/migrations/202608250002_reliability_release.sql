alter table public.profiles
  add column if not exists email_verified boolean not null default false;

create index if not exists profiles_verified_discovery_idx
  on public.profiles (email_verified, discoverable, lower(username), lower(display_name));

alter table public.profiles
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

create or replace function public.claim_kumo_onboarding(p_user_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare profile public.profiles;
begin
  select * into profile from public.profiles where firebase_uid = p_user_id for update;
  if profile.firebase_uid is null then raise exception 'Profile not found'; end if;
  if profile.onboarding_completed_at is not null
    or exists (select 1 from public.boards where owner_id = p_user_id)
    or (profile.onboarding_started_at is not null and profile.onboarding_started_at >= now() - interval '30 minutes')
  then return false;
  end if;
  update public.profiles set onboarding_started_at = now() where firebase_uid = p_user_id;
  return true;
end;
$$;

create or replace function public.complete_kumo_onboarding(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set onboarding_started_at = null, onboarding_completed_at = now()
  where firebase_uid = p_user_id and onboarding_started_at is not null;
  if not found then raise exception 'Onboarding claim is unavailable'; end if;
end;
$$;

create or replace function public.release_kumo_onboarding(p_user_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set onboarding_started_at = null
  where firebase_uid = p_user_id and onboarding_completed_at is null;
$$;

revoke all on function public.claim_kumo_onboarding(text) from public, anon, authenticated;
revoke all on function public.complete_kumo_onboarding(text) from public, anon, authenticated;
revoke all on function public.release_kumo_onboarding(text) from public, anon, authenticated;
grant execute on function public.claim_kumo_onboarding(text) to service_role;
grant execute on function public.complete_kumo_onboarding(text) to service_role;
grant execute on function public.release_kumo_onboarding(text) to service_role;

create or replace function public.ensure_kumo_profile(
  p_firebase_uid text,
  p_email text,
  p_default_display_name text,
  p_default_avatar_url text default null,
  p_email_verified boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  ensured public.profiles;
  base_username text;
begin
  base_username := left(
    coalesce(
      nullif(trim(both '-' from regexp_replace(lower(split_part(p_email, '@', 1)), '[^a-z0-9]+', '-', 'g')), ''),
      'kumo'
    ),
    17
  ) || '-' || substr(md5(p_firebase_uid), 1, 12);

  insert into public.profiles (
    firebase_uid, email, email_verified, display_name, avatar_url, username
  ) values (
    p_firebase_uid,
    lower(trim(p_email)),
    p_email_verified,
    left(coalesce(nullif(trim(p_default_display_name), ''), 'Kumo user'), 60),
    nullif(left(coalesce(p_default_avatar_url, ''), 2048), ''),
    base_username
  )
  on conflict (firebase_uid) do update
  set email = excluded.email,
      email_verified = excluded.email_verified
  returning * into ensured;

  return ensured;
end;
$$;

revoke all on function public.ensure_kumo_profile(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.ensure_kumo_profile(text, text, text, text, boolean) to service_role;

alter table public.account_deletion_requests
  add column if not exists processing_started_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

create or replace function public.claim_due_kumo_account_deletions(p_limit integer default 20)
returns table(user_id text, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select request.user_id
    from public.account_deletion_requests request
    where request.cancelled_at is null
      and request.scheduled_for <= now()
      and (request.processing_started_at is null or request.processing_started_at < now() - interval '30 minutes')
    order by request.scheduled_for
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.account_deletion_requests request
  set processing_started_at = now(),
      attempt_count = request.attempt_count + 1,
      last_error = null
  from claimed
  where request.user_id = claimed.user_id
  returning request.user_id, request.attempt_count;
end;
$$;

revoke all on function public.claim_due_kumo_account_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_kumo_account_deletions(integer) to service_role;

create or replace function public.schedule_kumo_account_deletion(p_user_id text)
returns table(requested_at timestamptz, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.account_deletion_requests;
begin
  select * into existing from public.account_deletion_requests where user_id = p_user_id for update;
  if existing.processing_started_at is not null then
    raise exception 'Account deletion cannot be changed while processing';
  end if;
  insert into public.account_deletion_requests(user_id, requested_at, scheduled_for, cancelled_at, processing_started_at, attempt_count, last_error)
  values (p_user_id, now(), now() + interval '7 days', null, null, 0, null)
  on conflict (user_id) do update set
    requested_at = excluded.requested_at,
    scheduled_for = excluded.scheduled_for,
    cancelled_at = null,
    processing_started_at = null,
    attempt_count = 0,
    last_error = null;
  return query select request.requested_at, request.scheduled_for
  from public.account_deletion_requests request where request.user_id = p_user_id;
end;
$$;

create or replace function public.cancel_kumo_account_deletion(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.account_deletion_requests;
begin
  select * into existing from public.account_deletion_requests where user_id = p_user_id for update;
  if existing.processing_started_at is not null then
    raise exception 'Account deletion cannot be changed while processing';
  end if;
  update public.account_deletion_requests set cancelled_at = now()
  where user_id = p_user_id and cancelled_at is null;
end;
$$;

revoke all on function public.schedule_kumo_account_deletion(text) from public, anon, authenticated;
revoke all on function public.cancel_kumo_account_deletion(text) from public, anon, authenticated;
grant execute on function public.schedule_kumo_account_deletion(text) to service_role;
grant execute on function public.cancel_kumo_account_deletion(text) to service_role;

alter table public.boards
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists purge_started_at timestamptz,
  add column if not exists purge_attempt_count integer not null default 0,
  add column if not exists purge_last_error text;

alter table public.assets alter column uploader_id drop not null;
alter table public.assets drop constraint if exists assets_uploader_id_fkey;
alter table public.assets add constraint assets_uploader_id_fkey
  foreign key (uploader_id) references public.profiles(firebase_uid) on delete set null;

alter table public.workspace_fonts alter column uploaded_by drop not null;
alter table public.workspace_fonts drop constraint if exists workspace_fonts_uploaded_by_fkey;
alter table public.workspace_fonts add constraint workspace_fonts_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles(firebase_uid) on delete set null;

create index if not exists boards_workspace_updated_idx
  on public.boards(workspace_id, updated_at desc)
  where deleted_at is null;

create or replace function public.soft_delete_kumo_board(p_board_id text, p_actor_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.boards
  set deleted_at = now(), purge_started_at = null, purge_attempt_count = 0, purge_last_error = null
  where id = p_board_id and owner_id = p_actor_id and deleted_at is null;
  if not found then raise exception 'Board not found or actor is not the owner'; end if;
  insert into public.audit_events(board_id, actor_id, event_type)
  values (p_board_id, p_actor_id, 'board.deleted');
end;
$$;

create or replace function public.restore_kumo_board(p_board_id text, p_actor_id text)
returns public.boards
language plpgsql
security invoker
set search_path = ''
as $$
declare restored public.boards;
begin
  select * into restored from public.boards
  where id = p_board_id and owner_id = p_actor_id and deleted_at is not null for update;
  if restored.id is null then raise exception 'Deleted board not found'; end if;
  if restored.purge_started_at is not null then raise exception 'Board purge is already processing'; end if;
  update public.boards set deleted_at = null, purge_last_error = null
  where id = p_board_id returning * into restored;
  insert into public.audit_events(board_id, actor_id, event_type)
  values (p_board_id, p_actor_id, 'board.restored');
  return restored;
end;
$$;

create or replace function public.claim_expired_kumo_boards(p_cutoff timestamptz, p_limit integer default 50)
returns table(id text, liveblocks_room_id text, legacy_rtdb_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select board.id from public.boards board
    where board.deleted_at is not null and board.deleted_at <= p_cutoff
      and (board.purge_started_at is null or board.purge_started_at < now() - interval '30 minutes')
    order by board.deleted_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.boards board
  set purge_started_at = now(), purge_attempt_count = board.purge_attempt_count + 1, purge_last_error = null
  from claimed where board.id = claimed.id
  returning board.id, board.liveblocks_room_id, board.legacy_rtdb_id;
end;
$$;

revoke all on function public.restore_kumo_board(text, text) from public, anon, authenticated;
revoke all on function public.claim_expired_kumo_boards(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.restore_kumo_board(text, text) to service_role;
grant execute on function public.claim_expired_kumo_boards(timestamptz, integer) to service_role;

create or replace function public.accept_kumo_workspace_invitation(p_token_hash text, p_actor_id text, p_actor_email text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.workspace_invitations;
  existing_role text;
begin
  select * into invitation from public.workspace_invitations where token_hash = p_token_hash for update;
  if invitation.id is null or invitation.status <> 'pending' then raise exception 'Invitation is unavailable'; end if;
  if invitation.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;
  if lower(invitation.email) <> lower(p_actor_email) then raise exception 'Invitation belongs to another email address'; end if;
  select role into existing_role from public.workspace_members
  where workspace_id = invitation.workspace_id and user_id = p_actor_id for update;
  if existing_role = 'owner' then raise exception 'Workspace owner role cannot be changed by invitation'; end if;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (invitation.workspace_id, p_actor_id, invitation.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  update public.workspace_invitations set status = 'accepted', accepted_by = p_actor_id, accepted_at = now() where id = invitation.id;
  return invitation.workspace_id;
end;
$$;

create or replace function public.assign_kumo_board_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id is null then
    select member.workspace_id into new.workspace_id
    from public.workspace_members member
    where member.user_id = new.owner_id
      and member.role = 'owner'
    order by member.created_at
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_kumo_board_workspace() from public, anon, authenticated;
grant execute on function public.assign_kumo_board_workspace() to service_role;

drop trigger if exists assign_kumo_board_workspace on public.boards;
create trigger assign_kumo_board_workspace
before insert on public.boards
for each row execute function public.assign_kumo_board_workspace();

update public.boards board
set workspace_id = (
  select member.workspace_id
  from public.workspace_members member
  where member.user_id = board.owner_id and member.role = 'owner'
  order by member.created_at
  limit 1
)
where board.workspace_id is null;

create or replace function public.remove_kumo_workspace_member(
  p_workspace_id uuid,
  p_actor_id text,
  p_user_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
begin
  select role into actor_role from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_actor_id;
  if actor_role not in ('owner', 'admin') then
    raise exception 'Workspace administration access is required';
  end if;
  if exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'The workspace owner cannot be removed';
  end if;
  if exists (
    select 1 from public.boards
    where workspace_id = p_workspace_id and owner_id = p_user_id and deleted_at is null
  ) then
    raise exception 'Transfer or delete this member''s workspace boards before removal';
  end if;
  delete from public.board_members membership
  using public.boards board
  where board.id = membership.board_id
    and board.workspace_id = p_workspace_id
    and membership.user_id = p_user_id
    and membership.role <> 'owner';
  delete from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_kumo_workspace_member(uuid, text, text) from public, anon, authenticated;
grant execute on function public.remove_kumo_workspace_member(uuid, text, text) to service_role;

create or replace function public.upsert_kumo_workspace_member(
  p_workspace_id uuid,
  p_actor_id text,
  p_user_id text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_role text; target_role text;
begin
  if p_role not in ('admin', 'member', 'guest') then raise exception 'Invalid workspace role'; end if;
  select role into actor_role from public.workspace_members where workspace_id = p_workspace_id and user_id = p_actor_id;
  if actor_role not in ('owner', 'admin') then raise exception 'Workspace administration access is required'; end if;
  select role into target_role from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id for update;
  if target_role = 'owner' then raise exception 'The workspace owner cannot be demoted'; end if;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (p_workspace_id, p_user_id, p_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.update_kumo_workspace_member(
  p_workspace_id uuid,
  p_actor_id text,
  p_user_id text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_role text; target_role text;
begin
  if p_role not in ('admin', 'member', 'guest') then raise exception 'Invalid workspace role'; end if;
  select role into actor_role from public.workspace_members where workspace_id = p_workspace_id and user_id = p_actor_id;
  if actor_role not in ('owner', 'admin') then raise exception 'Workspace administration access is required'; end if;
  select role into target_role from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id for update;
  if target_role is null then raise exception 'Workspace member not found'; end if;
  if target_role = 'owner' then raise exception 'The workspace owner cannot be demoted'; end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;

revoke all on function public.upsert_kumo_workspace_member(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.update_kumo_workspace_member(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.upsert_kumo_workspace_member(uuid, text, text, text) to service_role;
grant execute on function public.update_kumo_workspace_member(uuid, text, text, text) to service_role;

create or replace function public.leave_kumo_workspace(p_workspace_id uuid, p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'The owner cannot leave without transferring the workspace';
  end if;
  if exists (
    select 1 from public.boards
    where workspace_id = p_workspace_id and owner_id = p_user_id and deleted_at is null
  ) then
    raise exception 'Transfer or delete your workspace boards before leaving';
  end if;
  delete from public.board_members membership
  using public.boards board
  where board.id = membership.board_id
    and board.workspace_id = p_workspace_id
    and membership.user_id = p_user_id
    and membership.role <> 'owner';
  delete from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$$;

revoke all on function public.leave_kumo_workspace(uuid, text) from public, anon, authenticated;
grant execute on function public.leave_kumo_workspace(uuid, text) to service_role;

alter table public.notification_preferences
  add column if not exists last_digest_at timestamptz;

alter table public.account_notifications
  add column if not exists source_key text;

alter table public.account_notifications
  drop constraint if exists account_notifications_kind_check;
alter table public.account_notifications
  add constraint account_notifications_kind_check check (kind in (
    'comment', 'mention', 'reaction', 'share', 'friend', 'library', 'branch',
    'access-request', 'access-change', 'system'
  ));

create unique index if not exists account_notifications_source_key_idx
  on public.account_notifications(source_key)
  where source_key is not null;

create or replace function public.apply_kumo_board_access_change(
  p_operation text,
  p_board_ids text[],
  p_actor_id text,
  p_user_id text,
  p_role public.board_role,
  p_notification_board_id text,
  p_title text,
  p_body text,
  p_action_url text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed_count integer;
begin
  if p_operation = 'share' then
    changed_count := public.share_kumo_board_set(p_board_ids, p_actor_id, p_user_id, p_role);
  elsif p_operation = 'remove' then
    changed_count := public.remove_kumo_board_member_set(p_board_ids, p_actor_id, p_user_id);
  elsif p_operation = 'transfer' then
    if cardinality(p_board_ids) <> 1 then raise exception 'Ownership transfer requires one board'; end if;
    perform public.transfer_kumo_board_ownership(p_board_ids[1], p_actor_id, p_user_id);
    changed_count := 1;
  else
    raise exception 'Unknown board access operation';
  end if;
  insert into public.account_notifications(recipient_id, actor_id, board_id, kind, title, body, action_url)
  values (p_user_id, p_actor_id, p_notification_board_id, 'access-change', left(p_title, 180), coalesce(p_body, ''), p_action_url);
  return changed_count;
end;
$$;

revoke all on function public.apply_kumo_board_access_change(text, text[], text, text, public.board_role, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_kumo_board_access_change(text, text[], text, text, public.board_role, text, text, text, text) to service_role;

create or replace function public.create_kumo_board_access_request(
  p_board_id text,
  p_requester_id text,
  p_role public.board_role,
  p_message text,
  p_title text,
  p_body text,
  p_action_url text
)
returns public.board_access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare board public.boards; created public.board_access_requests;
begin
  if p_role not in ('editor', 'viewer') then raise exception 'Invalid requested role'; end if;
  select * into board from public.boards where id = p_board_id and deleted_at is null for update;
  if board.id is null then raise exception 'Board not found'; end if;
  if board.owner_id = p_requester_id then raise exception 'The owner cannot request access'; end if;
  insert into public.board_access_requests(board_id, requester_id, requested_role, message, status)
  values (p_board_id, p_requester_id, p_role, left(coalesce(p_message, ''), 500), 'pending')
  on conflict (board_id, requester_id, status) do update set
    requested_role = excluded.requested_role,
    message = excluded.message,
    created_at = now()
  returning * into created;
  insert into public.account_notifications(recipient_id, actor_id, board_id, kind, title, body, action_url)
  values (board.owner_id, p_requester_id, p_board_id, 'access-request', left(p_title, 180), coalesce(p_body, ''), p_action_url);
  return created;
end;
$$;

create or replace function public.resolve_kumo_board_access_request(
  p_request_id uuid,
  p_actor_id text,
  p_approved boolean,
  p_title text,
  p_body text,
  p_action_url text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare access_request public.board_access_requests; decision text;
begin
  select * into access_request from public.board_access_requests where id = p_request_id for update;
  if access_request.id is null or access_request.status <> 'pending' then raise exception 'Pending access request not found'; end if;
  if not exists (select 1 from public.boards where id = access_request.board_id and owner_id = p_actor_id and deleted_at is null) then
    raise exception 'Only the owner can resolve access requests';
  end if;
  decision := case when p_approved then 'approved' else 'denied' end;
  if p_approved then
    insert into public.board_members(board_id, user_id, role)
    values (access_request.board_id, access_request.requester_id, access_request.requested_role)
    on conflict (board_id, user_id) do update set role = excluded.role;
  end if;
  update public.board_access_requests set status = decision, resolved_by = p_actor_id, resolved_at = now()
  where id = access_request.id;
  insert into public.account_notifications(recipient_id, actor_id, board_id, kind, title, body, action_url)
  values (access_request.requester_id, p_actor_id, access_request.board_id, 'access-request', left(p_title, 180), coalesce(p_body, ''), p_action_url);
  return decision;
end;
$$;

revoke all on function public.create_kumo_board_access_request(text, text, public.board_role, text, text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_kumo_board_access_request(uuid, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.create_kumo_board_access_request(text, text, public.board_role, text, text, text, text) to service_role;
grant execute on function public.resolve_kumo_board_access_request(uuid, text, boolean, text, text, text) to service_role;

alter table public.community_reports
  add column if not exists category text not null default 'other' check (category in ('spam', 'harassment', 'copyright', 'unsafe', 'misleading', 'other')),
  add column if not exists reviewed_by text references public.profiles(firebase_uid) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text not null default '';

create or replace function public.moderate_kumo_community_report(
  p_report_id uuid,
  p_actor_id text,
  p_decision text,
  p_note text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare report public.community_reports;
begin
  if p_decision not in ('reviewed', 'dismissed', 'removed') then raise exception 'Invalid moderation decision'; end if;
  select * into report from public.community_reports where id = p_report_id for update;
  if report.id is null or report.status <> 'open' then raise exception 'This report has already been reviewed'; end if;
  if p_decision = 'removed' then delete from public.community_publications where board_id = report.board_id; end if;
  update public.community_reports set status = p_decision, reviewed_by = p_actor_id,
    reviewed_at = now(), review_note = left(coalesce(p_note, ''), 500) where id = report.id;
  insert into public.audit_events(actor_id, board_id, event_type, payload)
  values (p_actor_id, report.board_id, 'community.report_' || p_decision, jsonb_build_object('reportId', report.id));
  return report.board_id;
end;
$$;

revoke all on function public.moderate_kumo_community_report(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.moderate_kumo_community_report(uuid, text, text, text) to service_role;

alter table public.profiles
  add column if not exists avatar_storage_key text;

create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (char_length(bucket) between 1 and 100),
  storage_key text not null check (char_length(storage_key) between 1 and 1024),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(bucket, storage_key)
);
create index if not exists storage_cleanup_jobs_due_idx
  on public.storage_cleanup_jobs(next_attempt_at, created_at);
alter table public.storage_cleanup_jobs enable row level security;
revoke all on public.storage_cleanup_jobs from anon, authenticated;
grant all on public.storage_cleanup_jobs to service_role;

create or replace function public.enqueue_kumo_storage_cleanup(
  p_bucket text,
  p_storage_key text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(p_bucket), '') is null or nullif(trim(p_storage_key), '') is null then
    raise exception 'Storage cleanup target is required';
  end if;
  insert into public.storage_cleanup_jobs(bucket, storage_key, last_error)
  values (p_bucket, p_storage_key, left(p_error, 1000))
  on conflict (bucket, storage_key) do update set
    next_attempt_at = now(),
    processing_started_at = null,
    last_error = excluded.last_error;
end;
$$;

create or replace function public.claim_due_kumo_storage_cleanups(p_limit integer default 50)
returns table(id uuid, bucket text, storage_key text, attempt_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select job.id
    from public.storage_cleanup_jobs job
    where job.next_attempt_at <= now()
      and (job.processing_started_at is null or job.processing_started_at < now() - interval '30 minutes')
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.storage_cleanup_jobs job
  set processing_started_at = now(), attempt_count = job.attempt_count + 1
  from claimed where job.id = claimed.id
  returning job.id, job.bucket, job.storage_key, job.attempt_count;
end;
$$;

revoke all on function public.enqueue_kumo_storage_cleanup(text, text, text) from public, anon, authenticated;
revoke all on function public.claim_due_kumo_storage_cleanups(integer) from public, anon, authenticated;
grant execute on function public.enqueue_kumo_storage_cleanup(text, text, text) to service_role;
grant execute on function public.claim_due_kumo_storage_cleanups(integer) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.saved_board_views (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filter text not null check (filter in ('active', 'favorites', 'archived', 'trash')),
  sort text not null check (sort in ('updated', 'title')),
  density text not null check (density in ('comfortable', 'compact')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_board_views_user_position_idx on public.saved_board_views(user_id, position, created_at);
alter table public.saved_board_views enable row level security;
revoke all on public.saved_board_views from anon, authenticated;
grant all on public.saved_board_views to service_role;

create or replace function public.reorder_kumo_saved_board_views(p_user_id text, p_ordered_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.saved_board_views view
  set position = ordered.ordinality - 1, updated_at = now()
  from unnest(p_ordered_ids) with ordinality as ordered(id, ordinality)
  where view.id = ordered.id and view.user_id = p_user_id;
$$;
revoke all on function public.reorder_kumo_saved_board_views(text, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_kumo_saved_board_views(text, uuid[]) to service_role;

alter table public.account_notifications add column if not exists archived_at timestamptz;
create table if not exists public.board_notification_mutes (
  board_id text not null references public.boards(id) on delete cascade,
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(board_id, user_id)
);
alter table public.board_notification_mutes enable row level security;
revoke all on public.board_notification_mutes from anon, authenticated;
grant all on public.board_notification_mutes to service_role;

create table if not exists public.account_sessions (
  id text not null,
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, id),
  check (char_length(id) between 16 and 100)
);
create index if not exists account_sessions_user_seen_idx on public.account_sessions(user_id, last_seen_at desc);
alter table public.account_sessions enable row level security;
revoke all on public.account_sessions from anon, authenticated;
grant all on public.account_sessions to service_role;
