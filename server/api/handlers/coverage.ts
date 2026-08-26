import { createHash, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Shape } from "../../../src/classes/shape.js";
import {
  analyzeCoverageDocuments,
  analyzeCoverageTelemetry,
  compareCoverageResults,
  formatCoverageReport,
  suggestCoverageDrafts,
  type CoverageDocument,
  type CoverageResult,
  type CoverageSuppression,
  type CoverageTelemetryEvent,
  type ProductFlow,
} from "../../../src/platform/productCoverage.js";
import { requireActor } from "../_auth.js";
import { getBoardAccess, type BoardAccess } from "../_boards.js";
import { coverageRevisionKey, normalizeCoveragePolicy, normalizeProductFlow } from "../_coverage.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { liveblocksAdmin } from "../_liveblocks.js";
import { supabaseAdmin } from "../_supabase.js";

const editable = (role: string) => role === "owner" || role === "editor";
const checksum = (document: unknown) => createHash("sha256").update(JSON.stringify(document)).digest("hex");
const documentShapes = (document: unknown): Shape[] => {
  if (!document || typeof document !== "object") return [];
  const nodes = (document as Record<string, unknown>).nodes;
  if (!nodes || typeof nodes !== "object") return [];
  return Object.entries(nodes as Record<string, Shape>).map(([id, shape]) => ({ ...shape, id: shape.id ?? id }));
};
const flowRow = (row: Record<string, unknown>): ProductFlow => ({
  id: String(row.id), name: String(row.name), description: String(row.description ?? ""),
  startBoardId: String(row.start_board_id), startFrameId: String(row.start_frame_id),
  criticality: row.criticality as ProductFlow["criticality"], ownerId: typeof row.owner_id === "string" ? row.owner_id : null,
  status: row.status === "archived" ? "archived" : "active",
});
const suppressionRow = (row: Record<string, unknown>): CoverageSuppression => ({
  fingerprint: String(row.fingerprint), reason: String(row.reason), ownerId: String(row.owner_id), expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
});

const workspaceRole = async (workspaceId: string, actorId: string) => {
  const { data, error } = await supabaseAdmin().from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", actorId).maybeSingle();
  if (error) throw error;
  return typeof data?.role === "string" ? data.role : null;
};

const loadConfiguration = async (workspaceId: string) => {
  const database = supabaseAdmin();
  const [{ data: flowRows, error: flowError }, { data: policyRow, error: policyError }, { data: suppressionRows, error: suppressionError }] = await Promise.all([
    database.from("product_flows").select("id, name, description, start_board_id, start_frame_id, criticality, owner_id, status").eq("workspace_id", workspaceId).eq("status", "active").order("updated_at", { ascending: false }),
    database.from("coverage_policies").select("id, name, version, config").eq("workspace_id", workspaceId).eq("active", true).maybeSingle(),
    database.from("coverage_suppressions").select("fingerprint, reason, owner_id, expires_at").eq("workspace_id", workspaceId),
  ]);
  if (flowError) throw flowError;
  if (policyError) throw policyError;
  if (suppressionError) throw suppressionError;
  const config = policyRow && typeof policyRow.config === "object" ? { ...(policyRow.config as Record<string, unknown>), id: policyRow.id, name: policyRow.name, version: policyRow.version } : undefined;
  return {
    flows: (flowRows ?? []).map((row) => flowRow(row as Record<string, unknown>)),
    policy: normalizeCoveragePolicy(config),
    suppressions: (suppressionRows ?? []).map((row) => suppressionRow(row as Record<string, unknown>)),
    policyId: typeof policyRow?.id === "string" ? policyRow.id : null,
  };
};

const branchRoom = async (boardId: string, branchId: string) => {
  if (!branchId) return null;
  const { data, error } = await supabaseAdmin().from("document_branches").select("id, room_id, status").eq("id", branchId).eq("board_id", boardId).maybeSingle();
  if (error) throw error;
  return data?.status === "open" && typeof data.room_id === "string" ? data.room_id : null;
};

const loadCoverageDocuments = async (root: BoardAccess, actorId: string, branchId: string) => {
  const database = supabaseAdmin();
  const liveblocks = liveblocksAdmin();
  const documents: CoverageDocument[] = [];
  const inputs: Array<{ boardId: string; roomId: string; checksum: string }> = [];
  const visited = new Set<string>();
  let frontier = [root.board.id];
  const accessById = new Map<string, BoardAccess | null>([[root.board.id, root]]);
  const roomOverride = await branchRoom(root.board.id, branchId);
  if (branchId && !roomOverride) throw new Error("This design branch is not open.");

  while (frontier.length && visited.size < 100) {
    const current = frontier.filter((id) => !visited.has(id)).slice(0, 100 - visited.size);
    current.forEach((id) => visited.add(id));
    await Promise.all(current.map(async (boardId) => {
      const access = accessById.get(boardId) ?? null;
      if (!access) {
        documents.push({ boardId, title: "Private board", accessible: false, shapes: [{ id: "__private__", type: "frame", name: "Private board", x1: 0, y1: 0, x2: 1, y2: 1, width: 1, height: 1, level: 0, zIndex: 0 }] });
        return;
      }
      const roomId = boardId === root.board.id && roomOverride ? roomOverride : access.board.liveblocks_room_id;
      const document = await liveblocks.getStorageDocument(roomId, "json");
      const hash = checksum(document);
      documents.push({ boardId, title: access.board.title, accessible: true, shapes: documentShapes(document), roomId, checksum: hash });
      inputs.push({ boardId, roomId, checksum: hash });
    }));
    const traversable = current.filter((boardId) => accessById.get(boardId));
    if (!traversable.length) {
      frontier = [];
      continue;
    }
    const { data: links, error } = await database.from("board_links").select("source_board_id, target_board_id").in("source_board_id", traversable);
    if (error) throw error;
    const targets = [...new Set((links ?? []).map((link) => String(link.target_board_id)).filter((id) => !visited.has(id)))];
    await Promise.all(targets.map(async (target) => accessById.set(target, await getBoardAccess(target, actorId))));
    frontier = targets;
  }
  if (frontier.length) throw new Error("Coverage traversal exceeded the 100-board safety limit.");
  documents.sort((left, right) => left.boardId.localeCompare(right.boardId));
  inputs.sort((left, right) => left.boardId.localeCompare(right.boardId));
  return { documents, inputs };
};

const persistCoverageRun = async (
  workspaceId: string,
  boardId: string,
  branchId: string,
  actorId: string,
  policyId: string | null,
  result: CoverageResult,
  inputs: Array<{ boardId: string; roomId: string; checksum: string }>,
) => {
  const database = supabaseAdmin();
  const revisionKey = coverageRevisionKey(inputs);
  const rootChecksum = inputs.find((input) => input.boardId === boardId)!.checksum;
  const id = randomUUID();
  const { data, error } = await database.rpc("persist_kumo_coverage_run", {
    p_run_id: id,
    p_workspace_id: workspaceId,
    p_root_board_id: boardId,
    p_branch_id: branchId || null,
    p_policy_id: policyId,
    p_policy_version: result.policy.version,
    p_revision_key: revisionKey,
    p_root_checksum: rootChecksum,
    p_score: result.score,
    p_critical_blockers: result.criticalBlockers,
    p_result: result,
    p_created_by: actorId,
    p_inputs: inputs.map((input) => ({ board_id: input.boardId, room_id: input.roomId, checksum: input.checksum })),
    p_findings: result.findings.map((finding) => ({ fingerprint: finding.fingerprint, rule: finding.rule, severity: finding.severity, board_id: finding.boardId, frame_id: finding.frameId ?? null, flow_id: finding.flowId ?? null, message: finding.message, evidence: finding.evidence, suppressed: finding.suppressed })),
  });
  if (error) throw error;
  const runId = typeof data === "string" ? data : id;
  return { runId, revisionKey, rootChecksum };
};

const runCoverage = async (access: BoardAccess, workspaceId: string, actorId: string, branchId: string, persist: boolean) => {
  const configuration = await loadConfiguration(workspaceId);
  const { documents, inputs } = await loadCoverageDocuments(access, actorId, branchId);
  const result = analyzeCoverageDocuments(documents, configuration.flows, configuration.policy, configuration.suppressions);
  const persisted = persist ? await persistCoverageRun(workspaceId, access.board.id, branchId, actorId, configuration.policyId, result, inputs) : null;
  return { result, inputs, persisted };
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const actor = await requireActor(request);
    const boardId = request.method === "GET" ? stringQuery(request.query.boardId).trim() : String(request.body?.boardId ?? "").trim();
    if (!boardId) return response.status(400).json({ error: "A board is required." });
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    const workspaceId = access.board.workspace_id;
    if (!workspaceId) return response.status(409).json({ error: "Move this board into a workspace before using product coverage." });
    const database = supabaseAdmin();

    if (request.method === "GET") {
      const scope = stringQuery(request.query.scope) || "overview";
      if (scope === "run") {
        const analysis = await runCoverage(access, workspaceId, actor.uid, stringQuery(request.query.branchId), false);
        return response.status(200).json(analysis);
      }
      if (scope === "report") {
        const format = ["json", "junit", "sarif"].includes(stringQuery(request.query.format)) ? stringQuery(request.query.format) as "json" | "junit" | "sarif" : "json";
        const branchId = stringQuery(request.query.branchId);
        let reportQuery = database.from("coverage_runs").select("result").eq("root_board_id", boardId);
        reportQuery = branchId ? reportQuery.eq("branch_id", branchId) : reportQuery.is("branch_id", null);
        const { data, error } = await reportQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        if (!data?.result) return response.status(404).json({ error: "Run coverage before exporting a report." });
        response.setHeader("Content-Type", format === "junit" ? "application/xml; charset=utf-8" : "application/json; charset=utf-8");
        response.setHeader("Content-Disposition", `attachment; filename="kumo-product-coverage.${format === "junit" ? "xml" : format === "sarif" ? "sarif.json" : "json"}"`);
        return response.status(200).send(formatCoverageReport(data.result as CoverageResult, format));
      }
      if (scope !== "overview") return response.status(400).json({ error: "Unknown coverage scope." });
      const configuration = await loadConfiguration(workspaceId);
      const [{ data: runs, error: runError }, { data: gate, error: gateError }, memberRole] = await Promise.all([
        database.from("coverage_runs").select("id, branch_id, policy_version, revision_key, root_checksum, score, critical_blockers, status, created_at").eq("root_board_id", boardId).order("created_at", { ascending: false }).limit(30),
        database.from("coverage_merge_gates").select("mode, minimum_score, block_critical_regressions, updated_at").eq("board_id", boardId).maybeSingle(),
        workspaceRole(workspaceId, actor.uid),
      ]);
      if (runError) throw runError;
      if (gateError) throw gateError;
      return response.status(200).json({ ...configuration, runs: runs ?? [], gate: gate ?? { mode: "advisory", minimum_score: configuration.policy.minimumScore, block_critical_regressions: configuration.policy.blockCriticalRegressions }, permissions: { managePolicy: memberRole === "owner" || memberRole === "admin", manageGate: access.role === "owner" } });
    }

    const action = typeof request.body?.action === "string" ? request.body.action : "run";
    if (action === "run") {
      const analysis = await runCoverage(access, workspaceId, actor.uid, typeof request.body?.branchId === "string" ? request.body.branchId : "", request.body?.persist !== false);
      return response.status(200).json(analysis);
    }
    if (!editable(access.role)) return response.status(403).json({ error: "Editing access is required to manage product coverage." });

    if (action === "save-flow") {
      const flow = normalizeProductFlow(request.body?.flow);
      if (!flow || flow.startBoardId !== boardId) return response.status(400).json({ error: "A valid journey on this board is required." });
      const { data, error } = await database.rpc("save_kumo_product_flow", {
        p_id: flow.id,
        p_workspace_id: workspaceId,
        p_name: flow.name,
        p_description: flow.description,
        p_start_board_id: flow.startBoardId,
        p_start_frame_id: flow.startFrameId,
        p_criticality: flow.criticality,
        p_owner_id: actor.uid,
        p_status: flow.status,
      });
      if (error) throw error;
      return response.status(200).json({ flow: flowRow(data as Record<string, unknown>) });
    }
    if (action === "archive-flow") {
      const flowId = typeof request.body?.flowId === "string" ? request.body.flowId : "";
      if (!flowId) return response.status(400).json({ error: "A journey is required." });
      const { error } = await database.from("product_flows").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", flowId).eq("workspace_id", workspaceId).eq("start_board_id", boardId);
      if (error) throw error;
      return response.status(200).json({ archived: true });
    }
    if (action === "save-policy") {
      const role = await workspaceRole(workspaceId, actor.uid);
      if (role !== "owner" && role !== "admin") return response.status(403).json({ error: "Workspace administration is required to change coverage policy." });
      const current = await loadConfiguration(workspaceId);
      const policy = normalizeCoveragePolicy(request.body?.policy, current.policy);
      const { data, error } = await database.rpc("create_kumo_coverage_policy_version", {
        p_workspace_id: workspaceId,
        p_name: policy.name,
        p_config: policy,
        p_created_by: actor.uid,
      });
      if (error) throw error;
      const created = data && typeof data === "object" ? data as Record<string, unknown> : {};
      return response.status(201).json({ policy: normalizeCoveragePolicy({ ...policy, id: created.id, version: created.version }, policy) });
    }
    if (action === "suppress") {
      const fingerprint = typeof request.body?.fingerprint === "string" ? request.body.fingerprint.slice(0, 1000) : "";
      const reason = typeof request.body?.reason === "string" ? request.body.reason.trim().slice(0, 1000) : "";
      if (!fingerprint || reason.length < 3) return response.status(400).json({ error: "A finding and a meaningful suppression reason are required." });
      const expiresAt = typeof request.body?.expiresAt === "string" && Number.isFinite(new Date(request.body.expiresAt).getTime()) ? request.body.expiresAt : null;
      const { error } = await database.from("coverage_suppressions").upsert({ workspace_id: workspaceId, fingerprint, reason, owner_id: actor.uid, expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,fingerprint" });
      if (error) throw error;
      return response.status(200).json({ suppressed: true });
    }
    if (action === "unsuppress") {
      const fingerprint = typeof request.body?.fingerprint === "string" ? request.body.fingerprint : "";
      if (!fingerprint) return response.status(400).json({ error: "A finding is required." });
      const { error } = await database.from("coverage_suppressions").delete().eq("workspace_id", workspaceId).eq("fingerprint", fingerprint);
      if (error) throw error;
      return response.status(200).json({ suppressed: false });
    }
    if (action === "save-gate") {
      if (access.role !== "owner") return response.status(403).json({ error: "Only the board owner can change merge enforcement." });
      const mode = ["off", "advisory", "enforced"].includes(request.body?.mode) ? request.body.mode : "advisory";
      const minimumScore = Number.isInteger(request.body?.minimumScore) ? Math.max(0, Math.min(100, request.body.minimumScore)) : 90;
      const { data, error } = await database.from("coverage_merge_gates").upsert({ board_id: boardId, mode, minimum_score: minimumScore, block_critical_regressions: request.body?.blockCriticalRegressions !== false, updated_by: actor.uid, updated_at: new Date().toISOString() }).select("mode, minimum_score, block_critical_regressions, updated_at").single();
      if (error) throw error;
      return response.status(200).json({ gate: data });
    }
    if (action === "compare") {
      const beforeId = typeof request.body?.beforeRunId === "string" ? request.body.beforeRunId : "";
      const afterId = typeof request.body?.afterRunId === "string" ? request.body.afterRunId : "";
      const { data, error } = await database.from("coverage_runs").select("id, result").eq("root_board_id", boardId).in("id", [beforeId, afterId]);
      if (error) throw error;
      const before = (data ?? []).find((run) => run.id === beforeId)?.result as CoverageResult | undefined;
      const after = (data ?? []).find((run) => run.id === afterId)?.result as CoverageResult | undefined;
      if (!before || !after) return response.status(404).json({ error: "Both coverage runs are required." });
      return response.status(200).json({ delta: compareCoverageResults(before, after) });
    }
    if (action === "telemetry") {
      const events: unknown[] = Array.isArray(request.body?.events) ? request.body.events.slice(0, 100) as unknown[] : [];
      const normalized: CoverageTelemetryEvent[] = events.flatMap((value): CoverageTelemetryEvent[] => {
        if (!value || typeof value !== "object") return [];
        const event = value as Record<string, unknown>;
        if (typeof event.screenKey !== "string" || typeof event.state !== "string" || !["entered", "success", "failure", "abandoned"].includes(String(event.outcome))) return [];
        return [{ screenKey: event.screenKey.trim().slice(0, 160), state: event.state.trim().slice(0, 80), role: typeof event.role === "string" ? event.role.slice(0, 80) : undefined, viewport: ["mobile", "tablet", "desktop", "responsive"].includes(String(event.viewport)) ? event.viewport as CoverageTelemetryEvent["viewport"] : undefined, outcome: event.outcome as CoverageTelemetryEvent["outcome"], durationMs: typeof event.durationMs === "number" ? Math.max(0, Math.min(86_400_000, Math.round(event.durationMs))) : undefined }];
      }).filter((event) => event.screenKey && event.state);
      if (!normalized.length) return response.status(400).json({ error: "At least one valid telemetry event is required." });
      const { error } = await database.from("coverage_telemetry_events").insert(normalized.map((event) => ({ workspace_id: workspaceId, board_id: boardId, screen_key: event.screenKey, state_kind: event.state, role_key: event.role ?? null, viewport: event.viewport ?? null, outcome: event.outcome, duration_ms: event.durationMs ?? null })));
      if (error) throw error;
      return response.status(202).json({ accepted: normalized.length });
    }
    if (action === "telemetry-analysis" || action === "suggest") {
      const analysis = await runCoverage(access, workspaceId, actor.uid, typeof request.body?.branchId === "string" ? request.body.branchId : "", false);
      if (action === "suggest") return response.status(200).json({ suggestions: suggestCoverageDrafts(analysis.result) });
      const { data, error } = await database.from("coverage_telemetry_events").select("screen_key, state_kind, role_key, viewport, outcome, duration_ms").eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }).limit(10_000);
      if (error) throw error;
      const events: CoverageTelemetryEvent[] = (data ?? []).map((event) => ({ screenKey: String(event.screen_key), state: String(event.state_kind), role: typeof event.role_key === "string" ? event.role_key : undefined, viewport: event.viewport as CoverageTelemetryEvent["viewport"], outcome: event.outcome as CoverageTelemetryEvent["outcome"], durationMs: typeof event.duration_ms === "number" ? event.duration_ms : undefined }));
      return response.status(200).json({ telemetry: analyzeCoverageTelemetry(analysis.result, events) });
    }
    return response.status(400).json({ error: "Unknown coverage action." });
  } catch (error) {
    console.error("Coverage API request failed", error);
    const message = errorMessage(error, "Product coverage could not be updated.");
    const status = message === "Authentication required." ? 401 : message.includes("exceed") ? 422 : 500;
    return response.status(status).json({ error: message });
  }
}
