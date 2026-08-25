#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

psql "$database_url" --set ON_ERROR_STOP=1 <<'SQL'
do $$ begin create role anon noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role noinherit; exception when duplicate_object then null; end $$;
alter role service_role bypassrls;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
SQL

for pass in first idempotency; do
  for migration in supabase/migrations/*.sql; do
    echo "Applying $pass pass: $migration"
    psql "$database_url" --set ON_ERROR_STOP=1 --file "$migration"
  done
done

psql "$database_url" --set ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  disabled_tables text;
  leaked_privileges text;
  leaked_functions text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
  into disabled_tables
  from pg_tables
  where schemaname = 'public' and not rowsecurity;
  if disabled_tables is not null then
    raise exception 'RLS is disabled for: %', disabled_tables;
  end if;

  select string_agg(
    format('%s can %s on %I.%I', role_name, privilege, schemaname, tablename),
    ', ' order by role_name, tablename, privilege
  )
  into leaked_privileges
  from pg_tables
  cross join (values ('anon'), ('authenticated')) as roles(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privileges(privilege)
  where schemaname = 'public'
    and has_table_privilege(role_name::name, format('%I.%I', schemaname, tablename), privilege);
  if leaked_privileges is not null then
    raise exception 'Untrusted table privileges remain: %', leaked_privileges;
  end if;

  select string_agg(
    format('%s can execute %I.%I(%s)', role_name, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
    ', ' order by role_name, p.proname
  )
  into leaked_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as roles(role_name)
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege(role_name::name, p.oid, 'EXECUTE');
  if leaked_functions is not null then
    raise exception 'Untrusted SECURITY DEFINER execution privileges remain: %', leaked_functions;
  end if;
end $$;

set role service_role;

insert into public.profiles (firebase_uid, email, display_name, username)
values ('migration-verifier', 'migration-verifier@example.com', 'Migration verifier', 'migration-verifier')
on conflict (firebase_uid) do update set display_name = excluded.display_name, username = excluded.username;

select public.create_kumo_board(
  'migration-verifier-board',
  'migration-verifier',
  'Migration verifier board',
  'migration-verifier-room'
);

do $$
begin
  if not exists (
    select 1 from public.board_members
    where board_id = 'migration-verifier-board' and user_id = 'migration-verifier' and role = 'owner'
  ) then
    raise exception 'Atomic board creation did not create its owner membership';
  end if;
  if not exists (
    select 1 from public.audit_events
    where board_id = 'migration-verifier-board' and actor_id = 'migration-verifier' and event_type = 'board.created'
  ) then
    raise exception 'Atomic board creation did not create its audit event';
  end if;
end $$;

select public.soft_delete_kumo_board('migration-verifier-board', 'migration-verifier');

do $$
begin
  if not exists (select 1 from public.boards where id = 'migration-verifier-board' and deleted_at is not null) then
    raise exception 'Soft deletion did not mark the board';
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from storage.buckets where id in ('board-assets', 'workspace-fonts')) <> 2 then
    raise exception 'Required private storage buckets are missing';
  end if;
end $$;
SQL

echo "Database migrations passed clean-apply, idempotency, RLS, complete privilege isolation, service-role execution, storage, and transactional behavior checks."
