import type { VercelRequest, VercelResponse } from "@vercel/node";
import coverageHandler from "../../server/api/handlers/coverage";
import { DEFAULT_COVERAGE_POLICY, type CoverageResult } from "../platform/productCoverage";

const mocks = vi.hoisted(() => ({
  actor: { uid: "owner", email: "owner@example.com" },
  requireActor: vi.fn(),
  getAccess: vi.fn(),
  getDocument: vi.fn(),
  rpc: vi.fn(),
  queues: new Map<string, Array<{ data: unknown; error: unknown }>>(),
  calls: [] as Array<{ table: string; operation: string; value?: unknown }>,
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../server/api/_liveblocks", () => ({ liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }) }));
vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: () => ({ from: (table: string) => query(table), rpc: mocks.rpc }) }));

const next = (table: string) => mocks.queues.get(table)?.shift() ?? { data: null, error: null };
const query = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chain = (operation: string) => (...args: unknown[]) => {
    mocks.calls.push({ table, operation, value: args[0] });
    return builder;
  };
  for (const operation of ["select", "eq", "in", "is", "order", "limit", "update", "insert", "upsert", "delete"]) builder[operation] = chain(operation);
  builder.single = () => Promise.resolve(next(table));
  builder.maybeSingle = () => Promise.resolve(next(table));
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(next(table)).then(resolve, reject);
  return builder;
};
const enqueue = (table: string, ...results: Array<{ data?: unknown; error?: unknown }>) => mocks.queues.set(table, results.map((item) => ({ data: item.data ?? null, error: item.error ?? null })));

const board = { id: "board", owner_id: "owner", title: "Product", visibility: "private", liveblocks_room_id: "board:board", workspace_id: "workspace" };
const frame = { id: "frame", type: "frame", name: "Complete", parentId: null, x1: 0, y1: 0, x2: 320, y2: 200, width: 320, height: 200, level: 0, zIndex: 1, prototypeStart: true, productState: { screenKey: "Complete", state: "success", flowIds: [], roles: [], viewport: "responsive", criticality: "required", requirementRefs: [] } };
const document = { nodes: { frame } };
const request = (method: string, body: Record<string, unknown> = {}, queryValues: Record<string, string> = {}) => ({ method, body, query: queryValues, headers: { authorization: "Bearer token" } }) as unknown as VercelRequest;
const response = () => {
  const value = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; }, send(body: unknown) { this.body = body; return this; }, setHeader(name: string, body: string) { this.headers[name] = body; return this; } };
  return value as unknown as VercelResponse & typeof value;
};
const config = (policy: Record<string, unknown> | null = null) => {
  enqueue("product_flows", { data: [] });
  enqueue("coverage_policies", { data: policy });
  enqueue("coverage_suppressions", { data: [] });
};

describe("product coverage API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queues.clear();
    mocks.calls.length = 0;
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.getDocument.mockResolvedValue(document);
    mocks.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => {
      mocks.calls.push({ table: `rpc:${name}`, operation: "call", value: input });
      if (name === "persist_kumo_coverage_run") return { data: "run", error: null };
      if (name === "save_kumo_product_flow") return { data: { id: "flow", name: "Flow", description: "", start_board_id: "board", start_frame_id: "frame", criticality: "required", owner_id: "owner", status: "active" }, error: null };
      return { data: { id: "new", version: 5 }, error: null };
    });
  });

  it("validates method, board identity, access, workspace membership, and scope", async () => {
    const method = response();
    await coverageHandler(request("DELETE"), method);
    expect(method.statusCode).toBe(405);

    const missing = response();
    await coverageHandler(request("GET"), missing);
    expect(missing).toMatchObject({ statusCode: 400, body: { error: "A board is required." } });

    const missingPostBoard = response();
    await coverageHandler(request("POST"), missingPostBoard);
    expect(missingPostBoard).toMatchObject({ statusCode: 400, body: { error: "A board is required." } });

    mocks.getAccess.mockResolvedValueOnce(null);
    const hidden = response();
    await coverageHandler(request("GET", {}, { boardId: "missing" }), hidden);
    expect(hidden.statusCode).toBe(404);

    mocks.getAccess.mockResolvedValueOnce({ board: { ...board, workspace_id: null }, role: "owner" });
    const unorganized = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), unorganized);
    expect(unorganized.statusCode).toBe(409);

    const unknown = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "wat" }), unknown);
    expect(unknown).toMatchObject({ statusCode: 400, body: { error: "Unknown coverage scope." } });
  });

  it("loads flows, policy, suppressions, history, and the branch gate", async () => {
    enqueue("product_flows", { data: [{ id: "flow", name: "Checkout", description: null, start_board_id: "board", start_frame_id: "frame", criticality: "critical", owner_id: null, status: "archived" }] });
    enqueue("coverage_policies", { data: { id: "policy", name: "Strict", version: 3, config: { minimumScore: 95 } } });
    enqueue("coverage_suppressions", { data: [{ fingerprint: "finding", reason: "N/A", owner_id: "owner", expires_at: "2027-01-01" }] });
    enqueue("coverage_runs", { data: [{ id: "run", score: 97 }] });
    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 95, block_critical_regressions: true } });
    const reply = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ flows: [{ id: "flow", name: "Checkout", description: "", ownerId: null, status: "archived" }], policy: { id: "policy", name: "Strict", version: 3, minimumScore: 95 }, suppressions: [{ fingerprint: "finding", expiresAt: "2027-01-01" }], runs: [{ id: "run" }], gate: { mode: "enforced" }, permissions: { manageGate: true } });
  });

  it("uses default overview policy and advisory gate when no records exist", async () => {
    config();
    enqueue("coverage_runs", { data: null });
    enqueue("coverage_merge_gates", { data: null });
    const reply = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.body).toMatchObject({ policy: DEFAULT_COVERAGE_POLICY, runs: [], gate: { mode: "advisory", minimum_score: 90 } });
  });

  it("normalizes nullable configuration collections and suppression expiry", async () => {
    enqueue("product_flows", { data: null });
    enqueue("coverage_policies", { data: null });
    enqueue("coverage_suppressions", { data: [{ fingerprint: "finding", reason: "Accepted", owner_id: "owner", expires_at: null }] });
    enqueue("coverage_runs", { data: [] });
    enqueue("coverage_merge_gates", { data: null });
    const reply = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.body).toMatchObject({ flows: [], suppressions: [{ fingerprint: "finding", expiresAt: null }] });

    enqueue("product_flows", { data: [] });
    enqueue("coverage_policies", { data: null });
    enqueue("coverage_suppressions", { data: null });
    enqueue("coverage_runs", { data: [] });
    enqueue("coverage_merge_gates", { data: null });
    const emptySuppressions = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), emptySuppressions);
    expect(emptySuppressions.body).toMatchObject({ suppressions: [] });
  });

  it("surfaces each configuration, overview, and workspace-role query failure", async () => {
    enqueue("product_flows", { error: new Error("flows failed") }); enqueue("coverage_policies", { data: null }); enqueue("coverage_suppressions", { data: [] });
    const flowFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), flowFailure);
    expect(flowFailure.body).toEqual({ error: "flows failed" });

    enqueue("product_flows", { data: [] }); enqueue("coverage_policies", { error: new Error("policy failed") }); enqueue("coverage_suppressions", { data: [] });
    const policyFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), policyFailure);
    expect(policyFailure.body).toEqual({ error: "policy failed" });

    enqueue("product_flows", { data: [] }); enqueue("coverage_policies", { data: null }); enqueue("coverage_suppressions", { error: new Error("suppressions failed") });
    const suppressionFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), suppressionFailure);
    expect(suppressionFailure.body).toEqual({ error: "suppressions failed" });

    config(); enqueue("coverage_runs", { error: new Error("runs failed") }); enqueue("coverage_merge_gates", { data: null });
    const runFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), runFailure);
    expect(runFailure.body).toEqual({ error: "runs failed" });

    config(); enqueue("coverage_runs", { data: [] }); enqueue("coverage_merge_gates", { error: new Error("gate failed") });
    const gateFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), gateFailure);
    expect(gateFailure.body).toEqual({ error: "gate failed" });

    config(); enqueue("coverage_runs", { data: [] }); enqueue("coverage_merge_gates", { data: null }); enqueue("workspace_members", { error: new Error("membership failed") });
    const membershipFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), membershipFailure);
    expect(membershipFailure.body).toEqual({ error: "membership failed" });
  });

  it("reports owner, administrator, and editor management permissions", async () => {
    for (const [memberRole, boardRole, expected] of [["owner", "owner", { managePolicy: true, manageGate: true }], ["admin", "editor", { managePolicy: true, manageGate: false }], ["member", "editor", { managePolicy: false, manageGate: false }]] as const) {
      config(); enqueue("coverage_runs", { data: [] }); enqueue("coverage_merge_gates", { data: null }); enqueue("workspace_members", { data: { role: memberRole } });
      mocks.getAccess.mockResolvedValueOnce({ board, role: boardRole });
      const reply = response();
      await coverageHandler(request("GET", {}, { boardId: "board" }), reply);
      expect(reply.body).toMatchObject({ permissions: expected });
    }
  });

  it("previews a bounded current-board analysis without persistence", async () => {
    config();
    enqueue("board_links", { data: [] });
    const reply = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ result: { score: expect.any(Number), graph: { nodes: [expect.objectContaining({ id: "board:frame" })] } }, persisted: null });
  });

  it("normalizes missing storage documents, node collections, and shape IDs", async () => {
    config(); enqueue("board_links", { data: [] });
    mocks.getDocument.mockResolvedValueOnce(null);
    const absent = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), absent);
    expect(absent.body).toMatchObject({ result: { graph: { nodes: [] } } });

    config(); enqueue("board_links", { data: null });
    mocks.getDocument.mockResolvedValueOnce({ nodes: null });
    const invalid = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), invalid);
    expect(invalid.body).toMatchObject({ result: { graph: { nodes: [] } } });

    config(); enqueue("board_links", { data: [] });
    mocks.getDocument.mockResolvedValueOnce({ nodes: { keyed: { ...frame, id: undefined } } });
    const keyed = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), keyed);
    expect(keyed.body).toMatchObject({ result: { graph: { nodes: [expect.objectContaining({ frameId: "keyed" })] } } });
  });

  it("exports latest JSON, JUnit, and SARIF reports and rejects an absent report", async () => {
    enqueue("coverage_runs", { data: null });
    const missing = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "report" }), missing);
    expect(missing.statusCode).toBe(404);

    const coverageResult: CoverageResult = { policy: DEFAULT_COVERAGE_POLICY, score: 100, criticalBlockers: 0, suppressedCount: 0, generatedAt: "", stale: false, graph: { nodes: [], edges: [], flows: [] }, findings: [], categories: {}, flowScores: {} };
    enqueue("coverage_runs", { data: { result: coverageResult } }, { data: { result: coverageResult } }, { data: { result: coverageResult } });
    const json = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "report", format: "invalid" }), json);
    expect(JSON.parse(String(json.body))).toMatchObject({ score: 100 });
    expect(json.headers["Content-Type"]).toContain("application/json");
    const junit = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "report", format: "junit" }), junit);
    expect(junit.body).toContain("testsuite");
    expect(junit.headers["Content-Type"]).toContain("application/xml");
    const sarif = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "report", format: "sarif" }), sarif);
    expect(JSON.parse(String(sarif.body))).toMatchObject({ version: "2.1.0" });
    expect(sarif.headers["Content-Disposition"]).toContain("sarif.json");

    enqueue("coverage_runs", { error: new Error("report unavailable") });
    const branchError = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "report", branchId: "branch" }), branchError);
    expect(branchError).toMatchObject({ statusCode: 500, body: { error: "report unavailable" } });
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "coverage_runs", operation: "eq", value: "branch_id" }));
  });

  it("runs a branch graph, represents inaccessible linked boards, and persists immutable inputs and findings", async () => {
    config({ id: "policy", name: "Tiny", version: 2, config: { requiredStates: ["default"], requiredViewports: [] } });
    enqueue("document_branches", { data: { id: "branch", room_id: "branch:branch", status: "open" } });
    enqueue("board_links", { data: [{ source_board_id: "board", target_board_id: "private" }] }, { data: [] });
    mocks.getAccess.mockImplementation(async (id: string) => id === "private" ? null : { board, role: "owner" });
    mocks.getDocument.mockImplementation(async (roomId: string) => ({
      roomId,
      nodes: {
        frame,
        image: { ...frame, id: "image", type: "image", name: "Illustration", parentId: "frame", prototypeStart: false, productState: undefined },
      },
    }));
    const reply = response();
    await coverageHandler(request("POST", { action: "run", boardId: "board", branchId: "branch" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ persisted: { runId: "run", revisionKey: expect.stringMatching(/^[a-f0-9]{64}$/), rootChecksum: expect.any(String) }, result: { graph: { nodes: expect.arrayContaining([expect.objectContaining({ boardId: "private", accessible: false })]) } } });
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: "rpc:persist_kumo_coverage_run",
      operation: "call",
      value: expect.objectContaining({ p_inputs: expect.any(Array), p_findings: expect.arrayContaining([expect.objectContaining({ flow_id: null })]) }),
    }));
  });

  it("rejects closed branches and excessive graph traversal", async () => {
    config();
    enqueue("document_branches", { data: { status: "archived", room_id: "branch:old" } });
    const closed = response();
    await coverageHandler(request("POST", { action: "run", boardId: "board", branchId: "branch", persist: false }), closed);
    expect(closed.statusCode).toBe(500);
    expect(closed.body).toMatchObject({ error: "This design branch is not open." });

    config({ id: "policy", name: "Bounded", version: 1, config: { maxNodes: 1 } });
    mocks.getDocument.mockResolvedValue({ nodes: { one: frame, two: { ...frame, id: "two" } } });
    enqueue("board_links", { data: [] });
    const large = response();
    await coverageHandler(request("POST", { action: "run", boardId: "board", persist: false }), large);
    expect(large.statusCode).toBe(422);
  });

  it("stops transitive traversal at one hundred boards and never follows private topology", async () => {
    config();
    enqueue("board_links", ...Array.from({ length: 100 }, (_, index) => ({ data: [{ source_board_id: index ? `target-${index}` : "board", target_board_id: `target-${index + 1}` }] })));
    mocks.getAccess.mockImplementation(async (id: string) => ({ board: { ...board, id, title: id, liveblocks_room_id: `board:${id}` }, role: "viewer" }));
    const bounded = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), bounded);
    expect(bounded).toMatchObject({ statusCode: 422, body: { error: "Coverage traversal exceeded the 100-board safety limit." } });

    const linkQueriesBeforePrivateRun = mocks.calls.filter((call) => call.table === "board_links" && call.operation === "in").length;
    config(); enqueue("board_links", { data: [{ source_board_id: "board", target_board_id: "private" }] });
    mocks.getAccess.mockImplementation(async (id: string) => id === "private" ? null : { board, role: "owner" });
    const privateGraph = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), privateGraph);
    expect(privateGraph.statusCode).toBe(200);
    expect(mocks.calls.filter((call) => call.table === "board_links" && call.operation === "in")).toHaveLength(linkQueriesBeforePrivateRun + 1);
  });

  it("sorts accessible transitive inputs and surfaces branch, link, and persistence failures", async () => {
    config(); enqueue("board_links", { data: [{ source_board_id: "board", target_board_id: "second" }] }, { data: [] });
    mocks.getAccess.mockImplementation(async (id: string) => ({ board: { ...board, id, title: id, liveblocks_room_id: `board:${id}` }, role: "owner" }));
    const sorted = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), sorted);
    expect((sorted.body as { inputs: Array<{ boardId: string }> }).inputs.map((input) => input.boardId)).toEqual(["board", "second"]);

    config(); enqueue("document_branches", { error: new Error("branch lookup failed") });
    const branchFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run", branchId: "branch" }), branchFailure);
    expect(branchFailure.body).toEqual({ error: "branch lookup failed" });

    config(); enqueue("board_links", { error: new Error("links unavailable") });
    const linkFailure = response();
    await coverageHandler(request("GET", {}, { boardId: "board", scope: "run" }), linkFailure);
    expect(linkFailure.body).toEqual({ error: "links unavailable" });

    config(); enqueue("board_links", { data: [] });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const generatedId = response();
    await coverageHandler(request("POST", { action: "run", boardId: "board" }), generatedId);
    expect(generatedId.body).toMatchObject({ persisted: { runId: expect.stringMatching(/^[a-f0-9-]{36}$/) } });

    config(); enqueue("board_links", { data: [] });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("run audit failed") });
    const persistFailure = response();
    await coverageHandler(request("POST", { action: "run", boardId: "board" }), persistFailure);
    expect(persistFailure.body).toEqual({ error: "run audit failed" });
  });

  it("requires editing for mutations and validates flow identities", async () => {
    mocks.getAccess.mockResolvedValueOnce({ board, role: "viewer" });
    const viewer = response();
    await coverageHandler(request("POST", { action: "save-flow", boardId: "board" }), viewer);
    expect(viewer.statusCode).toBe(403);

    const invalid = response();
    await coverageHandler(request("POST", { action: "save-flow", boardId: "board", flow: { id: "flow" } }), invalid);
    expect(invalid.statusCode).toBe(400);
    const wrongBoard = response();
    await coverageHandler(request("POST", { action: "save-flow", boardId: "board", flow: { id: "flow", name: "Flow", startBoardId: "other", startFrameId: "frame" } }), wrongBoard);
    expect(wrongBoard.statusCode).toBe(400);

    const saved = response();
    await coverageHandler(request("POST", { action: "save-flow", boardId: "board", flow: { id: "flow", name: "Flow", startBoardId: "board", startFrameId: "frame" } }), saved);
    expect(saved.body).toMatchObject({ flow: { id: "flow" } });
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "rpc:save_kumo_product_flow", operation: "call", value: expect.objectContaining({ p_workspace_id: "workspace", p_start_board_id: "board" }) }));
  });

  it("uses default POST actions and surfaces flow mutation failures", async () => {
    config(); enqueue("board_links", { data: [] });
    const defaultRun = response();
    await coverageHandler(request("POST", { boardId: "board", persist: false }), defaultRun);
    expect(defaultRun.statusCode).toBe(200);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("flow save failed") });
    const saveFailure = response();
    await coverageHandler(request("POST", { action: "save-flow", boardId: "board", flow: { id: "flow", name: "Flow", startBoardId: "board", startFrameId: "frame" } }), saveFailure);
    expect(saveFailure.body).toEqual({ error: "flow save failed" });

    enqueue("product_flows", { error: new Error("archive failed") });
    const archiveFailure = response();
    await coverageHandler(request("POST", { action: "archive-flow", boardId: "board", flowId: "flow" }), archiveFailure);
    expect(archiveFailure.body).toEqual({ error: "archive failed" });
  });

  it("archives journeys with validation", async () => {
    const missing = response();
    await coverageHandler(request("POST", { action: "archive-flow", boardId: "board" }), missing);
    expect(missing.statusCode).toBe(400);
    enqueue("product_flows", { data: null });
    const archived = response();
    await coverageHandler(request("POST", { action: "archive-flow", boardId: "board", flowId: "flow" }), archived);
    expect(archived.body).toEqual({ archived: true });
  });

  it("versions policies only for workspace administrators", async () => {
    enqueue("workspace_members", { data: { role: "member" } });
    const forbidden = response();
    await coverageHandler(request("POST", { action: "save-policy", boardId: "board", policy: {} }), forbidden);
    expect(forbidden.statusCode).toBe(403);

    enqueue("workspace_members", { data: { role: "admin" } });
    enqueue("product_flows", { data: [] });
    enqueue("coverage_policies", { data: { id: "old", name: "Old", version: 4, config: {} } });
    enqueue("coverage_suppressions", { data: [] });
    const saved = response();
    await coverageHandler(request("POST", { action: "save-policy", boardId: "board", policy: { name: "New", minimumScore: 99 } }), saved);
    expect(saved.statusCode).toBe(201);
    expect(saved.body).toMatchObject({ policy: { id: "new", name: "New", version: 5, minimumScore: 99 } });

    enqueue("workspace_members", { data: { role: "admin" } });
    config();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const generated = response();
    await coverageHandler(request("POST", { action: "save-policy", boardId: "board", policy: { name: "Generated" } }), generated);
    expect(generated).toMatchObject({ statusCode: 201, body: { policy: expect.objectContaining({ name: "Generated" }) } });

    enqueue("workspace_members", { data: { role: "owner" } });
    config();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("policy audit failed") });
    const failed = response();
    await coverageHandler(request("POST", { action: "save-policy", boardId: "board", policy: {} }), failed);
    expect(failed.body).toEqual({ error: "policy audit failed" });
  });

  it("validates, creates, expires, and removes finding suppressions", async () => {
    const invalid = response();
    await coverageHandler(request("POST", { action: "suppress", boardId: "board", fingerprint: "finding", reason: "x" }), invalid);
    expect(invalid.statusCode).toBe(400);
    enqueue("coverage_suppressions", { data: null });
    const saved = response();
    await coverageHandler(request("POST", { action: "suppress", boardId: "board", fingerprint: "finding", reason: "Not applicable", expiresAt: "invalid" }), saved);
    expect(saved.body).toEqual({ suppressed: true });
    expect(mocks.calls.find((call) => call.table === "coverage_suppressions" && call.operation === "upsert")?.value).toMatchObject({ expires_at: null });
    enqueue("coverage_suppressions", { data: null });
    const dated = response();
    await coverageHandler(request("POST", { action: "suppress", boardId: "board", fingerprint: "finding", reason: "Temporarily ignored", expiresAt: "2027-01-01" }), dated);
    expect(dated.statusCode).toBe(200);
    enqueue("coverage_suppressions", { data: null });
    const removed = response();
    await coverageHandler(request("POST", { action: "unsuppress", boardId: "board", fingerprint: "finding" }), removed);
    expect(removed.body).toEqual({ suppressed: false });

    const missingFingerprint = response();
    await coverageHandler(request("POST", { action: "unsuppress", boardId: "board" }), missingFingerprint);
    expect(missingFingerprint.statusCode).toBe(400);
  });

  it("validates non-string suppressions and surfaces suppression storage failures", async () => {
    const invalid = response();
    await coverageHandler(request("POST", { action: "suppress", boardId: "board", fingerprint: 4, reason: 5 }), invalid);
    expect(invalid.statusCode).toBe(400);

    enqueue("coverage_suppressions", { error: new Error("suppression failed") });
    const suppressionFailure = response();
    await coverageHandler(request("POST", { action: "suppress", boardId: "board", fingerprint: "finding", reason: "Not relevant" }), suppressionFailure);
    expect(suppressionFailure.body).toEqual({ error: "suppression failed" });

    enqueue("coverage_suppressions", { error: new Error("restore failed") });
    const restoreFailure = response();
    await coverageHandler(request("POST", { action: "unsuppress", boardId: "board", fingerprint: "finding" }), restoreFailure);
    expect(restoreFailure.body).toEqual({ error: "restore failed" });
  });

  it("lets only owners configure bounded off/advisory/enforced gates", async () => {
    mocks.getAccess.mockResolvedValueOnce({ board, role: "editor" });
    const editor = response();
    await coverageHandler(request("POST", { action: "save-gate", boardId: "board", mode: "enforced" }), editor);
    expect(editor.statusCode).toBe(403);
    enqueue("coverage_merge_gates", { data: { mode: "advisory", minimum_score: 100, block_critical_regressions: false } });
    const owner = response();
    await coverageHandler(request("POST", { action: "save-gate", boardId: "board", mode: "invalid", minimumScore: 500, blockCriticalRegressions: false }), owner);
    expect(owner.body).toMatchObject({ gate: { mode: "advisory", minimum_score: 100 } });

    enqueue("coverage_merge_gates", { data: { mode: "enforced", minimum_score: 90, block_critical_regressions: true } });
    const defaults = response();
    await coverageHandler(request("POST", { action: "save-gate", boardId: "board", mode: "enforced" }), defaults);
    expect(defaults.body).toMatchObject({ gate: { mode: "enforced" } });

    enqueue("coverage_merge_gates", { error: new Error("gate save failed") });
    const failure = response();
    await coverageHandler(request("POST", { action: "save-gate", boardId: "board", mode: "off", minimumScore: 0 }), failure);
    expect(failure.body).toEqual({ error: "gate save failed" });
  });

  it("compares two owned runs and rejects incomplete comparisons", async () => {
    enqueue("coverage_runs", { data: [{ id: "before", result: { ...DEFAULT_COVERAGE_POLICY } }] });
    const missing = response();
    await coverageHandler(request("POST", { action: "compare", boardId: "board", beforeRunId: "before", afterRunId: "after" }), missing);
    expect(missing.statusCode).toBe(404);
    const before: CoverageResult = { policy: DEFAULT_COVERAGE_POLICY, score: 90, criticalBlockers: 0, suppressedCount: 0, generatedAt: "", stale: false, graph: { nodes: [], edges: [], flows: [] }, findings: [], categories: {}, flowScores: {} };
    enqueue("coverage_runs", { data: [{ id: "before", result: before }, { id: "after", result: { ...before, score: 100 } }] });
    const compared = response();
    await coverageHandler(request("POST", { action: "compare", boardId: "board", beforeRunId: "before", afterRunId: "after" }), compared);
    expect(compared.body).toMatchObject({ delta: { scoreDelta: 10, blocking: false } });

    enqueue("coverage_runs", { data: null });
    const empty = response();
    await coverageHandler(request("POST", { action: "compare", boardId: "board" }), empty);
    expect(empty.statusCode).toBe(404);

    enqueue("coverage_runs", { error: new Error("comparison failed") });
    const failure = response();
    await coverageHandler(request("POST", { action: "compare", boardId: "board", beforeRunId: 4, afterRunId: 5 }), failure);
    expect(failure.body).toEqual({ error: "comparison failed" });
  });

  it("validates and sanitizes privacy-safe telemetry", async () => {
    const nonArray = response();
    await coverageHandler(request("POST", { action: "telemetry", boardId: "board", events: "invalid" }), nonArray);
    expect(nonArray.statusCode).toBe(400);

    const invalid = response();
    await coverageHandler(request("POST", { action: "telemetry", boardId: "board", events: [null, { screenKey: 4 }, { screenKey: "", state: "error", outcome: "failure" }] }), invalid);
    expect(invalid.statusCode).toBe(400);
    enqueue("coverage_telemetry_events", { data: null });
    const accepted = response();
    await coverageHandler(request("POST", { action: "telemetry", boardId: "board", events: [{ screenKey: "Checkout", state: "error", role: "customer", viewport: "watch", outcome: "failure", durationMs: -4 }, { screenKey: "Checkout", state: "success", viewport: "mobile", outcome: "success", durationMs: 999_999_999 }, { screenKey: "Receipt", state: "success", outcome: "entered" }] }), accepted);
    expect(accepted.body).toEqual({ accepted: 3 });
    const inserted = mocks.calls.find((call) => call.table === "coverage_telemetry_events" && call.operation === "insert")?.value as Array<Record<string, unknown>>;
    expect(inserted).toEqual([
      expect.objectContaining({ viewport: null, duration_ms: 0 }),
      expect.objectContaining({ viewport: "mobile", duration_ms: 86_400_000 }),
      expect.objectContaining({ role_key: null, viewport: null, duration_ms: null }),
    ]);

    enqueue("coverage_telemetry_events", { error: new Error("telemetry insert failed") });
    const failed = response();
    await coverageHandler(request("POST", { action: "telemetry", boardId: "board", events: [{ screenKey: "Checkout", state: "success", outcome: "success" }] }), failed);
    expect(failed.body).toEqual({ error: "telemetry insert failed" });
  });

  it("returns assisted drafts and production drift evidence", async () => {
    config(); enqueue("board_links", { data: [] });
    const suggestions = response();
    await coverageHandler(request("POST", { action: "suggest", boardId: "board" }), suggestions);
    expect(suggestions.body).toMatchObject({ suggestions: expect.any(Array) });

    config(); enqueue("board_links", { data: [] });
    enqueue("coverage_telemetry_events", { data: [{ screen_key: "Unknown", state_kind: "error", role_key: null, viewport: null, outcome: "failure", duration_ms: null }] });
    const telemetry = response();
    await coverageHandler(request("POST", { action: "telemetry-analysis", boardId: "board" }), telemetry);
    expect(telemetry.body).toMatchObject({ telemetry: { notDesigned: ["Unknown:error"], failures: { Unknown: 1 } } });

    config();
    enqueue("document_branches", { data: { id: "branch", room_id: "branch:branch", status: "open" } });
    enqueue("board_links", { data: [] });
    enqueue("coverage_telemetry_events", { data: null });
    const emptyTelemetry = response();
    await coverageHandler(request("POST", { action: "telemetry-analysis", boardId: "board", branchId: "branch" }), emptyTelemetry);
    expect(emptyTelemetry.body).toMatchObject({ telemetry: { failures: {} } });

    config(); enqueue("board_links", { data: [] });
    enqueue("coverage_telemetry_events", { data: [{ screen_key: "Complete", state_kind: "success", role_key: "customer", viewport: "desktop", outcome: "success", duration_ms: 42 }] });
    const detailedTelemetry = response();
    await coverageHandler(request("POST", { action: "telemetry-analysis", boardId: "board" }), detailedTelemetry);
    expect(detailedTelemetry.statusCode).toBe(200);

    config(); enqueue("board_links", { data: [] });
    enqueue("coverage_telemetry_events", { error: new Error("telemetry read failed") });
    const telemetryFailure = response();
    await coverageHandler(request("POST", { action: "telemetry-analysis", boardId: "board" }), telemetryFailure);
    expect(telemetryFailure.body).toEqual({ error: "telemetry read failed" });
  });

  it("rejects unknown actions and maps authentication and internal failures", async () => {
    const unknown = response();
    await coverageHandler(request("POST", { action: "unknown", boardId: "board" }), unknown);
    expect(unknown.statusCode).toBe(400);
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const auth = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), auth);
    expect(auth.statusCode).toBe(401);
    mocks.getAccess.mockRejectedValueOnce(new Error("database failed"));
    const failed = response();
    await coverageHandler(request("GET", {}, { boardId: "board" }), failed);
    expect(failed).toMatchObject({ statusCode: 500, body: { error: "database failed" } });
  });
});
