import { supabaseAdmin } from "./_supabase.js";

export interface CoverageGateDecision {
  blocked: boolean;
  code?: "COVERAGE_GATE_FAILED" | "COVERAGE_RUN_REQUIRED";
  error?: string;
  run?: { id: string; score: number; critical_blockers: number; root_checksum: string } | null;
}

export const checkCoverageMergeGate = async (boardId: string, branchId: string, branchChecksum: string): Promise<CoverageGateDecision> => {
  const database = supabaseAdmin();
  const { data: gate, error: gateError } = await database.from("coverage_merge_gates")
    .select("mode, minimum_score, block_critical_regressions")
    .eq("board_id", boardId).maybeSingle();
  if (gateError) throw gateError;
  if (gate?.mode !== "enforced") return { blocked: false };
  const { data: run, error: runError } = await database.from("coverage_runs")
    .select("id, score, critical_blockers, root_checksum")
    .eq("root_board_id", boardId).eq("branch_id", branchId).eq("root_checksum", branchChecksum)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (runError) throw runError;
  if (!run) return { blocked: true, code: "COVERAGE_RUN_REQUIRED", error: "Run product coverage on the current branch revision before merging.", run: null };
  const blocked = Number(run.score) < Number(gate.minimum_score) || (gate.block_critical_regressions && Number(run.critical_blockers) > 0);
  return blocked
    ? { blocked: true, code: "COVERAGE_GATE_FAILED", error: `Coverage must reach ${gate.minimum_score}% with no critical blockers before merging.`, run }
    : { blocked: false, run };
};
