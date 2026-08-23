create table if not exists public.document_branches (
  id uuid primary key,
  board_id text not null references public.boards(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  room_id text not null unique,
  created_by text references public.profiles(firebase_uid) on delete set null,
  status text not null default 'open' check (status in ('open', 'merged', 'archived')),
  base_checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merged_at timestamptz
);

create index if not exists document_branches_board_status_idx
  on public.document_branches(board_id, status, updated_at desc);

alter table public.document_branches enable row level security;

drop policy if exists "service role manages document branches" on public.document_branches;
create policy "service role manages document branches"
  on public.document_branches
  for all
  to service_role
  using (true)
  with check (true);
