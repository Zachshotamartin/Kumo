create extension if not exists pgcrypto;

do $$
begin
  create type public.board_visibility as enum ('private', 'public');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.board_role as enum ('owner', 'editor', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  firebase_uid text primary key,
  email text not null,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create table if not exists public.boards (
  id text primary key,
  owner_id text not null references public.profiles(firebase_uid) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  visibility public.board_visibility not null default 'private',
  liveblocks_room_id text not null unique,
  thumbnail_asset_id uuid,
  legacy_rtdb_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists boards_owner_updated_idx
  on public.boards (owner_id, updated_at desc)
  where deleted_at is null;

create index if not exists boards_public_title_idx
  on public.boards (lower(title), updated_at desc)
  where visibility = 'public' and deleted_at is null;

create table if not exists public.board_members (
  board_id text not null references public.boards(id) on delete cascade,
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  role public.board_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create unique index if not exists one_owner_per_board_idx
  on public.board_members (board_id)
  where role = 'owner';

create index if not exists board_members_user_idx
  on public.board_members (user_id, updated_at desc);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  uploader_id text not null references public.profiles(firebase_uid) on delete restrict,
  storage_key text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now()
);

alter table public.boards
  drop constraint if exists boards_thumbnail_asset_id_fkey;
alter table public.boards
  add constraint boards_thumbnail_asset_id_fkey
  foreign key (thumbnail_asset_id) references public.assets(id) on delete set null;

create table if not exists public.document_snapshots (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  liveblocks_room_id text not null,
  document jsonb not null,
  checksum text,
  created_at timestamptz not null default now()
);

create index if not exists document_snapshots_board_created_idx
  on public.document_snapshots (board_id, created_at desc);

create table if not exists public.board_links (
  source_board_id text not null references public.boards(id) on delete cascade,
  target_board_id text not null references public.boards(id) on delete cascade,
  shape_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_board_id, shape_id),
  check (source_board_id <> target_board_id)
);

create index if not exists board_links_target_idx
  on public.board_links (target_board_id, updated_at desc);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  board_id text references public.boards(id) on delete set null,
  actor_id text references public.profiles(firebase_uid) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_board_created_idx
  on public.audit_events (board_id, created_at desc);

create or replace function public.create_kumo_board(
  p_id text,
  p_owner_id text,
  p_title text,
  p_room_id text,
  p_visibility public.board_visibility default 'private',
  p_legacy_rtdb_id text default null
)
returns public.boards
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_board public.boards;
begin
  insert into public.boards (
    id, owner_id, title, visibility, liveblocks_room_id, legacy_rtdb_id
  ) values (
    p_id, p_owner_id, left(coalesce(nullif(trim(p_title), ''), 'Untitled board'), 120),
    p_visibility, p_room_id, p_legacy_rtdb_id
  )
  returning * into created_board;

  insert into public.board_members (board_id, user_id, role)
  values (p_id, p_owner_id, 'owner');

  insert into public.audit_events (board_id, actor_id, event_type)
  values (p_id, p_owner_id, 'board.created');

  return created_board;
end;
$$;

create or replace function public.soft_delete_kumo_board(
  p_board_id text,
  p_actor_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.boards
  set deleted_at = now()
  where id = p_board_id and owner_id = p_actor_id and deleted_at is null;

  if not found then
    raise exception 'Board not found or actor is not the owner';
  end if;

  insert into public.audit_events (board_id, actor_id, event_type)
  values (p_board_id, p_actor_id, 'board.deleted');
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
before update on public.boards
for each row execute function public.set_updated_at();

drop trigger if exists board_members_set_updated_at on public.board_members;
create trigger board_members_set_updated_at
before update on public.board_members
for each row execute function public.set_updated_at();

drop trigger if exists board_links_set_updated_at on public.board_links;
create trigger board_links_set_updated_at
before update on public.board_links
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.assets enable row level security;
alter table public.document_snapshots enable row level security;
alter table public.board_links enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.boards from anon, authenticated;
revoke all on public.board_members from anon, authenticated;
revoke all on public.assets from anon, authenticated;
revoke all on public.document_snapshots from anon, authenticated;
revoke all on public.board_links from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant all on public.profiles to service_role;
grant all on public.boards to service_role;
grant all on public.board_members to service_role;
grant all on public.assets to service_role;
grant all on public.document_snapshots to service_role;
grant all on public.board_links to service_role;
grant all on public.audit_events to service_role;
grant usage, select on sequence public.audit_events_id_seq to service_role;
revoke all on function public.create_kumo_board(text, text, text, text, public.board_visibility, text) from public, anon, authenticated;
revoke all on function public.soft_delete_kumo_board(text, text) from public, anon, authenticated;
grant execute on function public.create_kumo_board(text, text, text, text, public.board_visibility, text) to service_role;
grant execute on function public.soft_delete_kumo_board(text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-assets',
  'board-assets',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
