import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { DEFAULT_COVERAGE_POLICY, type CoverageFinding, type CoverageResult, type ProductFlow } from "../../platform/productCoverage";
import type { CoverageOverview } from "../../services/coverageRepository";
import ProductCoveragePanel from "./ProductCoveragePanel";

const mocks = vi.hoisted(() => ({
  actions: { canEdit: true, commitShapes: vi.fn(), commitBoardPatch: vi.fn() },
  analyze: vi.fn(),
  overview: vi.fn(),
  runCoverage: vi.fn(),
  saveFlow: vi.fn(),
  archiveFlow: vi.fn(),
  compareRuns: vi.fn(),
  savePolicy: vi.fn(),
  saveGate: vi.fn(),
  suppress: vi.fn(),
  unsuppress: vi.fn(),
  suggestions: vi.fn(),
  telemetry: vi.fn(),
}));

vi.mock("../../editor/useEditorActions", () => ({ useEditorActions: () => mocks.actions }));
vi.mock("../../platform/productCoverage", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../platform/productCoverage")>(),
  analyzeCoverageDocuments: (...args: unknown[]) => mocks.analyze(...args),
}));
vi.mock("../../services/coverageRepository", () => ({
  loadCoverageOverview: mocks.overview,
  runProductCoverage: mocks.runCoverage,
  saveProductFlow: mocks.saveFlow,
  archiveProductFlow: mocks.archiveFlow,
  compareCoverageRuns: mocks.compareRuns,
  saveCoveragePolicy: mocks.savePolicy,
  saveCoverageGate: mocks.saveGate,
  suppressCoverageFinding: mocks.suppress,
  unsuppressCoverageFinding: mocks.unsuppress,
  requestCoverageSuggestions: mocks.suggestions,
  loadCoverageTelemetry: mocks.telemetry,
}));

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id,
  type: "rectangle",
  name: id,
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 60,
  width: 100,
  height: 60,
  level: 0,
  zIndex: 1,
  parentId: null,
  ...patch,
});

const metadata = (screenKey: string, state: "default" | "error" | "success" = "default") => ({
  screenKey,
  state,
  flowIds: ["flow"],
  roles: ["customer"],
  viewport: "responsive" as const,
  criticality: "critical" as const,
  requirementRefs: ["REQ-1"],
});

const localFlow: ProductFlow = { id: "flow", name: "Checkout", description: "Purchase", startBoardId: "board", startFrameId: "frame", criticality: "critical", status: "active" };
const remoteFlow: ProductFlow = { id: "remote-flow", name: "Remote", description: "", startBoardId: "other", startFrameId: "remote", criticality: "optional", status: "active" };
const finding = (fingerprint: string, patch: Partial<CoverageFinding> = {}): CoverageFinding => ({
  fingerprint,
  rule: "REQUIRED_STATE_MISSING",
  severity: "critical",
  message: `${fingerprint} message`,
  remediation: `${fingerprint} remediation`,
  boardId: "board",
  frameId: "frame",
  flowId: "flow",
  evidence: { screenKey: "Checkout", state: "error" },
  suppressed: false,
  ...patch,
});

const makeResult = (patch: Partial<CoverageResult> = {}): CoverageResult => ({
  policy: { ...DEFAULT_COVERAGE_POLICY, requiredStates: ["default", "error"] },
  score: 72,
  criticalBlockers: 1,
  suppressedCount: 1,
  generatedAt: "2026-08-26T00:00:00.000Z",
  stale: false,
  graph: {
    nodes: [
      { id: "board:frame", boardId: "board", frameId: "frame", name: "Checkout", annotated: true, accessible: true, metadata: metadata("Checkout") },
      { id: "other:remote", boardId: "other", frameId: "remote", name: "Receipt", annotated: true, accessible: true, metadata: metadata("Receipt", "success") },
    ],
    edges: [{ id: "manual-overlay", sourceId: "board:frame", targetId: "other:remote", sourceBoardId: "board", targetBoardId: "other", trigger: "hover", action: "open-overlay", fallback: false, broken: false, inaccessible: false }],
    flows: [localFlow, remoteFlow],
  },
  findings: [
    finding("missing"),
    finding("suppressed", { rule: "DEAD_END", severity: "warning", suppressed: true }),
    finding("remote", { rule: "DEAD_END", severity: "error", boardId: "other", frameId: undefined, flowId: "remote-flow" }),
  ],
  categories: { graph: { passed: 7, total: 10, score: 70 }, states: { passed: 8, total: 10, score: 80 } },
  flowScores: { flow: 64, "remote-flow": 100 },
  ...patch,
});

const makeOverview = (patch: Partial<CoverageOverview> = {}): CoverageOverview => ({
  flows: [localFlow, remoteFlow],
  policy: { ...DEFAULT_COVERAGE_POLICY, id: "policy", name: "Strict", version: 2, requiredStates: ["default", "error"], requiredRoles: ["customer"] },
  suppressions: [],
  runs: [
    { id: "main-run", branch_id: null, policy_version: 2, revision_key: "r1", root_checksum: "c1", score: 91, critical_blockers: 0, status: "complete", created_at: "2026-08-25T00:00:00.000Z" },
    { id: "branch-run", branch_id: "branch", policy_version: 2, revision_key: "r2", root_checksum: "c2", score: 80, critical_blockers: 2, status: "complete", created_at: "2026-08-26T00:00:00.000Z" },
  ],
  gate: { mode: "advisory", minimum_score: 90, block_critical_regressions: true },
  permissions: { managePolicy: true, manageGate: true },
  ...patch,
});

const boardShapes = [
  shape("frame", { type: "frame", name: "Checkout", productState: metadata("Checkout") }),
  shape("child", { parentId: "frame" }),
  shape("unnamed", { type: "frame", name: undefined, x1: 200, x2: 300, productState: metadata("Other") }),
];

const makeStore = (patch: Record<string, unknown> = {}) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({ id: "board", roomId: "board:board", role: "owner", title: "Product", type: "private", uid: "owner", shapes: boardShapes, ...patch }));
  return store;
};

const renderPanel = (patch: Record<string, unknown> = {}) => {
  const store = makeStore(patch);
  return { store, ...render(<Provider store={store}><ProductCoveragePanel /></Provider>) };
};

describe("ProductCoveragePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actions.canEdit = true;
    mocks.analyze.mockReturnValue(makeResult());
    mocks.overview.mockResolvedValue(makeOverview());
    mocks.runCoverage.mockResolvedValue(makeResult({ score: 96, criticalBlockers: 1 }));
    mocks.saveFlow.mockImplementation(async (_boardId: string, flow: ProductFlow) => flow);
    mocks.archiveFlow.mockResolvedValue({ archived: true });
    mocks.compareRuns.mockResolvedValue({ scoreDelta: 11, newFindings: [finding("new")], resolvedFindings: [finding("resolved")], severityDelta: { critical: -1, error: 0, warning: 0, info: 0 }, blocking: false });
    mocks.savePolicy.mockImplementation(async (_boardId: string, policy: CoverageResult["policy"]) => ({ ...policy, id: "new-policy", version: 3 }));
    mocks.saveGate.mockResolvedValue({ mode: "enforced", minimum_score: 95, block_critical_regressions: false });
    mocks.suppress.mockResolvedValue({ suppressed: true });
    mocks.unsuppress.mockResolvedValue({ suppressed: false });
    mocks.suggestions.mockResolvedValue([{ findingFingerprint: "remote", kind: "connect-path", title: "Remote suggestion", prompt: "Connect it" }]);
    mocks.telemetry.mockResolvedValue({ neverObserved: ["Checkout:error"], notDesigned: ["Legacy:default"], failures: { Checkout: 2, Legacy: 1 }, abandonments: { Checkout: 3 } });
  });

  it("filters, selects, suppresses, restores, and creates missing states", async () => {
    const { store } = renderPanel();
    expect(await screen.findByText("72%")).toBeVisible();
    expect(screen.getByText("1 critical blocker")).toBeVisible();
    expect(screen.getByText("missing message")).toBeVisible();
    expect(screen.queryByText("suppressed message")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /missing message/ }));
    expect(store.getState().selected.selectedShapes).toEqual(["frame"]);
    expect(screen.getByRole("button", { name: /remote message/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "critical" }));
    expect(screen.queryByText("remote message")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "all" }));
    expect(screen.getByText("suppressed message")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Not-applicable reason"), { target: { value: "x" } });
    expect(screen.getAllByRole("button", { name: "Not applicable" })[0]).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Not-applicable reason"), { target: { value: "Requirement excludes this state" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Not applicable" })[0]!);
    await waitFor(() => expect(mocks.suppress).toHaveBeenCalledWith("board", "missing", "Requirement excludes this state"));
    expect(await screen.findByRole("status")).toHaveTextContent("marked not applicable");

    fireEvent.click(screen.getByRole("button", { name: "all" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(mocks.unsuppress).toHaveBeenCalledWith("board", "suppressed"));
    fireEvent.click(screen.getByRole("button", { name: "Create state" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "Checkout · error", productState: expect.objectContaining({ state: "error" }) })]));
    expect(store.getState().selected.selectedShapes[0]).not.toBe("frame");
  });

  it("reports an untagged source and safely defaults malformed finding evidence", async () => {
    mocks.analyze.mockReturnValue(makeResult({ findings: [finding("unknown", { evidence: { screenKey: "Unknown", state: "strange" } })], suppressedCount: 0 }));
    const first = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Create state" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tag an existing frame");
    first.unmount();

    mocks.analyze.mockReturnValue(makeResult({ findings: [finding("defaulted", { evidence: { screenKey: 4, state: "strange" } })], suppressedCount: 0 }));
    renderPanel({ shapes: [shape("empty-screen", { type: "frame", productState: metadata("") })] });
    fireEvent.click(screen.getByRole("button", { name: "Create state" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ productState: expect.objectContaining({ state: "default" }) })]));
  });

  it("exports every report and runs the persisted graph with singular and plural status", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:coverage");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { store } = renderPanel();
    for (const name of ["JSON", "JUNIT", "SARIF"]) fireEvent.click(screen.getByRole("button", { name }));
    expect(createUrl).toHaveBeenCalledTimes(3);
    expect(click).toHaveBeenCalledTimes(3);
    expect(revokeUrl).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: /Run full graph/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("1 critical blocker");
    expect(mocks.runCoverage).toHaveBeenCalledWith("board", null, true);
    expect(screen.getByText("96%")).toBeVisible();
    act(() => { store.dispatch(setWhiteboardData({ shapes: [...boardShapes, shape("new-shape")] })); });
    expect(await screen.findByText("72%")).toBeVisible();

    mocks.runCoverage.mockResolvedValueOnce(makeResult({ score: 100, criticalBlockers: 2 }));
    fireEvent.click(screen.getByRole("button", { name: /Run full graph/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 critical blockers");
  });

  it("surfaces operation and loading errors, including stale async completion", async () => {
    mocks.runCoverage.mockRejectedValueOnce("offline");
    const first = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Run full graph/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("coverage operation failed");
    first.unmount();

    mocks.overview.mockRejectedValueOnce(new Error("Policy unavailable"));
    const second = renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Policy unavailable");
    second.unmount();

    let resolveOverview: (value: CoverageOverview) => void = () => undefined;
    mocks.overview.mockImplementationOnce(() => new Promise((resolve) => { resolveOverview = resolve; }));
    const staleSuccess = renderPanel();
    staleSuccess.unmount();
    await act(async () => { resolveOverview(makeOverview()); await Promise.resolve(); });

    let rejectOverview: (reason: unknown) => void = () => undefined;
    mocks.overview.mockImplementationOnce(() => new Promise((_, reject) => { rejectOverview = reject; }));
    const staleFailure = renderPanel();
    staleFailure.unmount();
    await act(async () => { rejectOverview("late"); await Promise.resolve(); });
  });

  it("shows the state matrix and navigates only to local covered nodes", async () => {
    const { store } = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "matrix" }));
    expect(screen.getAllByRole("cell")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Checkout default: covered" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Checkout error: missing" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Receipt success: covered" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Checkout default: covered" }));
    expect(store.getState().selected.selectedShapes).toEqual(["frame"]);

    mocks.analyze.mockReturnValue(makeResult({ graph: { nodes: [], edges: [], flows: [] }, findings: [], suppressedCount: 0, criticalBlockers: 0 }));
    const empty = renderPanel({ id: "empty-board", shapes: [] });
    fireEvent.click(screen.getAllByRole("tab", { name: "matrix" }).at(-1)!);
    expect(screen.getByText("Tag frames to build the matrix.")).toBeVisible();
    empty.unmount();
  });

  it("manages journeys and tags the selected start frame", async () => {
    const { store } = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "journeys" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[0]!);
    expect(store.getState().selected.selectedShapes).toEqual(["frame"]);
    expect(screen.getAllByRole("button", { name: "Start" })[1]).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
    await waitFor(() => expect(mocks.archiveFlow).toHaveBeenCalledWith("board", "flow"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Activation  " } });
    fireEvent.change(screen.getByLabelText("Start frame"), { target: { value: "unnamed" } });
    fireEvent.change(screen.getByLabelText("Criticality"), { target: { value: "optional" } });
    fireEvent.click(screen.getByRole("button", { name: "Create journey" }));
    await waitFor(() => expect(mocks.saveFlow).toHaveBeenCalledWith("board", expect.objectContaining({ name: "Activation", startFrameId: "unnamed", criticality: "optional", status: "active" })));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "unnamed", productState: expect.objectContaining({ flowIds: expect.arrayContaining(["flow"]) }) })]));

    fireEvent.click(screen.getByRole("button", { name: /Checkoutdefault/ }));
    expect(store.getState().selected.selectedShapes).toEqual(["frame"]);
    expect(screen.getByRole("button", { name: /Receiptsuccess/ })).toBeDisabled();
    expect(screen.getByText("Checkout Playwright spec")).toBeVisible();
    expect(screen.getByText(/test\("Checkout"/)).toBeInTheDocument();
    expect(screen.getAllByText(/unsupported open-overlay action/).length).toBeGreaterThan(0);
  });

  it("supports journey drafting before configuration loads and empty local analysis", async () => {
    mocks.overview.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = renderPanel({ shapes: [shape("raw", { type: "frame", productState: undefined })] });
    fireEvent.click(screen.getByRole("tab", { name: "journeys" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
    await waitFor(() => expect(mocks.archiveFlow).toHaveBeenCalledWith("board", "flow"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Early flow" } });
    fireEvent.change(screen.getByLabelText("Start frame"), { target: { value: "raw" } });
    fireEvent.click(screen.getByRole("button", { name: "Create journey" }));
    await waitFor(() => expect(mocks.saveFlow).toHaveBeenCalledWith("board", expect.objectContaining({ name: "Early flow", startFrameId: "raw" })));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "raw", productState: expect.objectContaining({ flowIds: [expect.any(String)] }) })]));
    pending.unmount();

    mocks.analyze.mockImplementation(() => { throw new Error("unavailable"); });
    mocks.overview.mockResolvedValueOnce(makeOverview());
    const configured = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "journeys" }));
    expect(await screen.findByText("critical · 100%")).toBeVisible();
    configured.unmount();

    mocks.overview.mockImplementationOnce(() => new Promise(() => undefined));
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "journeys" }));
    expect(screen.getByRole("heading", { name: "Critical journeys" })).toBeVisible();
  });

  it("renders immutable history and its empty state", async () => {
    const first = renderPanel();
    await screen.findByText("72%");
    fireEvent.click(screen.getByRole("tab", { name: "history" }));
    expect(screen.getByText("91% coverage")).toHaveTextContent("main");
    expect(screen.getByText("80% coverage")).toHaveTextContent("branch");
    fireEvent.click(screen.getByRole("button", { name: "Compare latest runs" }));
    await waitFor(() => expect(mocks.compareRuns).toHaveBeenCalledWith("board", "branch-run", "main-run"));
    expect(screen.getByText("+11")).toBeVisible();
    expect(screen.getByText("New findings").parentElement).toHaveTextContent("1");
    mocks.compareRuns.mockResolvedValueOnce({ scoreDelta: -2, newFindings: [], resolvedFindings: [], severityDelta: { critical: 1, error: 0, warning: 0, info: 0 }, blocking: true });
    fireEvent.click(screen.getByRole("button", { name: "Compare latest runs" }));
    expect(await screen.findByText("-2")).toBeVisible();
    expect(screen.getByText("Blocking").parentElement).toHaveTextContent("Yes");
    first.unmount();

    mocks.overview.mockResolvedValueOnce(makeOverview({ runs: [] }));
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "history" }));
    expect(await screen.findByText("Run full graph coverage to create the first immutable result.")).toBeVisible();
  });

  it("edits, clamps, versions, and permission-gates policy and merge enforcement", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "policy" }));
    const policyName = await screen.findByLabelText("Policy name");
    fireEvent.change(policyName, { target: { value: "Release gate" } });
    fireEvent.change(screen.getByLabelText("Required states"), { target: { value: "default, made-up, success" } });
    fireEvent.change(screen.getByLabelText("Required roles"), { target: { value: "admin, , customer" } });
    const minimum = screen.getByLabelText("Minimum score");
    fireEvent.change(minimum, { target: { value: "200" } });
    expect(minimum).toHaveValue(100);
    fireEvent.change(minimum, { target: { value: "-5" } });
    expect(minimum).toHaveValue(0);
    for (const label of ["Require frame metadata", "Require requirement links", "Block dead ends"]) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole("button", { name: "Save policy version" }));
    expect(await screen.findByRole("status")).toHaveTextContent("v3 saved");
    expect(mocks.savePolicy).toHaveBeenCalledWith("board", expect.objectContaining({ name: "Release gate", requiredStates: ["default", "success"], requiredRoles: ["admin", "customer"], minimumScore: 0 }));

    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "enforced" } });
    const gateScore = screen.getByLabelText("Gate score");
    fireEvent.change(gateScore, { target: { value: "101" } });
    expect(gateScore).toHaveValue(100);
    fireEvent.change(gateScore, { target: { value: "-1" } });
    expect(gateScore).toHaveValue(0);
    fireEvent.click(screen.getByLabelText("Block critical regressions"));
    fireEvent.click(screen.getByRole("button", { name: "Save branch gate" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Branch coverage gate saved");
    expect(mocks.saveGate).toHaveBeenCalledWith("board", { mode: "enforced", minimumScore: 0, blockCriticalRegressions: false });
  });

  it("disables administrative and editing controls without permission", async () => {
    mocks.actions.canEdit = false;
    mocks.overview.mockResolvedValue(makeOverview({ permissions: { managePolicy: false, manageGate: false } }));
    renderPanel({ role: "viewer" });
    fireEvent.click(screen.getByRole("tab", { name: "policy" }));
    expect(await screen.findByRole("button", { name: "Save policy version" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save branch gate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "journeys" }));
    expect(screen.getByRole("button", { name: "Create journey" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Archive" })[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "findings" }));
    screen.getAllByRole("button", { name: "Not applicable" }).forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "all" }));
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
  });

  it("analyzes production evidence and uses remote or deterministic suggestions", async () => {
    const first = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze production evidence" }));
    expect(await screen.findByText("Never observed")).toBeVisible();
    expect(screen.getByText("Failures").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("Abandoned").nextSibling).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
    expect(await screen.findByText("Remote suggestion")).toBeVisible();
    first.unmount();

    mocks.suggestions.mockRejectedValueOnce(new Error("assistant unavailable"));
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
    expect(await screen.findByText("Draft error state")).toBeVisible();
  });

  it("handles a boardless, untitled, roomless, or locally unanalyzable canvas", async () => {
    mocks.analyze.mockImplementationOnce(() => { throw new Error("too large"); });
    const broken = renderPanel({ title: null, roomId: null });
    expect(screen.getByText("Preparing coverage…")).toBeVisible();
    expect(screen.getByRole("button", { name: "JSON" })).toBeDisabled();
    broken.unmount();

    const boardless = renderPanel({ id: null, shapes: [] });
    expect(screen.getByRole("button", { name: /Run full graph/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "evidence" }));
    expect(screen.getByRole("button", { name: "Analyze production evidence" })).toBeDisabled();
    boardless.unmount();
  });
});
