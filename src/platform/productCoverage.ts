import type { Shape } from "../classes/shape.js";
import { auditAccessibility } from "./accessibilityAudit.js";

export { formatCoverageReport } from "../server/coverageReport.js";

export const PRODUCT_STATE_KINDS = [
  "default", "loading", "empty", "error", "success", "offline",
  "unauthorized", "not-found", "confirmation", "custom",
] as const;
export type ProductStateKind = typeof PRODUCT_STATE_KINDS[number];
export type ProductViewport = "mobile" | "tablet" | "desktop" | "responsive";
export type ProductCriticality = "critical" | "required" | "optional";
export type CoverageSeverity = "critical" | "error" | "warning" | "info";

export interface ProductFrameMetadata {
  screenKey: string;
  state: ProductStateKind;
  customState?: string;
  flowIds: string[];
  roles: string[];
  viewport: ProductViewport;
  criticality: ProductCriticality;
  requirementRefs: string[];
}

export interface ProductFlow {
  id: string;
  name: string;
  description: string;
  startBoardId: string;
  startFrameId: string;
  criticality: ProductCriticality;
  ownerId?: string | null;
  status?: "active" | "archived";
}

export interface CoveragePolicy {
  id: string;
  name: string;
  version: number;
  requiredStates: ProductStateKind[];
  requiredRoles: string[];
  requiredViewports: ProductViewport[];
  terminalStates: ProductStateKind[];
  requireMetadata: boolean;
  requireRequirementRefs: boolean;
  enforceNoDeadEnds: boolean;
  enforceAccessibility: boolean;
  enforceRecoveryPaths: boolean;
  minimumScore: number;
  blockCriticalRegressions: boolean;
  maxNodes: number;
  maxEdges: number;
}

export const DEFAULT_COVERAGE_POLICY: CoveragePolicy = {
  id: "default",
  name: "Product completeness",
  version: 1,
  requiredStates: ["default", "loading", "error", "success"],
  requiredRoles: [],
  requiredViewports: ["mobile", "desktop"],
  terminalStates: ["success"],
  requireMetadata: true,
  requireRequirementRefs: false,
  enforceNoDeadEnds: true,
  enforceAccessibility: true,
  enforceRecoveryPaths: true,
  minimumScore: 90,
  blockCriticalRegressions: true,
  maxNodes: 5_000,
  maxEdges: 10_000,
};

export interface CoverageDocument {
  boardId: string;
  title: string;
  shapes: Shape[];
  accessible: boolean;
  roomId?: string;
  checksum?: string;
}

export interface CoverageNode {
  id: string;
  boardId: string;
  frameId: string;
  name: string;
  annotated: boolean;
  accessible: boolean;
  metadata: ProductFrameMetadata;
}

export interface CoverageEdge {
  id: string;
  sourceId: string;
  targetId: string | null;
  sourceBoardId: string;
  targetBoardId: string | null;
  trigger: string;
  action: string;
  condition?: NonNullable<NonNullable<Shape["prototypeInteractions"]>[number]["condition"]>;
  fallback: boolean;
  broken: boolean;
  inaccessible: boolean;
}

export interface CoverageGraph {
  nodes: CoverageNode[];
  edges: CoverageEdge[];
  flows: ProductFlow[];
}

export type CoverageRule =
  | "BROKEN_DESTINATION" | "INACCESSIBLE_DESTINATION" | "UNREACHABLE_SCREEN"
  | "DEAD_END" | "REQUIRED_STATE_MISSING" | "ROLE_PATH_INCOMPLETE"
  | "VIEWPORT_MISSING" | "CONDITION_FALLBACK_MISSING" | "RECOVERY_PATH_MISSING"
  | "FLOW_START_MISSING" | "STALE_METADATA_REFERENCE" | "METADATA_MISSING"
  | "REQUIREMENT_REFERENCE_MISSING" | "ACCESSIBILITY";

export interface CoverageFinding {
  fingerprint: string;
  rule: CoverageRule;
  severity: CoverageSeverity;
  message: string;
  remediation: string;
  boardId?: string;
  frameId?: string;
  flowId?: string;
  evidence: Record<string, string | number | boolean | null>;
  suppressed: boolean;
}

interface CoverageCheck {
  fingerprint: string;
  severity: CoverageSeverity;
  passed: boolean;
  finding?: CoverageFinding;
}

export interface CoverageCategoryScore {
  passed: number;
  total: number;
  score: number;
}

export interface CoverageResult {
  policy: CoveragePolicy;
  score: number;
  criticalBlockers: number;
  suppressedCount: number;
  generatedAt: string;
  stale: boolean;
  graph: CoverageGraph;
  findings: CoverageFinding[];
  categories: Record<string, CoverageCategoryScore>;
  flowScores: Record<string, number>;
}

export interface CoverageSuppression {
  fingerprint: string;
  reason: string;
  ownerId: string;
  expiresAt?: string | null;
}

export interface CoverageDelta {
  scoreDelta: number;
  newFindings: CoverageFinding[];
  resolvedFindings: CoverageFinding[];
  severityChanges: Array<{ fingerprint: string; before: CoverageSeverity; after: CoverageSeverity }>;
  blocking: boolean;
}

export interface CoverageTelemetryEvent {
  screenKey: string;
  state: string;
  role?: string;
  viewport?: ProductViewport;
  outcome: "entered" | "success" | "failure" | "abandoned";
  durationMs?: number;
}

export interface CoverageDraftSuggestion {
  findingFingerprint: string;
  kind: "create-state" | "connect-path" | "create-viewport";
  title: string;
  prompt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
  : [];
const stateKind = (value: unknown): ProductStateKind => PRODUCT_STATE_KINDS.includes(value as ProductStateKind) ? value as ProductStateKind : "default";
const viewportKind = (value: unknown): ProductViewport => ["mobile", "tablet", "desktop", "responsive"].includes(String(value)) ? value as ProductViewport : "responsive";
const criticalityKind = (value: unknown): ProductCriticality => ["critical", "required", "optional"].includes(String(value)) ? value as ProductCriticality : "required";
const clean = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;

export const normalizeProductFrameMetadata = (value: unknown, fallbackName = "Screen"): ProductFrameMetadata => {
  const source = isRecord(value) ? value : {};
  const state = stateKind(source.state);
  return {
    screenKey: clean(source.screenKey, clean(fallbackName, "Screen")),
    state,
    ...(state === "custom" ? { customState: clean(source.customState, "Custom") } : {}),
    flowIds: strings(source.flowIds),
    roles: strings(source.roles),
    viewport: viewportKind(source.viewport),
    criticality: criticalityKind(source.criticality),
    requirementRefs: strings(source.requirementRefs),
  };
};

export const patchFrameProductMetadata = (
  shapes: Shape[],
  frameId: string,
  patch: Partial<ProductFrameMetadata>
): Shape[] => shapes.map((shape) => shape.id === frameId && shape.type === "frame"
  ? { ...shape, productState: normalizeProductFrameMetadata({ ...normalizeProductFrameMetadata(shape.productState, shape.name), ...patch }, shape.name) }
  : shape);

const nodeId = (boardId: string, frameId: string) => `${boardId}:${frameId}`;

const topFrameId = (shape: Shape, byId: Map<string, Shape>): string | null => {
  let current: Shape | undefined = shape;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.type === "frame" && !current.parentId) return current.id;
    current = typeof current.parentId === "string" ? byId.get(current.parentId) : undefined;
  }
  return null;
};

const parsedPrototypeFlows = (document: CoverageDocument): ProductFlow[] => document.shapes.flatMap((shape) => {
  if (shape.type !== "resource" || shape.resourceKind !== "prototype-flow" || typeof shape.resourceValue?.json !== "string") return [];
  try {
    const flow = JSON.parse(shape.resourceValue.json) as Record<string, unknown>;
    return typeof flow.id === "string" && typeof flow.name === "string" && typeof flow.startFrameId === "string"
      ? [{
          id: flow.id,
          name: flow.name,
          description: typeof flow.description === "string" ? flow.description : "",
          startBoardId: document.boardId,
          startFrameId: flow.startFrameId,
          criticality: criticalityKind(flow.criticality),
          status: "active" as const,
        }]
      : [];
  } catch {
    return [];
  }
});

const firstTopFrame = (document: CoverageDocument) => document.shapes
  .filter((shape) => shape.type === "frame" && !shape.parentId && !shape.hidden)
  .sort((left, right) => left.zIndex - right.zIndex)[0];

const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

export const compileCoverageGraph = (
  documents: CoverageDocument[],
  configuredFlows: ProductFlow[] = [],
  policy: CoveragePolicy = DEFAULT_COVERAGE_POLICY,
): CoverageGraph => {
  const documentById = new Map(documents.map((document) => [document.boardId, document]));
  const nodes = documents.flatMap((document) => document.shapes
    .filter((shape) => shape.type === "frame" && !shape.parentId && !shape.hidden)
    .map((shape): CoverageNode => ({
      id: nodeId(document.boardId, shape.id),
      boardId: document.boardId,
      frameId: shape.id,
      name: clean(shape.name, "Untitled frame"),
      annotated: Boolean(shape.productState),
      accessible: document.accessible,
      metadata: normalizeProductFrameMetadata(shape.productState, shape.name),
    })));
  if (nodes.length > policy.maxNodes) throw new Error(`Coverage graph exceeds the ${policy.maxNodes}-node policy limit.`);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: CoverageEdge[] = [];

  documents.forEach((document) => {
    const byId = new Map(document.shapes.map((shape) => [shape.id, shape]));
    document.shapes.forEach((shape) => {
      const sourceFrameId = topFrameId(shape, byId);
      if (!sourceFrameId) return;
      const addEdge = (input: Omit<CoverageEdge, "sourceId" | "sourceBoardId">) => edges.push({
        ...input,
        sourceId: nodeId(document.boardId, sourceFrameId),
        sourceBoardId: document.boardId,
      });
      (shape.prototypeInteractions ?? []).forEach((interaction) => {
        if (!["navigate", "open-board", "change-to", "open-overlay", "scroll-to"].includes(interaction.action)) return;
        const targetBoardId = interaction.action === "open-board" ? interaction.boardId ?? null : document.boardId;
        const targetDocument = targetBoardId ? documentById.get(targetBoardId) : undefined;
        const localTarget = interaction.action === "open-board"
          ? interaction.destinationFrameId ?? (targetDocument ? firstTopFrame(targetDocument)?.id : undefined)
          : interaction.destinationId
            ? topFrameId(byId.get(interaction.destinationId) ?? ({ id: interaction.destinationId, type: "frame" } as Shape), byId)
            : undefined;
        const targetId = targetBoardId && localTarget ? nodeId(targetBoardId, localTarget) : null;
        addEdge({
          id: `${document.boardId}:${shape.id}:${interaction.id}`,
          targetId,
          targetBoardId,
          trigger: interaction.trigger,
          action: interaction.action,
          ...(interaction.condition ? { condition: interaction.condition } : {}),
          fallback: interaction.fallback === true,
          broken: !targetId || !nodeById.has(targetId),
          inaccessible: Boolean(targetId && nodeById.get(targetId)?.accessible === false),
        });
      });
      if (shape.type === "board" && typeof shape.boardId === "string" && !(shape.prototypeInteractions?.some((item) => item.action === "open-board"))) {
        const targetDocument = documentById.get(shape.boardId);
        const targetFrame = targetDocument ? firstTopFrame(targetDocument) : undefined;
        const targetId = targetFrame ? nodeId(shape.boardId, targetFrame.id) : null;
        addEdge({
          id: `${document.boardId}:${shape.id}:board-link`,
          targetId,
          targetBoardId: shape.boardId,
          trigger: "click",
          action: "open-board",
          fallback: false,
          broken: !targetId || !nodeById.has(targetId),
          inaccessible: Boolean(targetId && nodeById.get(targetId)?.accessible === false),
        });
      }
    });
  });
  const normalizedEdges = uniqueById(edges).sort((left, right) => left.id.localeCompare(right.id));
  if (normalizedEdges.length > policy.maxEdges) throw new Error(`Coverage graph exceeds the ${policy.maxEdges}-edge policy limit.`);
  const discoveredFlows = documents.flatMap(parsedPrototypeFlows);
  const flows = uniqueById([...configuredFlows, ...discoveredFlows]).filter((flow) => flow.status !== "archived");
  if (!flows.length) {
    documents.forEach((document) => {
      const start = document.shapes.find((shape) => shape.type === "frame" && shape.prototypeStart) ?? firstTopFrame(document);
      if (start) flows.push({ id: `board-${document.boardId}`, name: document.title || "Primary flow", description: "", startBoardId: document.boardId, startFrameId: start.id, criticality: "required", status: "active" });
    });
  }
  return { nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)), edges: normalizedEdges, flows: uniqueById(flows).sort((left, right) => left.id.localeCompare(right.id)) };
};

const severityWeight: Record<CoverageSeverity, number> = { critical: 8, error: 4, warning: 2, info: 1 };
const categoryFor = (rule: CoverageRule) => rule === "ACCESSIBILITY" ? "accessibility"
  : ["REQUIRED_STATE_MISSING", "METADATA_MISSING", "REQUIREMENT_REFERENCE_MISSING"].includes(rule) ? "states"
    : rule === "ROLE_PATH_INCOMPLETE" ? "roles"
      : rule === "VIEWPORT_MISSING" ? "viewports"
        : "graph";
const findingFingerprint = (rule: CoverageRule, pieces: Array<string | undefined>) => `${rule}:${pieces.map((piece) => piece ?? "-").join(":")}`;
const makeFinding = (
  rule: CoverageRule,
  severity: CoverageSeverity,
  message: string,
  remediation: string,
  location: Pick<CoverageFinding, "boardId" | "frameId" | "flowId">,
  evidence: CoverageFinding["evidence"] = {},
): CoverageFinding => ({ fingerprint: findingFingerprint(rule, [location.flowId, location.boardId, location.frameId, ...Object.values(evidence).map(String)]), rule, severity, message, remediation, ...location, evidence, suppressed: false });
const failed = (finding: CoverageFinding): CoverageCheck => ({ fingerprint: finding.fingerprint, severity: finding.severity, passed: false, finding });
const passed = (rule: CoverageRule, severity: CoverageSeverity, pieces: string[]): CoverageCheck => ({ fingerprint: findingFingerprint(rule, pieces), severity, passed: true });

const reachableFrom = (graph: CoverageGraph, startId: string) => {
  const seen = new Set<string>();
  const queue = [startId];
  const outgoing = new Map<string, string[]>();
  graph.edges.filter((edge) => edge.targetId && !edge.broken && !edge.inaccessible).forEach((edge) => outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge.targetId!]));
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    (outgoing.get(current) ?? []).forEach((target) => { if (!seen.has(target)) queue.push(target); });
  }
  return seen;
};

const flowNodes = (graph: CoverageGraph, flow: ProductFlow) => {
  const explicit = graph.nodes.filter((node) => node.metadata.flowIds.includes(flow.id));
  if (explicit.length) return explicit;
  const reachable = reachableFrom(graph, nodeId(flow.startBoardId, flow.startFrameId));
  return graph.nodes.filter((node) => reachable.has(node.id));
};

export const analyzeProductCoverage = (
  graph: CoverageGraph,
  policy: CoveragePolicy = DEFAULT_COVERAGE_POLICY,
  suppressions: CoverageSuppression[] = [],
  now = new Date(),
): CoverageResult => {
  const checks: CoverageCheck[] = [];
  const outgoing = new Map<string, CoverageEdge[]>();
  graph.edges.forEach((edge) => outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge]));

  graph.edges.forEach((edge) => {
    const node = graph.nodes.find((candidate) => candidate.id === edge.sourceId);
    const location = { boardId: node?.boardId, frameId: node?.frameId };
    if (edge.broken) checks.push(failed(makeFinding("BROKEN_DESTINATION", "critical", "An interaction points to a missing destination.", "Choose an existing destination or remove the interaction.", location, { edgeId: edge.id })));
    else checks.push(passed("BROKEN_DESTINATION", "critical", [edge.id]));
    if (edge.inaccessible) checks.push(failed(makeFinding("INACCESSIBLE_DESTINATION", "critical", "A journey enters a board the viewer cannot access.", "Grant the required board access or change the destination.", location, { edgeId: edge.id })));
    else checks.push(passed("INACCESSIBLE_DESTINATION", "critical", [edge.id]));
  });

  graph.nodes.forEach((node) => {
    if (policy.requireMetadata && !node.annotated) checks.push(failed(makeFinding("METADATA_MISSING", "warning", `${node.name} has no product-state metadata.`, "Tag the frame with its screen, state, flow, roles, and viewport.", node)));
    else checks.push(passed("METADATA_MISSING", "warning", [node.id]));
    if (policy.requireRequirementRefs && !node.metadata.requirementRefs.length) checks.push(failed(makeFinding("REQUIREMENT_REFERENCE_MISSING", "warning", `${node.name} is not linked to a requirement.`, "Add at least one requirement reference.", node)));
    else checks.push(passed("REQUIREMENT_REFERENCE_MISSING", "warning", [node.id]));
    if (node.metadata.flowIds.some((id) => !graph.flows.some((flow) => flow.id === id))) checks.push(failed(makeFinding("STALE_METADATA_REFERENCE", "error", `${node.name} references an unavailable journey.`, "Remove the stale journey reference or restore the journey.", node, { flowIds: node.metadata.flowIds.join(",") })));
    else checks.push(passed("STALE_METADATA_REFERENCE", "error", [node.id]));
    const edges = outgoing.get(node.id) ?? [];
    const conditionalGroups = new Map<string, CoverageEdge[]>();
    edges.filter((edge) => edge.condition || edge.fallback).forEach((edge) => conditionalGroups.set(edge.trigger, [...(conditionalGroups.get(edge.trigger) ?? []), edge]));
    conditionalGroups.forEach((group, trigger) => {
      const complete = group.some((edge) => edge.fallback || !edge.condition);
      if (!complete) checks.push(failed(makeFinding("CONDITION_FALLBACK_MISSING", "error", `${node.name} has no fallback for ${trigger} conditions.`, "Add an explicit fallback transition for this trigger.", node, { trigger })));
      else checks.push(passed("CONDITION_FALLBACK_MISSING", "error", [node.id, trigger]));
    });
    if (policy.enforceRecoveryPaths && ["error", "offline", "unauthorized", "not-found"].includes(node.metadata.state)) {
      const recovers = edges.some((edge) => edge.targetId && graph.nodes.find((candidate) => candidate.id === edge.targetId && !["error", "offline", "unauthorized", "not-found"].includes(candidate.metadata.state)));
      if (!recovers) checks.push(failed(makeFinding("RECOVERY_PATH_MISSING", node.metadata.criticality === "critical" ? "critical" : "error", `${node.name} has no recovery path.`, "Add a retry, back, support, or safe-exit transition.", node)));
      else checks.push(passed("RECOVERY_PATH_MISSING", "error", [node.id]));
    }
  });

  graph.flows.forEach((flow) => {
    const startId = nodeId(flow.startBoardId, flow.startFrameId);
    const startExists = graph.nodes.some((node) => node.id === startId);
    if (!startExists) checks.push(failed(makeFinding("FLOW_START_MISSING", "critical", `${flow.name} has no valid start frame.`, "Choose an accessible top-level frame as the journey start.", { flowId: flow.id, boardId: flow.startBoardId, frameId: flow.startFrameId })));
    else checks.push(passed("FLOW_START_MISSING", "critical", [flow.id]));
    const members = flowNodes(graph, flow);
    const reachable = startExists ? reachableFrom(graph, startId) : new Set<string>();
    members.forEach((node) => {
      if (!reachable.has(node.id)) checks.push(failed(makeFinding("UNREACHABLE_SCREEN", flow.criticality === "critical" ? "critical" : "error", `${node.name} is unreachable in ${flow.name}.`, "Connect the frame to a reachable transition or remove it from the journey.", { ...node, flowId: flow.id })));
      else checks.push(passed("UNREACHABLE_SCREEN", "error", [flow.id, node.id]));
      const navigable = (outgoing.get(node.id) ?? []).some((edge) => !edge.broken && !edge.inaccessible);
      if (policy.enforceNoDeadEnds && !policy.terminalStates.includes(node.metadata.state) && !navigable) checks.push(failed(makeFinding("DEAD_END", flow.criticality === "critical" ? "critical" : "error", `${node.name} is a dead end in ${flow.name}.`, "Add an onward, back, retry, or safe-exit transition.", { ...node, flowId: flow.id })));
      else checks.push(passed("DEAD_END", "error", [flow.id, node.id]));
    });
    const screenGroups = new Map<string, CoverageNode[]>();
    members.forEach((node) => screenGroups.set(node.metadata.screenKey, [...(screenGroups.get(node.metadata.screenKey) ?? []), node]));
    screenGroups.forEach((screens, screenKey) => {
      policy.requiredStates.forEach((state) => {
        const present = screens.some((node) => node.metadata.state === state);
        if (!present) checks.push(failed(makeFinding("REQUIRED_STATE_MISSING", flow.criticality === "critical" ? "critical" : "error", `${screenKey} is missing its ${state} state.`, `Create or associate a ${state} frame for ${screenKey}.`, { flowId: flow.id, boardId: screens[0]?.boardId }, { screenKey, state })));
        else checks.push(passed("REQUIRED_STATE_MISSING", "error", [flow.id, screenKey, state]));
      });
      policy.requiredRoles.forEach((role) => {
        const present = screens.some((node) => !node.metadata.roles.length || node.metadata.roles.includes(role));
        if (!present) checks.push(failed(makeFinding("ROLE_PATH_INCOMPLETE", flow.criticality === "critical" ? "critical" : "error", `${screenKey} has no ${role} path.`, `Add ${role} to an applicable frame or create the missing role variant.`, { flowId: flow.id, boardId: screens[0]?.boardId }, { screenKey, role })));
        else checks.push(passed("ROLE_PATH_INCOMPLETE", "error", [flow.id, screenKey, role]));
      });
      policy.requiredViewports.forEach((viewport) => {
        const present = screens.some((node) => node.metadata.viewport === "responsive" || node.metadata.viewport === viewport);
        if (!present) checks.push(failed(makeFinding("VIEWPORT_MISSING", flow.criticality === "critical" ? "critical" : "warning", `${screenKey} is missing its ${viewport} design.`, `Create a ${viewport} variant or mark an existing frame responsive.`, { flowId: flow.id, boardId: screens[0]?.boardId }, { screenKey, viewport })));
        else checks.push(passed("VIEWPORT_MISSING", "warning", [flow.id, screenKey, viewport]));
      });
    });
  });

  if (policy.enforceAccessibility) {
    // Accessibility findings are computed from the source documents in the convenience entry point below.
    checks.push(passed("ACCESSIBILITY", "error", ["graph-only"]));
  }

  const activeSuppression = new Map(suppressions.filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime()).map((item) => [item.fingerprint, item]));
  const findings = checks.flatMap((check) => check.finding ? [{ ...check.finding, suppressed: activeSuppression.has(check.fingerprint) }] : []);
  const categories: Record<string, CoverageCategoryScore> = {};
  checks.forEach((check) => {
    const category = categoryFor(check.finding?.rule ?? check.fingerprint.split(":")[0] as CoverageRule);
    const score = categories[category] ?? { passed: 0, total: 0, score: 100 };
    const weight = severityWeight[check.severity];
    score.total += weight;
    if (check.passed || activeSuppression.has(check.fingerprint)) score.passed += weight;
    score.score = Math.round(score.passed / score.total * 100);
    categories[category] = score;
  });
  const total = Object.values(categories).reduce((sum, category) => sum + category.total, 0);
  const passedWeight = Object.values(categories).reduce((sum, category) => sum + category.passed, 0);
  const flowScores = Object.fromEntries(graph.flows.map((flow) => {
    const flowChecks = checks.filter((check) => check.finding?.flowId === flow.id || check.fingerprint.includes(`:${flow.id}:`));
    const flowTotal = flowChecks.reduce((sum, check) => sum + severityWeight[check.severity], 0);
    const flowPassed = flowChecks.reduce((sum, check) => sum + ((check.passed || activeSuppression.has(check.fingerprint)) ? severityWeight[check.severity] : 0), 0);
    return [flow.id, Math.round(flowPassed / flowTotal * 100)];
  }));
  return {
    policy,
    score: total ? Math.round(passedWeight / total * 100) : 100,
    criticalBlockers: findings.filter((finding) => finding.severity === "critical" && !finding.suppressed).length,
    suppressedCount: findings.filter((finding) => finding.suppressed).length,
    generatedAt: now.toISOString(),
    stale: false,
    graph,
    findings,
    categories,
    flowScores,
  };
};

export const analyzeCoverageDocuments = (
  documents: CoverageDocument[],
  flows: ProductFlow[] = [],
  policy: CoveragePolicy = DEFAULT_COVERAGE_POLICY,
  suppressions: CoverageSuppression[] = [],
  now = new Date(),
) => {
  const graph = compileCoverageGraph(documents, flows, policy);
  const result = analyzeProductCoverage(graph, policy, suppressions, now);
  if (!policy.enforceAccessibility) return result;
  const accessibility = documents.flatMap((document) => auditAccessibility(document.shapes).map((finding) => {
    const byId = new Map(document.shapes.map((shape) => [shape.id, shape]));
    const shape = byId.get(finding.shapeId)!;
    const frameId = topFrameId(shape, byId) ?? finding.shapeId;
    return makeFinding("ACCESSIBILITY", finding.severity === "error" ? "error" : "warning", finding.message, "Resolve the accessibility audit finding.", { boardId: document.boardId, frameId }, { rule: finding.rule, shapeId: finding.shapeId });
  }));
  if (!accessibility.length) return result;
  const activeSuppression = new Set(suppressions.filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime()).map((item) => item.fingerprint));
  const findings = [...result.findings, ...accessibility.map((finding) => ({ ...finding, suppressed: activeSuppression.has(finding.fingerprint) }))];
  const category = result.categories.accessibility!;
  const failedWeight = accessibility.filter((finding) => !activeSuppression.has(finding.fingerprint)).reduce((sum, finding) => sum + severityWeight[finding.severity], 0);
  const accessibilityTotal = category.total + failedWeight;
  const categories = { ...result.categories, accessibility: { passed: category.passed, total: accessibilityTotal, score: Math.round(category.passed / accessibilityTotal * 100) } };
  const total = Object.values(categories).reduce((sum, item) => sum + item.total, 0);
  const passedWeight = Object.values(categories).reduce((sum, item) => sum + item.passed, 0);
  return { ...result, score: Math.round(passedWeight / total * 100), criticalBlockers: findings.filter((finding) => finding.severity === "critical" && !finding.suppressed).length, suppressedCount: findings.filter((finding) => finding.suppressed).length, findings, categories };
};

export const compareCoverageResults = (before: CoverageResult, after: CoverageResult): CoverageDelta => {
  const beforeById = new Map(before.findings.filter((finding) => !finding.suppressed).map((finding) => [finding.fingerprint, finding]));
  const afterById = new Map(after.findings.filter((finding) => !finding.suppressed).map((finding) => [finding.fingerprint, finding]));
  const newFindings = [...afterById.values()].filter((finding) => !beforeById.has(finding.fingerprint));
  const resolvedFindings = [...beforeById.values()].filter((finding) => !afterById.has(finding.fingerprint));
  const severityChanges = [...afterById.values()].flatMap((finding) => {
    const previous = beforeById.get(finding.fingerprint);
    return previous && previous.severity !== finding.severity ? [{ fingerprint: finding.fingerprint, before: previous.severity, after: finding.severity }] : [];
  });
  return {
    scoreDelta: after.score - before.score,
    newFindings,
    resolvedFindings,
    severityChanges,
    blocking: after.score < after.policy.minimumScore || after.criticalBlockers > 0 || (after.policy.blockCriticalRegressions && newFindings.some((finding) => finding.severity === "critical")),
  };
};

export const compilePlaywrightJourney = (graph: CoverageGraph, flowId: string) => {
  const flow = graph.flows.find((candidate) => candidate.id === flowId);
  if (!flow) return { code: "", unsupported: [`Unknown flow: ${flowId}`] };
  const startId = nodeId(flow.startBoardId, flow.startFrameId);
  const reachable = reachableFrom(graph, startId);
  const supportedActions = new Set(["navigate", "open-board"]);
  const edges = graph.edges.filter((edge) => reachable.has(edge.sourceId));
  const unsupported = edges.flatMap((edge) => edge.condition
    ? [`${edge.id}: conditional transition requires a fixture`]
    : !supportedActions.has(edge.action)
      ? [`${edge.id}: unsupported ${edge.action} action`]
      : edge.trigger !== "click"
        ? [`${edge.id}: ${edge.trigger} transition requires a fixture`]
        : []);
  const journey: CoverageEdge[] = [];
  const visited = new Set([startId]);
  let currentId = startId;
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const choices = edges
      .filter((edge) => edge.sourceId === currentId && supportedActions.has(edge.action) && edge.trigger === "click" && !edge.condition && edge.targetId && !edge.broken && !edge.inaccessible)
      .sort((left, right) => Number(right.fallback) - Number(left.fallback) || left.id.localeCompare(right.id));
    if (!choices.length) break;
    if (choices.length > 1) unsupported.push(`${currentId}: branching path requires a fixture`);
    const selected = choices[0]!;
    journey.push(selected);
    if (visited.has(selected.targetId!)) {
      unsupported.push(`${selected.id}: cycle ends the generated journey`);
      break;
    }
    currentId = selected.targetId!;
    visited.add(currentId);
  }
  const steps = journey
    .map((edge) => `  await page.getByTestId(${JSON.stringify(`prototype-edge-${edge.id}`)}).click();\n  await expect(page.getByTestId(${JSON.stringify(`prototype-frame-${edge.targetId}`)})).toBeVisible();`).join("\n");
  return { code: `import { test, expect } from "@playwright/test";\n\ntest(${JSON.stringify(flow.name)}, async ({ page }) => {\n  await page.goto(${JSON.stringify(`/?board=${flow.startBoardId}&present=1&flow=${flow.id}`)});\n  await expect(page.getByTestId(${JSON.stringify(`prototype-frame-${startId}`)})).toBeVisible();${steps ? `\n${steps}` : ""}\n});\n`, unsupported };
};

export const analyzeCoverageTelemetry = (result: CoverageResult, events: CoverageTelemetryEvent[]) => {
  const designed = new Set(result.graph.nodes.map((node) => `${node.metadata.screenKey}:${node.metadata.state}`));
  const observed = new Set(events.map((event) => `${event.screenKey}:${event.state}`));
  const neverObserved = [...designed].filter((key) => !observed.has(key));
  const notDesigned = [...observed].filter((key) => !designed.has(key));
  const failures = events.filter((event) => event.outcome === "failure").reduce<Record<string, number>>((counts, event) => ({ ...counts, [event.screenKey]: (counts[event.screenKey] ?? 0) + 1 }), {});
  const abandonments = events.filter((event) => event.outcome === "abandoned").reduce<Record<string, number>>((counts, event) => ({ ...counts, [event.screenKey]: (counts[event.screenKey] ?? 0) + 1 }), {});
  return { neverObserved, notDesigned, failures, abandonments };
};

export const suggestCoverageDrafts = (result: CoverageResult): CoverageDraftSuggestion[] => result.findings.filter((finding) => !finding.suppressed).flatMap<CoverageDraftSuggestion>((finding) => {
  if (finding.rule === "REQUIRED_STATE_MISSING") return [{ findingFingerprint: finding.fingerprint, kind: "create-state" as const, title: `Draft ${finding.evidence.state} state`, prompt: `Create a ${finding.evidence.state} state for ${finding.evidence.screenKey}, preserving the existing design system and making the recovery or success outcome explicit.` }];
  if (finding.rule === "RECOVERY_PATH_MISSING" || finding.rule === "DEAD_END") return [{ findingFingerprint: finding.fingerprint, kind: "connect-path" as const, title: "Draft recovery path", prompt: `Add an explicit, accessible recovery or safe-exit path for ${finding.frameId}.` }];
  if (finding.rule === "VIEWPORT_MISSING") return [{ findingFingerprint: finding.fingerprint, kind: "create-viewport" as const, title: `Draft ${finding.evidence.viewport} variant`, prompt: `Create a ${finding.evidence.viewport} variant for ${finding.evidence.screenKey} using responsive layout constraints.` }];
  return [];
});
