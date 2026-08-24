do $$
begin
  create type public.friendship_status as enum ('pending', 'accepted', 'blocked');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.friend_request_policy as enum ('everyone', 'friends_of_friends', 'none');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists username text,
  add column if not exists bio text not null default '',
  add column if not exists discoverable boolean not null default true,
  add column if not exists friend_request_policy public.friend_request_policy not null default 'everyone';

update public.profiles
set username = left(
  coalesce(
    nullif(trim(both '-' from regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9]+', '-', 'g')), ''),
    'kumo'
  ),
  17
) || '-' || substr(md5(firebase_uid), 1, 12)
where username is null;

update public.profiles
set display_name = 'Kumo user'
where trim(display_name) = '';

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format_check,
  add constraint profiles_username_format_check
    check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  drop constraint if exists profiles_display_name_length_check,
  add constraint profiles_display_name_length_check
    check (char_length(display_name) between 1 and 60),
  drop constraint if exists profiles_bio_length_check,
  add constraint profiles_bio_length_check
    check (char_length(bio) <= 280),
  drop constraint if exists profiles_avatar_url_length_check,
  add constraint profiles_avatar_url_length_check
    check (avatar_url is null or char_length(avatar_url) <= 2048);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

create index if not exists profiles_discovery_idx
  on public.profiles (discoverable, lower(username), lower(display_name));

create table if not exists public.friendships (
  user_low_id text not null references public.profiles(firebase_uid) on delete cascade,
  user_high_id text not null references public.profiles(firebase_uid) on delete cascade,
  status public.friendship_status not null,
  requested_by text references public.profiles(firebase_uid) on delete cascade,
  blocked_by text references public.profiles(firebase_uid) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_low_id, user_high_id),
  check (user_low_id < user_high_id),
  check (
    (status = 'pending' and requested_by in (user_low_id, user_high_id) and blocked_by is null)
    or (status = 'accepted' and requested_by in (user_low_id, user_high_id) and blocked_by is null)
    or (status = 'blocked' and blocked_by in (user_low_id, user_high_id))
  )
);

create index if not exists friendships_low_status_idx
  on public.friendships (user_low_id, status, updated_at desc);

create index if not exists friendships_high_status_idx
  on public.friendships (user_high_id, status, updated_at desc);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

create or replace function public.ensure_kumo_profile(
  p_firebase_uid text,
  p_email text,
  p_default_display_name text,
  p_default_avatar_url text default null
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
    firebase_uid, email, display_name, avatar_url, username
  ) values (
    p_firebase_uid,
    lower(trim(p_email)),
    left(coalesce(nullif(trim(p_default_display_name), ''), 'Kumo user'), 60),
    nullif(left(coalesce(p_default_avatar_url, ''), 2048), ''),
    base_username
  )
  on conflict (firebase_uid) do update
  set email = excluded.email
  returning * into ensured;

  return ensured;
end;
$$;

create or replace function public.mutate_kumo_friendship(
  p_actor_id text,
  p_target_id text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  low_id text := least(p_actor_id, p_target_id);
  high_id text := greatest(p_actor_id, p_target_id);
  relation public.friendships;
  target_policy public.friend_request_policy;
  mutual_friend_exists boolean := false;
begin
  if p_actor_id = p_target_id then
    raise exception 'You cannot change a friendship with yourself';
  end if;

  if not exists (select 1 from public.profiles where firebase_uid = p_target_id) then
    raise exception 'Profile not found';
  end if;

  select * into relation
  from public.friendships
  where user_low_id = low_id and user_high_id = high_id
  for update;

  if p_action = 'request' then
    if relation.status = 'blocked' then
      raise exception 'Friend request unavailable';
    end if;
    if relation.status = 'accepted' or (relation.status = 'pending' and relation.requested_by = p_actor_id) then
      return;
    end if;
    if relation.status = 'pending' and relation.requested_by = p_target_id then
      update public.friendships
      set status = 'accepted', blocked_by = null, responded_at = now()
      where user_low_id = low_id and user_high_id = high_id;
      insert into public.audit_events (actor_id, event_type, payload)
      values (p_actor_id, 'friend.accepted', jsonb_build_object('target_uid', p_target_id));
      return;
    end if;

    select friend_request_policy into target_policy
    from public.profiles
    where firebase_uid = p_target_id;
    if target_policy = 'none' then
      raise exception 'This profile is not accepting friend requests';
    end if;
    if target_policy = 'friends_of_friends' then
      select exists (
        select 1
        from public.friendships actor_link
        join public.friendships target_link
          on (
            case when actor_link.user_low_id = p_actor_id then actor_link.user_high_id else actor_link.user_low_id end
          ) = (
            case when target_link.user_low_id = p_target_id then target_link.user_high_id else target_link.user_low_id end
          )
        where actor_link.status = 'accepted'
          and target_link.status = 'accepted'
          and p_actor_id in (actor_link.user_low_id, actor_link.user_high_id)
          and p_target_id in (target_link.user_low_id, target_link.user_high_id)
      ) into mutual_friend_exists;
      if not mutual_friend_exists then
        raise exception 'This profile only accepts requests from friends of friends';
      end if;
    end if;

    insert into public.friendships (
      user_low_id, user_high_id, status, requested_by, blocked_by, responded_at
    ) values (
      low_id, high_id, 'pending', p_actor_id, null, null
    )
    on conflict (user_low_id, user_high_id) do nothing;
    if not found then
      select * into relation
      from public.friendships
      where user_low_id = low_id and user_high_id = high_id
      for update;
      if relation.status = 'pending' and relation.requested_by = p_target_id then
        update public.friendships
        set status = 'accepted', blocked_by = null, responded_at = now()
        where user_low_id = low_id and user_high_id = high_id;
        insert into public.audit_events (actor_id, event_type, payload)
        values (p_actor_id, 'friend.accepted', jsonb_build_object('target_uid', p_target_id));
      elsif relation.status = 'blocked' then
        raise exception 'Friend request unavailable';
      end if;
    else
      insert into public.audit_events (actor_id, event_type, payload)
      values (p_actor_id, 'friend.requested', jsonb_build_object('target_uid', p_target_id));
    end if;
    return;
  end if;

  if p_action = 'accept' then
    if relation.status <> 'pending' or relation.requested_by <> p_target_id then
      raise exception 'Incoming friend request not found';
    end if;
    update public.friendships
    set status = 'accepted', blocked_by = null, responded_at = now()
    where user_low_id = low_id and user_high_id = high_id;
    insert into public.audit_events (actor_id, event_type, payload)
    values (p_actor_id, 'friend.accepted', jsonb_build_object('target_uid', p_target_id));
    return;
  end if;

  if p_action in ('decline', 'cancel') then
    if relation.status <> 'pending'
      or (p_action = 'decline' and relation.requested_by <> p_target_id)
      or (p_action = 'cancel' and relation.requested_by <> p_actor_id) then
      raise exception 'Pending friend request not found';
    end if;
    delete from public.friendships where user_low_id = low_id and user_high_id = high_id;
    insert into public.audit_events (actor_id, event_type, payload)
    values (
      p_actor_id,
      case when p_action = 'decline' then 'friend.declined' else 'friend.cancelled' end,
      jsonb_build_object('target_uid', p_target_id)
    );
    return;
  end if;

  if p_action = 'remove' then
    if relation.status <> 'accepted' then
      raise exception 'Friendship not found';
    end if;
    delete from public.friendships where user_low_id = low_id and user_high_id = high_id;
    insert into public.audit_events (actor_id, event_type, payload)
    values (p_actor_id, 'friend.removed', jsonb_build_object('target_uid', p_target_id));
    return;
  end if;

  if p_action = 'block' then
    insert into public.friendships (
      user_low_id, user_high_id, status, requested_by, blocked_by, responded_at
    ) values (
      low_id, high_id, 'blocked', null, p_actor_id, now()
    )
    on conflict (user_low_id, user_high_id) do update
    set status = 'blocked', requested_by = null, blocked_by = p_actor_id, responded_at = now();
    insert into public.audit_events (actor_id, event_type, payload)
    values (p_actor_id, 'friend.blocked', jsonb_build_object('target_uid', p_target_id));
    return;
  end if;

  if p_action = 'unblock' then
    if relation.status <> 'blocked' or relation.blocked_by <> p_actor_id then
      raise exception 'Blocked profile not found';
    end if;
    delete from public.friendships where user_low_id = low_id and user_high_id = high_id;
    insert into public.audit_events (actor_id, event_type, payload)
    values (p_actor_id, 'friend.unblocked', jsonb_build_object('target_uid', p_target_id));
    return;
  end if;

  raise exception 'Unsupported friendship action';
end;
$$;

alter table public.friendships enable row level security;

revoke all on public.friendships from anon, authenticated;
grant all on public.friendships to service_role;

revoke all on function public.ensure_kumo_profile(text, text, text, text) from public, anon, authenticated;
revoke all on function public.mutate_kumo_friendship(text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_kumo_profile(text, text, text, text) to service_role;
grant execute on function public.mutate_kumo_friendship(text, text, text) to service_role;
