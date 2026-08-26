import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = (name: string) => readFileSync(resolve(process.cwd(), "supabase", "migrations", name), "utf8");

describe("production database migrations", () => {
  it("adds named recovery history with every supported snapshot kind", () => {
    const source = migration("202608230003_collaboration_history.sql");
    expect(source).toContain("add column if not exists created_by text references public.profiles");
    for (const kind of ["autosave", "checkpoint", "before_restore", "restored"]) {
      expect(source).toContain(`'${kind}'`);
    }
  });

  it("keeps design branches compatible with the board text primary key and enables RLS", () => {
    const source = migration("202608230004_design_branches.sql");
    expect(source).toContain("board_id text not null references public.boards(id)");
    expect(source).toContain("alter table public.document_branches enable row level security");
    expect(source).toContain("to service_role");
  });

  it("finalizes restores and branch merges through transactional database functions", () => {
    const source = migration("202608230005_document_mutation_integrity.sql");
    expect(source).toContain("complete_kumo_branch_merge");
    expect(source).toContain("status = 'merged'");
    expect(source).toContain("complete_kumo_version_restore");
    expect(source).toContain("acquire_kumo_document_lease");
    expect(source).toContain("document_mutation_leases");
    expect(source).toContain("grant execute on function public.complete_kumo_branch_merge");
    expect(source).toContain("to service_role");
  });

  it("creates checkpoints and branch audit records in the same transaction", () => {
    const source = migration("202608230006_atomic_creation_audits.sql");
    expect(source).toContain("create_kumo_checkpoint");
    expect(source).toContain("version.checkpoint_created");
    expect(source).toContain("create_kumo_branch_record");
    expect(source).toContain("branch.created");
    expect(source).toContain("'checksum', created.checksum");
    expect(source).toContain("return to_jsonb(created)");
    expect(source).toContain("grant execute on function public.create_kumo_checkpoint");
    expect(source).toContain("grant execute on function public.create_kumo_branch_record");
  });

  it("shares only an owner-validated set of linked boards in one transaction", () => {
    const source = migration("202608230007_linked_board_sharing.sql");
    expect(source).toContain("share_kumo_board_set");
    expect(source).toContain("remove_kumo_board_member_set");
    expect(source).toContain("board.owner_id = p_actor_id");
    expect(source).toContain("Actor cannot manage every requested board");
    expect(source).toContain("on conflict (board_id, user_id)");
    expect(source).toContain("linkedShare");
    expect(source).toContain("to service_role");
  });

  it("adds stable profiles and a canonical friendship state machine", () => {
    const source = migration("202608240001_friends_profiles.sql");
    expect(source).toContain("create type public.friendship_status as enum ('pending', 'accepted', 'blocked')");
    expect(source).toContain("primary key (user_low_id, user_high_id)");
    expect(source).toContain("check (user_low_id < user_high_id)");
    expect(source).toContain("ensure_kumo_profile");
    expect(source).toContain("mutate_kumo_friendship");
    expect(source).toContain("friends_of_friends");
    expect(source).toContain("grant execute on function public.mutate_kumo_friendship");
    expect(source).toContain("to service_role");
  });

  it("adds product workspaces, libraries, governed sharing, templates, reviews, and notifications with compatible keys", () => {
    const source = migration("202608240002_product_completeness.sql");
    for (const table of ["workspaces", "workspace_members", "workspace_folders", "board_organization", "account_notifications", "design_libraries", "design_library_versions", "design_library_subscriptions", "board_access_requests", "board_share_links", "board_templates", "branch_reviews"]) {
      expect(source).toContain(`create table if not exists public.${table}`);
      expect(source).toContain(`alter table public.${table} enable row level security`);
    }
    expect(source).not.toMatch(/(?:source_)?board_id uuid[^\n]*references public\.boards/);
    expect(source).toContain("board_id text not null references public.boards(id)");
    expect(source).toContain("token_hash text not null unique");
    expect(source).toContain("last_used_at timestamptz");
  });

  it("ties branch review decisions to the exact reviewed document", () => {
    const source = migration("202608240003_branch_review_gating.sql");
    expect(source).toContain("add column if not exists reviewed_checksum text");
    expect(source).toContain("branch_reviews_blocking_idx");
  });

  it("adds transactional invitations, ownership transfers, delivery, extensions, and community governance", () => {
    const source = migration("202608240004_product_maturity_platform.sql");
    for (const table of ["board_invitations", "workspace_invitations", "notification_preferences", "branch_conflicts", "prototype_share_links", "extension_catalog", "installed_extensions", "community_publications", "community_reports", "api_rate_limits", "account_deletion_requests"]) {
      expect(source).toContain(`create table if not exists public.${table}`);
    }
    for (const mutation of ["transfer_kumo_board_ownership", "create_or_refresh_kumo_board_invitation", "accept_kumo_board_invitation", "create_or_refresh_kumo_workspace_invitation", "accept_kumo_workspace_invitation", "transfer_kumo_workspace_ownership", "consume_kumo_rate_limit"]) {
      expect(source).toContain(`function public.${mutation}`);
      expect(source).toContain(`grant execute on function public.${mutation}`);
    }
    expect(source).toContain("for update");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("last_sent_at timestamptz not null default now()");
    expect(source).toContain("enable row level security");
    expect(source).toContain("to service_role");
  });

  it("adds guest sessions, push delivery, workspace fonts, and performance telemetry with service-only access", () => {
    const source = migration("202608250001_advanced_collaboration.sql");
    for (const table of ["board_open_sessions", "push_subscriptions", "workspace_fonts", "performance_events"]) {
      expect(source).toContain(`create table if not exists public.${table}`);
      expect(source).toContain(`alter table public.${table} enable row level security`);
      expect(source).toContain(`revoke all on public.${table} from anon, authenticated`);
      expect(source).toContain(`grant all on table public.${table} to service_role`);
    }
    expect(source).toContain("token_hash text not null unique");
    expect(source).toContain("password_hash text");
    expect(source).toContain("role text not null default 'viewer' check (role in ('viewer', 'editor'))");
    expect(source).toContain("endpoint text not null unique");
    expect(source).toContain("workspace-fonts");
    expect(source).toContain("allowed_mime_types");
    expect(source).not.toContain("board_id uuid");
  });

  it("ships the reliability release with atomic claims, protected workspace roles, and durable cleanup", () => {
    const source = migration("202608250002_reliability_release.sql");
    for (const mutation of [
      "claim_due_kumo_account_deletions",
      "claim_kumo_onboarding",
      "complete_kumo_onboarding",
      "release_kumo_onboarding",
      "schedule_kumo_account_deletion",
      "cancel_kumo_account_deletion",
      "restore_kumo_board",
      "claim_expired_kumo_boards",
      "upsert_kumo_workspace_member",
      "update_kumo_workspace_member",
      "moderate_kumo_community_report",
      "apply_kumo_board_access_change",
      "create_kumo_board_access_request",
      "resolve_kumo_board_access_request",
      "enqueue_kumo_storage_cleanup",
      "claim_due_kumo_storage_cleanups",
    ]) {
      expect(source).toContain(`function public.${mutation}`);
      expect(source).toContain(`grant execute on function public.${mutation}`);
    }
    expect(source).toContain("for update skip locked");
    expect(source).toContain("Workspace owner role cannot be changed by invitation");
    expect(source).toContain("The workspace owner cannot be demoted");
    expect(source).toContain("create table if not exists public.storage_cleanup_jobs");
    expect(source).toContain("'access-request', 'access-change', 'system'");
    expect(source).toContain("alter table public.storage_cleanup_jobs enable row level security");
    expect(source).toContain("on delete set null");
    expect(source).toMatch(/update public\.boards board\s+set workspace_id = \(\s+select member\.workspace_id[\s\S]*?member\.user_id = board\.owner_id[\s\S]*?\)\s+where board\.workspace_id is null;/);
    expect(source).not.toContain("from lateral");
    expect(source).toMatch(/function public\.assign_kumo_board_workspace\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/);
    expect(source).toContain("revoke all on function public.assign_kumo_board_workspace() from public, anon, authenticated");
    expect(source).toContain("grant execute on function public.assign_kumo_board_workspace() to service_role");
    expect(source).toContain("create table if not exists public.kumo_schema_releases");
    expect(source).toContain("alter table public.kumo_schema_releases enable row level security");
    expect(source).toContain("grant select on public.kumo_schema_releases to service_role");
    expect(source.trimEnd()).toMatch(/values \('202608250002'\)\s+on conflict \(version\) do nothing;$/);
  });

  it("adds complete product-flow coverage projections, policies, runs, gates, evidence, and service isolation", () => {
    const source = migration("202608260001_product_coverage.sql");
    for (const table of [
      "product_flows", "product_flow_nodes", "product_flow_edges", "coverage_policies",
      "coverage_runs", "coverage_run_inputs", "coverage_findings", "coverage_suppressions",
      "coverage_merge_gates", "coverage_gate_overrides", "coverage_telemetry_events",
    ]) {
      expect(source).toContain(`create table if not exists public.${table}`);
      expect(source).toContain(`alter table public.${table} enable row level security`);
    }
    expect(source).toContain("sync_kumo_product_coverage_projection");
    expect(source).toContain("sync_kumo_board_links_and_product_coverage");
    expect(source).toContain("save_kumo_product_flow");
    expect(source).toContain("coverage_runs_reject_update");
    expect(source).toContain("Coverage runs are immutable");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("Coverage projection payloads must be arrays");
    expect(source).toContain("revoke all on function public.sync_kumo_product_coverage_projection");
    expect(source).toContain("to service_role");
    expect(source).not.toContain("board_id uuid");
    expect(source.trimEnd()).toMatch(/values \('202608260001'\)\s+on conflict \(version\) do nothing;$/);
  });
});
