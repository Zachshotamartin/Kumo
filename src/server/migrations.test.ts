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
});
