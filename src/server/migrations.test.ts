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
});
