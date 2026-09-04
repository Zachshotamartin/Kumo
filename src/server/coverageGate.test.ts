import { checkCoverageMergeGate } from "../../server/api/_coverageGate";

const mocks = vi.hoisted(() => ({
  queues: new Map<string, Array<{ data: unknown; error: unknown }>>(),
}));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({ from: (table: string) => query(table) }),
}));

const next = (table: string) => mocks.queues.get(table)?.shift() ?? { data: null, error: null };
const query = (table: string) => {
  const builder: Record<string, unknown> = {};
  for (const operation of ["select", "eq", "order", "limit"]) builder[operation] = () => builder;
  builder.maybeSingle = () => Promise.resolve(next(table));
  return builder;
};
const enqueue = (table: string, ...results: Array<{ data?: unknown; error?: unknown }>) => mocks.queues.set(table, results.map((item) => ({ data: item.data ?? null, error: item.error ?? null })));

describe("checksum-bound coverage merge gate", () => {
  beforeEach(() => mocks.queues.clear());

  it("allows absent, off, and advisory gates without querying runs", async () => {
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toEqual({ blocked: false });
    enqueue("coverage_merge_gates", { data: { mode: "off" } });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toEqual({ blocked: false });
    enqueue("coverage_merge_gates", { data: { mode: "advisory" } });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toEqual({ blocked: false });
  });

  it("requires a run for the exact enforced branch checksum", async () => {
    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 90, block_critical_regressions: true } });
    enqueue("coverage_runs", { data: null });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toEqual({ blocked: true, code: "COVERAGE_RUN_REQUIRED", error: "Run product coverage on the current branch revision before merging.", run: null });
  });

  it("blocks low scores and critical blockers but accepts a passing run", async () => {
    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 90, block_critical_regressions: false } });
    enqueue("coverage_runs", { data: { id: "low", score: 89, critical_blockers: 0, root_checksum: "hash" } });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toMatchObject({ blocked: true, code: "COVERAGE_GATE_FAILED", run: { id: "low" } });

    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 90, block_critical_regressions: true } });
    enqueue("coverage_runs", { data: { id: "critical", score: 100, critical_blockers: 1, root_checksum: "hash" } });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toMatchObject({ blocked: true, code: "COVERAGE_GATE_FAILED" });

    const passing = { id: "pass", score: 90, critical_blockers: 0, root_checksum: "hash" };
    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 90, block_critical_regressions: true } });
    enqueue("coverage_runs", { data: passing });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).resolves.toEqual({ blocked: false, run: passing });
  });

  it("surfaces gate and run query failures", async () => {
    enqueue("coverage_merge_gates", { error: new Error("gate failed") });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).rejects.toThrow("gate failed");
    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 90, block_critical_regressions: true } });
    enqueue("coverage_runs", { error: new Error("run failed") });
    await expect(checkCoverageMergeGate("board", "branch", "hash")).rejects.toThrow("run failed");
  });
});
