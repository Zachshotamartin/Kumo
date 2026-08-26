import type { Shape } from "../classes/shape";
import {
  analyzeCoverageDocuments,
  analyzeCoverageTelemetry,
  analyzeProductCoverage,
  compareCoverageResults,
  compileCoverageGraph,
  compilePlaywrightJourney,
  DEFAULT_COVERAGE_POLICY,
  formatCoverageReport,
  normalizeProductFrameMetadata,
  patchFrameProductMetadata,
  suggestCoverageDrafts,
  type CoverageFinding,
  type CoverageGraph,
  type CoveragePolicy,
  type CoverageResult,
  type ProductFlow,
} from "./productCoverage";

const shape = (id: string, type = "frame", patch: Partial<Shape> = {}): Shape => ({
  id, type, name: id, x1: 0, y1: 0, x2: 320, y2: 200, width: 320, height: 200,
  level: 0, zIndex: 1, parentId: null, ...patch,
});

const metadata = (screenKey: string, state: NonNullable<Shape["productState"]>["state"] = "default", patch: Partial<NonNullable<Shape["productState"]>> = {}): NonNullable<Shape["productState"]> => ({
  screenKey, state, flowIds: ["purchase"], roles: ["customer"], viewport: "responsive",
  criticality: "critical", requirementRefs: ["REQ-1"], ...patch,
});

const flow: ProductFlow = {
  id: "purchase", name: "Purchase", description: "Buy a product", startBoardId: "shop",
  startFrameId: "checkout-default", criticality: "critical", ownerId: "owner", status: "active",
};

const completeShapes = (): Shape[] => {
  const defaults = shape("checkout-default", "frame", { name: "Checkout", productState: metadata("Checkout"), prototypeStart: true });
  const loading = shape("checkout-loading", "frame", { name: "Checkout loading", x1: 400, x2: 720, productState: metadata("Checkout", "loading") });
  const error = shape("checkout-error", "frame", { name: "Checkout error", x1: 800, x2: 1120, productState: metadata("Checkout", "error") });
  const success = shape("checkout-success", "frame", { name: "Checkout success", x1: 1200, x2: 1520, productState: metadata("Checkout", "success") });
  return [
    defaults, loading, error, success,
    shape("to-loading", "rectangle", { parentId: defaults.id, prototypeInteractions: [{ id: "load", trigger: "click", action: "navigate", destinationId: loading.id }] }),
    shape("to-error", "rectangle", { parentId: loading.id, prototypeInteractions: [
      { id: "declined", trigger: "click", action: "navigate", destinationId: error.id, condition: { variableId: "paid", operator: "truthy" } },
      { id: "paid", trigger: "click", action: "navigate", destinationId: success.id, fallback: true },
    ] }),
    shape("retry", "rectangle", { parentId: error.id, prototypeInteractions: [{ id: "retry", trigger: "click", action: "navigate", destinationId: defaults.id }] }),
  ];
};

const completePolicy: CoveragePolicy = { ...DEFAULT_COVERAGE_POLICY, requiredRoles: ["customer"], requiredViewports: ["mobile", "desktop"], requireRequirementRefs: true };

describe("product coverage metadata", () => {
  it("normalizes valid metadata, removes duplicate strings, and bounds custom fields", () => {
    expect(normalizeProductFrameMetadata({
      screenKey: "  Checkout  ", state: "custom", customState: "  fraud review  ",
      flowIds: ["purchase", "purchase", ""], roles: ["customer", 4],
      viewport: "mobile", criticality: "critical", requirementRefs: ["REQ-1", "REQ-1"],
    })).toEqual({ screenKey: "Checkout", state: "custom", customState: "fraud review", flowIds: ["purchase"], roles: ["customer"], viewport: "mobile", criticality: "critical", requirementRefs: ["REQ-1"] });
  });

  it("uses safe defaults for malformed and sparse metadata", () => {
    expect(normalizeProductFrameMetadata(null, "")).toEqual({ screenKey: "Screen", state: "default", flowIds: [], roles: [], viewport: "responsive", criticality: "required", requirementRefs: [] });
    expect(normalizeProductFrameMetadata({ screenKey: 4, state: "invalid", flowIds: "bad", roles: null, viewport: "watch", criticality: "urgent", requirementRefs: {} }, "Fallback")).toEqual({ screenKey: "Fallback", state: "default", flowIds: [], roles: [], viewport: "responsive", criticality: "required", requirementRefs: [] });
    expect(normalizeProductFrameMetadata({ state: "custom", customState: "" }, "Named")).toMatchObject({ screenKey: "Named", state: "custom", customState: "Custom" });
    expect(normalizeProductFrameMetadata({ state: "error", customState: "ignored" }, "Named")).not.toHaveProperty("customState");
  });

  it("patches only the requested frame and initializes missing metadata", () => {
    const frame = shape("frame", "frame", { name: "Account" });
    const rectangle = shape("rect", "rectangle");
    const patched = patchFrameProductMetadata([frame, rectangle], "frame", { state: "loading", roles: ["member"] });
    expect(patched[0]?.productState).toMatchObject({ screenKey: "Account", state: "loading", roles: ["member"] });
    expect(patchFrameProductMetadata(patched, "rect", { state: "error" })).toEqual(patched);
    expect(patchFrameProductMetadata(patched, "missing", { state: "error" })).toEqual(patched);
  });
});

describe("journey graph compiler", () => {
  it("compiles same-board, linked-board, conditional, implicit, inaccessible, and broken transitions deterministically", () => {
    const sourceShapes = completeShapes();
    sourceShapes.push(
      shape("linked", "board", { parentId: "checkout-default", boardId: "receipt" }),
      shape("private-link", "rectangle", { parentId: "checkout-default", prototypeInteractions: [{ id: "private", trigger: "click", action: "open-board", boardId: "private", destinationFrameId: "__private__" }] }),
      shape("broken", "rectangle", { parentId: "checkout-default", prototypeInteractions: [{ id: "broken", trigger: "click", action: "navigate", destinationId: "missing" }] }),
      shape("external", "rectangle", { parentId: "checkout-default", prototypeInteractions: [{ id: "url", trigger: "click", action: "open-url", url: "https://example.com" }] }),
      shape("explicit-board", "board", { parentId: "checkout-default", boardId: "receipt", prototypeInteractions: [{ id: "explicit", trigger: "click", action: "open-board", boardId: "receipt", destinationFrameId: "receipt" }] }),
      shape("nested-frame", "frame", { parentId: "checkout-default", productState: metadata("Nested") }),
      shape("hidden", "frame", { hidden: true, productState: metadata("Hidden") }),
    );
    const graph = compileCoverageGraph([
      { boardId: "shop", title: "Shop", accessible: true, shapes: sourceShapes },
      { boardId: "receipt", title: "Receipt", accessible: true, shapes: [shape("receipt", "frame", { productState: metadata("Receipt", "success") })] },
      { boardId: "private", title: "Private board", accessible: false, shapes: [shape("__private__", "frame")] },
    ], [flow], completePolicy);
    expect(graph.nodes.map((node) => node.id)).not.toContain("shop:nested-frame");
    expect(graph.nodes.map((node) => node.id)).not.toContain("shop:hidden");
    expect(graph.edges).toEqual([...graph.edges].sort((left, right) => left.id.localeCompare(right.id)));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "shop:linked:board-link", targetId: "receipt:receipt", broken: false }),
      expect.objectContaining({ id: "shop:private-link:private", inaccessible: true }),
      expect.objectContaining({ id: "shop:broken:broken", targetId: "shop:missing", broken: true }),
      expect.objectContaining({ id: "shop:explicit-board:explicit", targetId: "receipt:receipt" }),
      expect.objectContaining({ id: "shop:to-error:paid", fallback: true }),
    ]));
    expect(graph.edges.some((edge) => edge.id.includes("url"))).toBe(false);
    expect(graph.flows).toEqual([flow]);
  });

  it("discovers valid local flow resources, ignores malformed resources, and lets configured flows win", () => {
    const local = shape("local", "resource", { resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "local", name: "Local", description: 7, startFrameId: "start", criticality: "optional" }) } });
    const invalidJson = shape("invalid-json", "resource", { resourceKind: "prototype-flow", resourceValue: { json: "{" } });
    const invalidFields = shape("invalid-fields", "resource", { resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "bad" }) } });
    const ignored = shape("other", "resource", { resourceKind: "fill-style", resourceValue: { json: "{}" } });
    const start = shape("start", "frame", { prototypeStart: true });
    const configured = { ...flow, id: "local", name: "Configured", startBoardId: "board", startFrameId: "start" };
    const graph = compileCoverageGraph([{ boardId: "board", title: "Board", accessible: true, shapes: [start, local, invalidJson, invalidFields, ignored] }], [configured]);
    expect(graph.flows).toEqual([expect.objectContaining({ id: "local", name: "Local", description: "", criticality: "optional" })]);

    const described = compileCoverageGraph([{ boardId: "board", title: "Board", accessible: true, shapes: [start, shape("described", "resource", { resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "described", name: "Described", description: "A complete flow", startFrameId: "start" }) } })] }]);
    expect(described.flows[0]).toMatchObject({ description: "A complete flow", criticality: "required" });
  });

  it("derives one primary flow per board when none exists and handles empty boards", () => {
    const graph = compileCoverageGraph([
      { boardId: "one", title: "One", accessible: true, shapes: [shape("second", "frame", { zIndex: 2 }), shape("first", "frame", { zIndex: 1, prototypeStart: true })] },
      { boardId: "empty", title: "Empty", accessible: true, shapes: [] },
    ]);
    expect(graph.flows).toEqual([{ id: "board-one", name: "One", description: "", startBoardId: "one", startFrameId: "first", criticality: "required", status: "active" }]);
  });

  it("deduplicates edge IDs, survives parent cycles, and enforces graph limits", () => {
    const cycleA = shape("a", "rectangle", { parentId: "b" });
    const cycleB = shape("b", "rectangle", { parentId: "a" });
    const frame = shape("frame", "frame", { prototypeStart: true });
    const duplicate = shape("button", "rectangle", { parentId: "frame", prototypeInteractions: [
      { id: "same", trigger: "click", action: "navigate", destinationId: "frame" },
      { id: "same", trigger: "hover", action: "navigate", destinationId: "frame" },
    ] });
    expect(compileCoverageGraph([{ boardId: "board", title: "Board", accessible: true, shapes: [cycleA, cycleB, frame, duplicate] }]).edges).toHaveLength(1);
    expect(() => compileCoverageGraph([{ boardId: "board", title: "Board", accessible: true, shapes: [frame] }], [], { ...DEFAULT_COVERAGE_POLICY, maxNodes: 0 })).toThrow("0-node policy limit");
    expect(() => compileCoverageGraph([{ boardId: "board", title: "Board", accessible: true, shapes: [frame, duplicate] }], [], { ...DEFAULT_COVERAGE_POLICY, maxEdges: 0 })).toThrow("0-edge policy limit");
  });

  it("normalizes absent cross-board and local destinations without guessing", () => {
    const first = shape("first", "frame", { zIndex: 1 });
    const second = shape("second", "frame", { zIndex: 2 });
    const nested = shape("nested", "rectangle", { parentId: "first" });
    const controls = shape("controls", "rectangle", { parentId: "first", prototypeInteractions: [
      { id: "open-missing", trigger: "click", action: "open-board" },
      { id: "open-default", trigger: "click", action: "open-board", boardId: "target" },
      { id: "open-empty", trigger: "click", action: "open-board", boardId: "empty" },
      { id: "navigate-missing", trigger: "click", action: "navigate" },
      { id: "navigate-nested", trigger: "click", action: "navigate", destinationId: "nested" },
    ] });
    const implicitMissing = shape("implicit-missing", "board", { parentId: "first", boardId: "unknown" });
    const graph = compileCoverageGraph([
      { boardId: "source", title: "", accessible: true, shapes: [second, first, nested, controls, implicitMissing] },
      { boardId: "target", title: "Target", accessible: true, shapes: [shape("later", "frame", { zIndex: 4 }), shape("target-first", "frame", { zIndex: 1 })] },
      { boardId: "empty", title: "Empty", accessible: true, shapes: [] },
    ]);
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "source:controls:open-missing", targetBoardId: null, targetId: null, broken: true }),
      expect.objectContaining({ id: "source:controls:open-default", targetId: "target:target-first", broken: false }),
      expect.objectContaining({ id: "source:controls:open-empty", targetId: null, broken: true }),
      expect.objectContaining({ id: "source:controls:navigate-missing", targetId: null, broken: true }),
      expect.objectContaining({ id: "source:controls:navigate-nested", targetId: "source:first", broken: false }),
      expect.objectContaining({ id: "source:implicit-missing:board-link", targetId: null, broken: true }),
    ]));
    expect(graph.flows.find((candidate) => candidate.id === "board-source")?.name).toBe("Primary flow");
  });
});

describe("coverage analyzer", () => {
  it("passes a fully annotated, responsive, accessible critical journey", () => {
    const result = analyzeCoverageDocuments([{ boardId: "shop", title: "Shop", accessible: true, shapes: completeShapes() }], [flow], completePolicy, [], new Date("2026-01-01T00:00:00Z"));
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.criticalBlockers).toBe(0);
    expect(result.flowScores.purchase).toBe(100);
    expect(result.generatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("finds every structural, state, role, viewport, metadata, and recovery failure with evidence", () => {
    const untagged = shape("untagged", "frame", { name: "Untagged", prototypeStart: true });
    const error = shape("error", "frame", { productState: metadata("Payment", "error", { flowIds: ["purchase", "missing-flow"], roles: ["admin"], viewport: "tablet", requirementRefs: [] }) });
    const conditional = shape("conditional", "rectangle", { parentId: "untagged", prototypeInteractions: [{ id: "conditional", trigger: "click", action: "navigate", destinationId: "error", condition: { variableId: "paid", operator: "truthy" } }] });
    const broken = shape("broken", "rectangle", { parentId: "untagged", prototypeInteractions: [{ id: "broken", trigger: "hover", action: "navigate", destinationId: "missing" }] });
    const inaccessible = shape("private", "rectangle", { parentId: "untagged", prototypeInteractions: [{ id: "private", trigger: "click", action: "open-board", boardId: "private", destinationFrameId: "__private__" }] });
    const policy: CoveragePolicy = { ...completePolicy, requiredStates: ["default", "success"], requiredRoles: ["customer"], requiredViewports: ["mobile"], maxEdges: 100 };
    const result = analyzeCoverageDocuments([
      { boardId: "shop", title: "Shop", accessible: true, shapes: [untagged, error, conditional, broken, inaccessible] },
      { boardId: "private", title: "Private", accessible: false, shapes: [shape("__private__", "frame")] },
    ], [{ ...flow, startFrameId: "missing-start" }], policy);
    const rules = new Set(result.findings.map((finding) => finding.rule));
    for (const rule of ["BROKEN_DESTINATION", "INACCESSIBLE_DESTINATION", "METADATA_MISSING", "REQUIREMENT_REFERENCE_MISSING", "STALE_METADATA_REFERENCE", "CONDITION_FALLBACK_MISSING", "RECOVERY_PATH_MISSING", "FLOW_START_MISSING", "UNREACHABLE_SCREEN", "DEAD_END", "REQUIRED_STATE_MISSING", "ROLE_PATH_INCOMPLETE", "VIEWPORT_MISSING"] as const) expect(rules).toContain(rule);
    expect(result.score).toBeLessThan(50);
    expect(result.criticalBlockers).toBeGreaterThan(0);
    expect(result.categories).toMatchObject({ graph: expect.any(Object), states: expect.any(Object), roles: expect.any(Object), viewports: expect.any(Object) });
  });

  it("flags accessibility findings at their containing frame and can disable optional rules", () => {
    const frame = shape("frame", "frame", { productState: metadata("Profile", "success", { flowIds: [] }) });
    const image = shape("image", "image", { parentId: frame.id });
    const result = analyzeCoverageDocuments([{ boardId: "board", title: "Board", accessible: true, shapes: [frame, image] }], [], { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceNoDeadEnds: false, enforceRecoveryPaths: false });
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "ACCESSIBILITY", boardId: "board", frameId: "frame" }));
    const disabled = analyzeCoverageDocuments([{ boardId: "board", title: "Board", accessible: true, shapes: [frame, image] }], [], { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceNoDeadEnds: false, enforceRecoveryPaths: false, enforceAccessibility: false });
    expect(disabled.findings.some((finding) => finding.rule === "ACCESSIBILITY")).toBe(false);
  });

  it("applies active suppressions, expires old suppressions, and keeps suppression counts transparent", () => {
    const graph = compileCoverageGraph([{ boardId: "board", title: "Board", accessible: true, shapes: [shape("frame", "frame", { prototypeStart: true })] }]);
    const initial = analyzeProductCoverage(graph, { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceNoDeadEnds: false, enforceAccessibility: false });
    const fingerprint = initial.findings[0]!.fingerprint;
    const active = analyzeProductCoverage(graph, { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceNoDeadEnds: false, enforceAccessibility: false }, [{ fingerprint, reason: "Not applicable", ownerId: "owner", expiresAt: "2027-01-01" }], new Date("2026-01-01"));
    expect(active.findings.find((finding) => finding.fingerprint === fingerprint)?.suppressed).toBe(true);
    expect(active.suppressedCount).toBe(1);
    expect(active.score).toBeGreaterThan(initial.score);
    const expired = analyzeProductCoverage(graph, { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceNoDeadEnds: false, enforceAccessibility: false }, [{ fingerprint, reason: "Expired", ownerId: "owner", expiresAt: "2025-01-01" }], new Date("2026-01-01"));
    expect(expired.suppressedCount).toBe(0);
  });

  it("uses explicit journey membership instead of including unrelated reachable screens", () => {
    const graph: CoverageGraph = {
      nodes: [
        { id: "board:start", boardId: "board", frameId: "start", name: "Start", annotated: true, accessible: true, metadata: metadata("Start", "success", { flowIds: ["flow"] }) },
        { id: "board:other", boardId: "board", frameId: "other", name: "Other", annotated: true, accessible: true, metadata: metadata("Other", "default", { flowIds: [] }) },
      ],
      edges: [{ id: "edge", sourceId: "board:start", targetId: "board:other", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", fallback: false, broken: false, inaccessible: false }],
      flows: [{ ...flow, id: "flow", startBoardId: "board", startFrameId: "start" }],
    };
    const result = analyzeProductCoverage(graph, { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceAccessibility: false });
    expect(result.findings.some((finding) => finding.frameId === "other" && finding.flowId === "flow")).toBe(false);
  });

  it("assigns noncritical severities and scores an empty graph safely", () => {
    const graph: CoverageGraph = {
      nodes: [
        { id: "board:start", boardId: "board", frameId: "start", name: "Start error", annotated: true, accessible: true, metadata: metadata("Checkout", "error", { criticality: "required", roles: ["admin"], viewport: "tablet", flowIds: ["required-flow"] }) },
        { id: "board:unreachable", boardId: "board", frameId: "unreachable", name: "Unreachable", annotated: true, accessible: true, metadata: metadata("Other", "default", { criticality: "required", roles: ["admin"], viewport: "tablet", flowIds: ["required-flow"] }) },
      ],
      edges: [],
      flows: [{ ...flow, id: "required-flow", criticality: "required", startBoardId: "board", startFrameId: "start" }],
    };
    const result = analyzeProductCoverage(graph, { ...DEFAULT_COVERAGE_POLICY, requiredStates: ["success"], requiredRoles: ["customer"], requiredViewports: ["mobile"], enforceAccessibility: false });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "RECOVERY_PATH_MISSING", severity: "error" }),
      expect.objectContaining({ rule: "UNREACHABLE_SCREEN", severity: "error" }),
      expect.objectContaining({ rule: "REQUIRED_STATE_MISSING", severity: "error" }),
      expect.objectContaining({ rule: "ROLE_PATH_INCOMPLETE", severity: "error" }),
      expect.objectContaining({ rule: "VIEWPORT_MISSING", severity: "warning" }),
    ]));
    expect(analyzeProductCoverage({ nodes: [], edges: [], flows: [] }, { ...DEFAULT_COVERAGE_POLICY, enforceAccessibility: false }).score).toBe(100);
  });

  it("maps top-level accessibility warnings and their independent suppression lifetime", () => {
    const tinyButton = shape("tiny", "rectangle", { width: 20, height: 20, x2: 20, y2: 20, semanticRole: "button", name: "Continue", focusOrder: 0 });
    const brokenControl = shape("broken-control", "rectangle", { parentId: "frame", prototypeInteractions: [{ id: "broken", trigger: "click", action: "navigate", destinationId: "missing" }] });
    const document = { boardId: "board", title: "Board", accessible: true, shapes: [shape("frame", "frame", { prototypeStart: true }), tinyButton, brokenControl] };
    const policy = { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], enforceNoDeadEnds: false };
    const initial = analyzeCoverageDocuments([document], [], policy, [], new Date("2026-01-01"));
    const accessibility = initial.findings.find((item) => item.rule === "ACCESSIBILITY" && item.evidence.shapeId === "tiny")!;
    expect(accessibility).toMatchObject({ severity: "warning", frameId: "tiny" });
    expect(initial.criticalBlockers).toBeGreaterThan(0);
    const active = analyzeCoverageDocuments([document], [], policy, [{ fingerprint: accessibility.fingerprint, reason: "Accepted", ownerId: "owner" }], new Date("2026-01-01"));
    expect(active.findings.find((item) => item.fingerprint === accessibility.fingerprint)?.suppressed).toBe(true);
    const expired = analyzeCoverageDocuments([document], [], policy, [{ fingerprint: accessibility.fingerprint, reason: "Expired", ownerId: "owner", expiresAt: "2025-01-01" }], new Date("2026-01-01"));
    expect(expired.findings.find((item) => item.fingerprint === accessibility.fingerprint)?.suppressed).toBe(false);
  });
});

const finding = (fingerprint: string, severity: CoverageFinding["severity"], suppressed = false): CoverageFinding => ({ fingerprint, rule: "DEAD_END", severity, message: fingerprint, remediation: "Fix it", boardId: "board", evidence: {}, suppressed });
const minimalResult = (score: number, findings: CoverageFinding[], policy = DEFAULT_COVERAGE_POLICY): CoverageResult => ({ policy, score, criticalBlockers: findings.filter((item) => item.severity === "critical" && !item.suppressed).length, suppressedCount: findings.filter((item) => item.suppressed).length, generatedAt: "2026-01-01", stale: false, graph: { nodes: [], edges: [], flows: [] }, findings, categories: {}, flowScores: {} });

describe("coverage comparisons and delivery formats", () => {
  it("compares new, resolved, suppressed, and severity-changed findings and enforces policy", () => {
    const before = minimalResult(95, [finding("resolved", "error"), finding("changed", "warning"), finding("suppressed-before", "critical", true)]);
    const after = minimalResult(80, [finding("new", "critical"), finding("changed", "error"), finding("suppressed-after", "critical", true)]);
    expect(compareCoverageResults(before, after)).toEqual({
      scoreDelta: -15,
      newFindings: [expect.objectContaining({ fingerprint: "new" })],
      resolvedFindings: [expect.objectContaining({ fingerprint: "resolved" })],
      severityChanges: [{ fingerprint: "changed", before: "warning", after: "error" }],
      blocking: true,
    });
    expect(compareCoverageResults(minimalResult(100, []), minimalResult(100, [], { ...DEFAULT_COVERAGE_POLICY, blockCriticalRegressions: false }))).toMatchObject({ blocking: false });
  });

  it("emits stable JSON, escaped JUnit, empty JUnit, and SARIF severity mappings", () => {
    const active = minimalResult(50, [
      { ...finding('bad<&"\'', "critical"), rule: "BROKEN_DESTINATION", boardId: "board", frameId: "frame" },
      { ...finding("warn", "warning"), rule: "VIEWPORT_MISSING" },
      { ...finding("note", "info"), rule: "METADATA_MISSING" },
      finding("suppressed", "error", true),
    ]);
    expect(JSON.parse(formatCoverageReport(active, "json"))).toMatchObject({ score: 50 });
    const junit = formatCoverageReport(active, "junit");
    expect(junit).toContain("tests=\"3\"");
    expect(junit).toContain("bad&lt;&amp;&quot;&apos;");
    expect(formatCoverageReport(minimalResult(100, []), "junit")).toContain("name=\"complete\"");
    const sarif = JSON.parse(formatCoverageReport(active, "sarif"));
    expect(sarif.runs[0].results.map((item: { level: string }) => item.level)).toEqual(["error", "warning", "note"]);
  });

  it("compiles supported Playwright steps and reports unknown, conditional, and unsupported flows", () => {
    const graph: CoverageGraph = {
      nodes: [
        { id: "board:start", boardId: "board", frameId: "start", name: "Start", annotated: true, accessible: true, metadata: metadata("Start") },
        { id: "board:end", boardId: "board", frameId: "end", name: "End", annotated: true, accessible: true, metadata: metadata("End", "success") },
      ],
      edges: [
        { id: "supported", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", fallback: false, broken: false, inaccessible: false },
        { id: "conditional", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", condition: { variableId: "x", operator: "truthy" }, fallback: false, broken: false, inaccessible: false },
        { id: "overlay", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "open-overlay", fallback: false, broken: false, inaccessible: false },
        { id: "broken", sourceId: "board:start", targetId: null, sourceBoardId: "board", targetBoardId: null, trigger: "click", action: "navigate", fallback: false, broken: true, inaccessible: false },
      ],
      flows: [{ ...flow, id: "flow", name: "Escaped flow", startBoardId: "board", startFrameId: "start" }],
    };
    expect(compilePlaywrightJourney(graph, "missing")).toEqual({ code: "", unsupported: ["Unknown flow: missing"] });
    const compiled = compilePlaywrightJourney(graph, "flow");
    expect(compiled.code).toContain("prototype-edge-supported");
    expect(compiled.code).not.toContain("prototype-edge-broken");
    expect(compiled.unsupported).toEqual(["conditional: conditional transition requires a fixture", "overlay: unsupported open-overlay action"]);
    const noSteps = compilePlaywrightJourney({ ...graph, edges: [] }, "flow");
    expect(noSteps.code).not.toContain("prototype-edge-");
  });

  it("chooses a deterministic fallback for branches and terminates cycles", () => {
    const graph: CoverageGraph = {
      nodes: [
        { id: "board:start", boardId: "board", frameId: "start", name: "Start", annotated: true, accessible: true, metadata: metadata("Start") },
        { id: "board:end", boardId: "board", frameId: "end", name: "End", annotated: true, accessible: true, metadata: metadata("End") },
      ],
      edges: [
        { id: "z-choice", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", fallback: false, broken: false, inaccessible: false },
        { id: "a-choice", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", fallback: false, broken: false, inaccessible: false },
        { id: "fallback", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", fallback: true, broken: false, inaccessible: false },
        { id: "timed", sourceId: "board:start", targetId: "board:end", sourceBoardId: "board", targetBoardId: "board", trigger: "after-delay", action: "navigate", fallback: false, broken: false, inaccessible: false },
        { id: "cycle", sourceId: "board:end", targetId: "board:start", sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "open-board", fallback: false, broken: false, inaccessible: false },
      ],
      flows: [{ ...flow, id: "flow", startBoardId: "board", startFrameId: "start" }],
    };
    const compiled = compilePlaywrightJourney(graph, "flow");
    expect(compiled.code).toContain("prototype-edge-fallback");
    expect(compiled.unsupported).toEqual(expect.arrayContaining([
      "timed: after-delay transition requires a fixture",
      "board:start: branching path requires a fixture",
      "cycle: cycle ends the generated journey",
    ]));
  });
});

describe("runtime evidence and assisted drafts", () => {
  it("finds designed/observed drift, failures, and abandonments", () => {
    const result = minimalResult(100, []);
    result.graph.nodes = [
      { id: "board:one", boardId: "board", frameId: "one", name: "One", annotated: true, accessible: true, metadata: metadata("Checkout") },
      { id: "board:two", boardId: "board", frameId: "two", name: "Two", annotated: true, accessible: true, metadata: metadata("Receipt", "success") },
    ];
    expect(analyzeCoverageTelemetry(result, [
      { screenKey: "Checkout", state: "default", outcome: "entered" },
      { screenKey: "Unknown", state: "error", outcome: "failure" },
      { screenKey: "Unknown", state: "error", outcome: "failure" },
      { screenKey: "Checkout", state: "default", outcome: "abandoned" },
      { screenKey: "Checkout", state: "default", outcome: "success", durationMs: 120 },
    ])).toEqual({ neverObserved: ["Receipt:success"], notDesigned: ["Unknown:error"], failures: { Unknown: 2 }, abandonments: { Checkout: 1 } });
  });

  it("suggests only actionable missing states, recovery paths, dead ends, and viewports", () => {
    const result = minimalResult(0, [
      { ...finding("state", "error"), rule: "REQUIRED_STATE_MISSING", evidence: { screenKey: "Checkout", state: "error" } },
      { ...finding("recovery", "error"), rule: "RECOVERY_PATH_MISSING", frameId: "error" },
      { ...finding("dead", "error"), rule: "DEAD_END", frameId: "dead" },
      { ...finding("viewport", "warning"), rule: "VIEWPORT_MISSING", evidence: { screenKey: "Checkout", viewport: "mobile" } },
      { ...finding("ignored", "info"), rule: "METADATA_MISSING" },
      { ...finding("suppressed", "error", true), rule: "DEAD_END" },
    ]);
    expect(suggestCoverageDrafts(result).map((suggestion) => suggestion.kind)).toEqual(["create-state", "connect-path", "connect-path", "create-viewport"]);
  });

  it("traverses many deterministic cyclic graphs without duplicates or recursion failure", () => {
    for (let size = 1; size <= 100; size += 1) {
      const nodes = Array.from({ length: size }, (_, index) => ({ id: `board:${index}`, boardId: "board", frameId: String(index), name: String(index), annotated: true, accessible: true, metadata: metadata(`Screen ${index}`, index === size - 1 ? "success" : "default", { flowIds: [] }) }));
      const edges = nodes.map((node, index) => ({ id: `edge-${index}`, sourceId: node.id, targetId: nodes[(index + 1) % size]!.id, sourceBoardId: "board", targetBoardId: "board", trigger: "click", action: "navigate", fallback: false, broken: false, inaccessible: false }));
      const result = analyzeProductCoverage({ nodes, edges, flows: [{ ...flow, id: "cycle", startBoardId: "board", startFrameId: "0" }] }, { ...DEFAULT_COVERAGE_POLICY, requiredStates: [], requiredViewports: [], requireMetadata: false, enforceAccessibility: false });
      expect(new Set(result.graph.nodes.map((node) => node.id)).size).toBe(size);
      expect(result.findings.some((item) => item.rule === "UNREACHABLE_SCREEN")).toBe(false);
    }
  });
});
