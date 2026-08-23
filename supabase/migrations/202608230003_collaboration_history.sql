alter table public.document_snapshots
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists created_by text references public.profiles(firebase_uid) on delete set null,
  add column if not exists kind text not null default 'autosave';

alter table public.document_snapshots
  drop constraint if exists document_snapshots_kind_check;
alter table public.document_snapshots
  add constraint document_snapshots_kind_check
  check (kind in ('autosave', 'checkpoint', 'before_restore', 'restored'));

create index if not exists document_snapshots_named_board_created_idx
  on public.document_snapshots (board_id, created_at desc)
  where name is not null;
