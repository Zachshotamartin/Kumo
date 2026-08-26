create table if not exists public.product_flows (
  id text primary key check (char_length(id) between 1 and 160),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  start_board_id text not null references public.boards(id) on delete cascade,
  start_frame_id text not null check (char_length(start_frame_id) between 1 and 200),
  criticality text not null default 'required' check (criticality in ('critical', 'required', 'optional')),
  owner_id text references public.profiles(firebase_uid) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_flows_workspace_status_idx on public.product_flows(workspace_id, status, updated_at desc);

create table if not exists public.product_flow_nodes (
  board_id text not null references public.boards(id) on delete cascade,
  frame_id text not null,
  screen_key text not null,
  state_kind text not null check (state_kind in ('default', 'loading', 'empty', 'error', 'success', 'offline', 'unauthorized', 'not-found', 'confirmation', 'custom')),
  custom_state text,
  flow_ids text[] not null default '{}',
  roles text[] not null default '{}',
  viewport text not null check (viewport in ('mobile', 'tablet', 'desktop', 'responsive')),
  criticality text not null check (criticality in ('critical', 'required', 'optional')),
  requirement_refs text[] not null default '{}',
  annotated boolean not null default false,
  document_checksum text,
  updated_at timestamptz not null default now(),
  primary key (board_id, frame_id)
);
create index if not exists product_flow_nodes_flow_ids_idx on public.product_flow_nodes using gin(flow_ids);
create index if not exists product_flow_nodes_screen_idx on public.product_flow_nodes(board_id, screen_key, state_kind);

create table if not exists public.product_flow_edges (
  source_board_id text not null references public.boards(id) on delete cascade,
  interaction_id text not null,
  source_frame_id text not null,
  target_board_id text references public.boards(id) on delete set null,
  target_frame_id text,
  trigger_kind text not null,
  action_kind text not null,
  condition jsonb,
  is_fallback boolean not null default false,
  document_checksum text,
  updated_at timestamptz not null default now(),
  primary key (source_board_id, interaction_id)
);
create index if not exists product_flow_edges_target_idx on public.product_flow_edges(target_board_id, target_frame_id);

create table if not exists public.coverage_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  version integer not null check (version > 0),
  config jsonb not null,
  active boolean not null default true,
  created_by text references public.profiles(firebase_uid) on delete set null,
  created_at timestamptz not null default now(),
  unique(workspace_id, version)
);
create unique index if not exists coverage_policies_one_active_idx on public.coverage_policies(workspace_id) where active;

create table if not exists public.coverage_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  root_board_id text not null references public.boards(id) on delete cascade,
  branch_id uuid references public.document_branches(id) on delete set null,
  policy_id uuid references public.coverage_policies(id) on delete set null,
  policy_version integer not null,
  revision_key text not null,
  root_checksum text not null,
  score integer not null check (score between 0 and 100),
  critical_blockers integer not null check (critical_blockers >= 0),
  result jsonb not null,
  status text not null default 'complete' check (status in ('complete', 'failed')),
  created_by text references public.profiles(firebase_uid) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coverage_runs_board_created_idx on public.coverage_runs(root_board_id, branch_id, created_at desc);

create table if not exists public.coverage_run_inputs (
  run_id uuid not null references public.coverage_runs(id) on delete cascade,
  board_id text not null references public.boards(id) on delete cascade,
  room_id text not null,
  checksum text not null,
  primary key(run_id, board_id)
);

create table if not exists public.coverage_findings (
  run_id uuid not null references public.coverage_runs(id) on delete cascade,
  fingerprint text not null,
  rule text not null,
  severity text not null check (severity in ('critical', 'error', 'warning', 'info')),
  board_id text references public.boards(id) on delete set null,
  frame_id text,
  flow_id text,
  message text not null,
  evidence jsonb not null default '{}',
  suppressed boolean not null default false,
  primary key(run_id, fingerprint)
);
create index if not exists coverage_findings_active_idx on public.coverage_findings(run_id, severity) where not suppressed;

create table if not exists public.coverage_suppressions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fingerprint text not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  owner_id text not null references public.profiles(firebase_uid) on delete cascade,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id, fingerprint)
);

create table if not exists public.coverage_merge_gates (
  board_id text primary key references public.boards(id) on delete cascade,
  mode text not null default 'advisory' check (mode in ('off', 'advisory', 'enforced')),
  minimum_score integer not null default 90 check (minimum_score between 0 and 100),
  block_critical_regressions boolean not null default true,
  updated_by text references public.profiles(firebase_uid) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.coverage_gate_overrides (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  branch_id uuid not null references public.document_branches(id) on delete cascade,
  run_id uuid references public.coverage_runs(id) on delete set null,
  actor_id text not null references public.profiles(firebase_uid) on delete cascade,
  reason text not null check (char_length(reason) between 8 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists coverage_gate_overrides_branch_idx on public.coverage_gate_overrides(branch_id, created_at desc);

create table if not exists public.coverage_telemetry_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id text references public.boards(id) on delete set null,
  screen_key text not null check (char_length(screen_key) between 1 and 160),
  state_kind text not null check (char_length(state_kind) between 1 and 80),
  role_key text,
  viewport text check (viewport is null or viewport in ('mobile', 'tablet', 'desktop', 'responsive')),
  outcome text not null check (outcome in ('entered', 'success', 'failure', 'abandoned')),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 86400000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists coverage_telemetry_workspace_time_idx on public.coverage_telemetry_events(workspace_id, occurred_at desc);

alter table public.product_flows enable row level security;
alter table public.product_flow_nodes enable row level security;
alter table public.product_flow_edges enable row level security;
alter table public.coverage_policies enable row level security;
alter table public.coverage_runs enable row level security;
alter table public.coverage_run_inputs enable row level security;
alter table public.coverage_findings enable row level security;
alter table public.coverage_suppressions enable row level security;
alter table public.coverage_merge_gates enable row level security;
alter table public.coverage_gate_overrides enable row level security;
alter table public.coverage_telemetry_events enable row level security;

revoke all on public.product_flows, public.product_flow_nodes, public.product_flow_edges,
  public.coverage_policies, public.coverage_runs, public.coverage_run_inputs,
  public.coverage_findings, public.coverage_suppressions, public.coverage_merge_gates,
  public.coverage_gate_overrides, public.coverage_telemetry_events from anon, authenticated;
grant all on public.product_flows, public.product_flow_nodes, public.product_flow_edges,
  public.coverage_policies, public.coverage_runs, public.coverage_run_inputs,
  public.coverage_findings, public.coverage_suppressions, public.coverage_merge_gates,
  public.coverage_gate_overrides, public.coverage_telemetry_events to service_role;
grant usage, select on sequence public.coverage_telemetry_events_id_seq to service_role;

create or replace function public.reject_kumo_coverage_run_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.id, new.workspace_id, new.root_board_id, new.policy_version,
         new.revision_key, new.root_checksum, new.score, new.critical_blockers,
         new.result, new.status, new.created_at)
     is distinct from
     row(old.id, old.workspace_id, old.root_board_id, old.policy_version,
         old.revision_key, old.root_checksum, old.score, old.critical_blockers,
         old.result, old.status, old.created_at)
     or (new.branch_id is distinct from old.branch_id and new.branch_id is not null)
     or (new.policy_id is distinct from old.policy_id and new.policy_id is not null)
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'Coverage runs are immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_kumo_coverage_run_update() from public, anon, authenticated;

drop trigger if exists coverage_runs_reject_update on public.coverage_runs;
create trigger coverage_runs_reject_update
before update on public.coverage_runs
for each row execute function public.reject_kumo_coverage_run_update();

create or replace function public.save_kumo_product_flow(
  p_id text,
  p_workspace_id uuid,
  p_name text,
  p_description text,
  p_start_board_id text,
  p_start_frame_id text,
  p_criticality text,
  p_owner_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.product_flows%rowtype;
begin
  insert into public.product_flows(
    id, workspace_id, name, description, start_board_id, start_frame_id,
    criticality, owner_id, status, updated_at
  ) values (
    p_id, p_workspace_id, p_name, p_description, p_start_board_id,
    p_start_frame_id, p_criticality, p_owner_id, p_status, now()
  )
  on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      start_frame_id = excluded.start_frame_id,
      criticality = excluded.criticality,
      owner_id = excluded.owner_id,
      status = excluded.status,
      updated_at = now()
  where public.product_flows.workspace_id = excluded.workspace_id
    and public.product_flows.start_board_id = excluded.start_board_id
  returning * into saved;

  if saved.id is null then
    raise exception 'The journey id belongs to a different board or workspace' using errcode = '42501';
  end if;

  return to_jsonb(saved);
end;
$$;

revoke all on function public.save_kumo_product_flow(text, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_kumo_product_flow(text, uuid, text, text, text, text, text, text, text) to service_role;

create or replace function public.create_kumo_coverage_policy_version(
  p_workspace_id uuid,
  p_name text,
  p_config jsonb,
  p_created_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  created_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  select coalesce(max(version), 0) + 1
  into next_version
  from public.coverage_policies
  where workspace_id = p_workspace_id;

  update public.coverage_policies
  set active = false
  where workspace_id = p_workspace_id and active;

  insert into public.coverage_policies(workspace_id, name, version, config, active, created_by)
  values (
    p_workspace_id,
    left(coalesce(nullif(trim(p_name), ''), 'Product coverage'), 120),
    next_version,
    coalesce(p_config, '{}'::jsonb) || jsonb_build_object('version', next_version),
    true,
    p_created_by
  )
  returning id into created_id;

  return jsonb_build_object('id', created_id, 'version', next_version);
end;
$$;

revoke all on function public.create_kumo_coverage_policy_version(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_kumo_coverage_policy_version(uuid, text, jsonb, text) to service_role;

create or replace function public.persist_kumo_coverage_run(
  p_run_id uuid,
  p_workspace_id uuid,
  p_root_board_id text,
  p_branch_id uuid,
  p_policy_id uuid,
  p_policy_version integer,
  p_revision_key text,
  p_root_checksum text,
  p_score integer,
  p_critical_blockers integer,
  p_result jsonb,
  p_created_by text,
  p_inputs jsonb,
  p_findings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coverage_runs(
    id, workspace_id, root_board_id, branch_id, policy_id, policy_version,
    revision_key, root_checksum, score, critical_blockers, result, status, created_by
  ) values (
    p_run_id, p_workspace_id, p_root_board_id, p_branch_id, p_policy_id,
    p_policy_version, p_revision_key, p_root_checksum, p_score,
    p_critical_blockers, p_result, 'complete', p_created_by
  );

  insert into public.coverage_run_inputs(run_id, board_id, room_id, checksum)
  select p_run_id, input.board_id, input.room_id, input.checksum
  from jsonb_to_recordset(coalesce(p_inputs, '[]'::jsonb)) as input(
    board_id text, room_id text, checksum text
  );

  insert into public.coverage_findings(
    run_id, fingerprint, rule, severity, board_id, frame_id, flow_id,
    message, evidence, suppressed
  )
  select
    p_run_id, finding.fingerprint, finding.rule, finding.severity,
    nullif(finding.board_id, ''), nullif(finding.frame_id, ''),
    nullif(finding.flow_id, ''), finding.message,
    coalesce(finding.evidence, '{}'::jsonb), coalesce(finding.suppressed, false)
  from jsonb_to_recordset(coalesce(p_findings, '[]'::jsonb)) as finding(
    fingerprint text, rule text, severity text, board_id text, frame_id text,
    flow_id text, message text, evidence jsonb, suppressed boolean
  );

  return p_run_id;
end;
$$;

revoke all on function public.persist_kumo_coverage_run(uuid, uuid, text, uuid, uuid, integer, text, text, integer, integer, jsonb, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_kumo_coverage_run(uuid, uuid, text, uuid, uuid, integer, text, text, integer, integer, jsonb, text, jsonb, jsonb) to service_role;

create or replace function public.sync_kumo_product_coverage_projection(
  p_source_board_id text,
  p_nodes jsonb,
  p_edges jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(coalesce(p_nodes, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_edges, '[]'::jsonb)) <> 'array' then
    raise exception 'Coverage projection payloads must be arrays';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coverage-projection:' || p_source_board_id, 0));
  delete from public.product_flow_edges where source_board_id = p_source_board_id;
  delete from public.product_flow_nodes where board_id = p_source_board_id;

  insert into public.product_flow_nodes(
    board_id, frame_id, screen_key, state_kind, custom_state, flow_ids, roles,
    viewport, criticality, requirement_refs, annotated, document_checksum
  )
  select p_source_board_id, node.frame_id, node.screen_key, node.state_kind,
    nullif(node.custom_state, ''), coalesce(node.flow_ids, '{}'), coalesce(node.roles, '{}'),
    node.viewport, node.criticality, coalesce(node.requirement_refs, '{}'), node.annotated,
    nullif(node.document_checksum, '')
  from jsonb_to_recordset(coalesce(p_nodes, '[]'::jsonb)) as node(
    frame_id text, screen_key text, state_kind text, custom_state text, flow_ids text[],
    roles text[], viewport text, criticality text, requirement_refs text[],
    annotated boolean, document_checksum text
  )
  where node.frame_id is not null and node.screen_key is not null;

  insert into public.product_flow_edges(
    source_board_id, interaction_id, source_frame_id, target_board_id, target_frame_id,
    trigger_kind, action_kind, condition, is_fallback, document_checksum
  )
  select p_source_board_id, edge.interaction_id, edge.source_frame_id,
    case when target.id is null then null else edge.target_board_id end,
    edge.target_frame_id, edge.trigger_kind, edge.action_kind, edge.condition,
    coalesce(edge.is_fallback, false), nullif(edge.document_checksum, '')
  from jsonb_to_recordset(coalesce(p_edges, '[]'::jsonb)) as edge(
    interaction_id text, source_frame_id text, target_board_id text, target_frame_id text,
    trigger_kind text, action_kind text, condition jsonb, is_fallback boolean,
    document_checksum text
  )
  left join public.boards target on target.id = edge.target_board_id and target.deleted_at is null
  where edge.interaction_id is not null and edge.source_frame_id is not null;
end;
$$;

revoke all on function public.sync_kumo_product_coverage_projection(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kumo_product_coverage_projection(text, jsonb, jsonb) to service_role;

create or replace function public.sync_kumo_board_links_and_product_coverage(
  p_source_board_id text,
  p_links jsonb,
  p_nodes jsonb,
  p_edges jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_kumo_board_links(p_source_board_id, p_links);
  perform public.sync_kumo_product_coverage_projection(p_source_board_id, p_nodes, p_edges);
end;
$$;

revoke all on function public.sync_kumo_board_links_and_product_coverage(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kumo_board_links_and_product_coverage(text, jsonb, jsonb, jsonb) to service_role;

insert into public.kumo_schema_releases(version)
values ('202608260001')
on conflict (version) do nothing;
