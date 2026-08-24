create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id text not null references public.profiles(firebase_uid) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.workspace_folders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_by text not null references public.profiles(firebase_uid) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_organization (
  board_id text not null references public.boards(id) on delete cascade,
  user_id text not null references public.profiles(firebase_uid) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  folder_id uuid references public.workspace_folders(id) on delete set null,
  favorite boolean not null default false,
  archived_at timestamptz,
  trashed_at timestamptz,
  primary key (board_id, user_id)
);

create table if not exists public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null references public.profiles(firebase_uid) on delete cascade,
  actor_id text references public.profiles(firebase_uid) on delete set null,
  board_id text references public.boards(id) on delete cascade,
  kind text not null check (kind in ('comment', 'mention', 'reaction', 'share', 'friend', 'library', 'branch', 'access-request', 'system')),
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '',
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists account_notifications_recipient_idx on public.account_notifications(recipient_id, read_at, created_at desc);

create table if not exists public.design_libraries (
  id uuid primary key default gen_random_uuid(),
  source_board_id text not null references public.boards(id) on delete cascade,
  owner_id text not null references public.profiles(firebase_uid) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'workspace', 'public')),
  latest_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_board_id)
);

create table if not exists public.design_library_versions (
  library_id uuid not null references public.design_libraries(id) on delete cascade,
  version integer not null check (version > 0),
  description text not null default '',
  assets jsonb not null default '[]'::jsonb,
  created_by text not null references public.profiles(firebase_uid) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (library_id, version)
);

create table if not exists public.design_library_subscriptions (
  library_id uuid not null references public.design_libraries(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  accepted_version integer not null default 0,
  subscribed_by text not null references public.profiles(firebase_uid) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (library_id, board_id)
);

create table if not exists public.board_access_requests (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  requester_id text not null references public.profiles(firebase_uid) on delete cascade,
  requested_role public.board_role not null default 'viewer',
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
  resolved_by text references public.profiles(firebase_uid) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(board_id, requester_id, status)
);

create table if not exists public.board_share_links (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  token_hash text not null unique,
  role public.board_role not null default 'viewer' check (role <> 'owner'),
  allowed_domain text,
  expires_at timestamptz,
  created_by text not null references public.profiles(firebase_uid) on delete cascade,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.board_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles(firebase_uid) on delete cascade,
  source_board_id text references public.boards(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branch_reviews (
  branch_id uuid not null references public.document_branches(id) on delete cascade,
  reviewer_id text not null references public.profiles(firebase_uid) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'approved', 'changes-requested')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, reviewer_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_folders enable row level security;
alter table public.board_organization enable row level security;
alter table public.account_notifications enable row level security;
alter table public.design_libraries enable row level security;
alter table public.design_library_versions enable row level security;
alter table public.design_library_subscriptions enable row level security;
alter table public.board_access_requests enable row level security;
alter table public.board_share_links enable row level security;
alter table public.board_templates enable row level security;
alter table public.branch_reviews enable row level security;
