import { ArrowClockwise, Check, Gauge, Graph } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { duplicateShapes } from "../../editor/commands";
import { useEditorActions } from "../../editor/useEditorActions";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import {
  analyzeCoverageDocuments,
  compilePlaywrightJourney,
  DEFAULT_COVERAGE_POLICY,
  formatCoverageReport,
  patchFrameProductMetadata,
  PRODUCT_STATE_KINDS,
  suggestCoverageDrafts,
  type CoverageDraftSuggestion,
  type CoverageDelta,
  type CoverageFinding,
  type CoverageResult,
  type ProductCriticality,
} from "../../platform/productCoverage";
import {
  archiveProductFlow,
  compareCoverageRuns,
  loadCoverageOverview,
  loadCoverageTelemetry,
  requestCoverageSuggestions,
  runProductCoverage,
  saveCoverageGate,
  saveCoveragePolicy,
  saveProductFlow,
  suppressCoverageFinding,
  unsuppressCoverageFinding,
  type CoverageOverview,
} from "../../services/coverageRepository";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

type CoverageSection = "findings" | "matrix" | "journeys" | "history" | "policy" | "evidence";
type FindingFilter = "active" | "all" | "critical";
const caughtMessage = (caught: unknown) => caught instanceof Error ? caught.message : "The coverage operation failed.";
const downloadCoverageReport = (result: CoverageResult, format: "json" | "junit" | "sarif") => {
  const mime = format === "junit" ? "application/xml" : "application/json";
  const extension = format === "junit" ? "xml" : "json";
  const url = URL.createObjectURL(new Blob([formatCoverageReport(result, format)], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kumo-product-coverage.${format === "sarif" ? "sarif.json" : extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const ProductCoveragePanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const actions = useEditorActions();
  const [overview, setOverview] = useState<CoverageOverview | null>(null);
  const [remoteResult, setRemoteResult] = useState<{ result: CoverageResult; shapes: typeof board.shapes } | null>(null);
  const [section, setSection] = useState<CoverageSection>("findings");
  const [filter, setFilter] = useState<FindingFilter>("active");
  const [flowName, setFlowName] = useState("");
  const [flowCriticality, setFlowCriticality] = useState<ProductCriticality>("required");
  const [flowStartFrameId, setFlowStartFrameId] = useState("");
  const [suppressionReason, setSuppressionReason] = useState("Not applicable to this product requirement.");
  const [suggestions, setSuggestions] = useState<CoverageDraftSuggestion[]>([]);
  const [comparison, setComparison] = useState<CoverageDelta | null>(null);
  const [telemetry, setTelemetry] = useState<{ neverObserved: string[]; notDesigned: string[]; failures: Record<string, number>; abandonments: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firstFrameId = board.shapes.find((shape) => shape.type === "frame" && !shape.parentId)?.id ?? "";

  useEffect(() => {
    if (!board.id) return;
    let active = true;
    void loadCoverageOverview(board.id).then((next) => {
      if (!active) return;
      setOverview(next);
      setFlowStartFrameId((current) => current || firstFrameId);
    }).catch((caught) => { if (active) setError(caughtMessage(caught)); });
    return () => { active = false; };
  }, [board.id, firstFrameId]);

  const localResult = useMemo(() => {
    if (!board.id) return null;
    try {
      return analyzeCoverageDocuments([{ boardId: board.id, title: board.title ?? "Board", shapes: board.shapes, accessible: true, roomId: board.roomId ?? undefined }], overview?.flows ?? [], overview?.policy ?? DEFAULT_COVERAGE_POLICY, overview?.suppressions ?? []);
    } catch {
      return null;
    }
  }, [board.id, board.roomId, board.shapes, board.title, overview]);
  const result = remoteResult?.shapes === board.shapes ? remoteResult.result : localResult;
  const findings = (result?.findings ?? []).filter((finding) => filter === "all" ? true : filter === "critical" ? finding.severity === "critical" && !finding.suppressed : !finding.suppressed);
  const screens = [...new Set((result?.graph.nodes ?? []).map((node) => node.metadata.screenKey))].sort();

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage(null); setError(null);
    try { await operation(); }
    catch (caught) { setError(caughtMessage(caught)); }
    finally { setBusy(false); }
  };
  const select = (shapeId: string) => dispatch(setSelectedShapes([shapeId]));
  const refreshOverview = async () => {
    setOverview(await loadCoverageOverview(board.id!));
  };
  const runFullGraph = async () => {
    const next = await runProductCoverage(board.id!, board.activeBranchId, true);
    setRemoteResult({ result: next, shapes: board.shapes });
    await refreshOverview();
    setMessage(`Coverage is ${next.score}% with ${next.criticalBlockers} critical blocker${next.criticalBlockers === 1 ? "" : "s"}.`);
  };
  const createFlow = async () => {
    const saved = await saveProductFlow(board.id!, { id: crypto.randomUUID(), name: flowName.trim(), description: "", startBoardId: board.id!, startFrameId: flowStartFrameId, criticality: flowCriticality, ownerId: board.uid, status: "active" });
    const existing = board.shapes.find((shape) => shape.id === flowStartFrameId)?.productState?.flowIds ?? [];
    actions.commitShapes(patchFrameProductMetadata(board.shapes, flowStartFrameId, { flowIds: [...new Set([...existing, saved.id])] }));
    setFlowName("");
    setOverview((current) => current ? { ...current, flows: [saved, ...current.flows] } : current);
    setMessage(`${saved.name} is ready for coverage.`);
  };
  const createMissingState = (finding: CoverageFinding) => {
    const screenKey = typeof finding.evidence.screenKey === "string" ? finding.evidence.screenKey : "";
    const state = PRODUCT_STATE_KINDS.includes(finding.evidence.state as never) ? finding.evidence.state as NonNullable<typeof board.shapes[number]["productState"]>["state"] : "default";
    const source = board.shapes.find((shape) => shape.type === "frame" && shape.productState?.screenKey === screenKey);
    if (!source?.productState) { setError("Tag an existing frame for this screen before creating a missing state."); return; }
    const duplicated = duplicateShapes(board.shapes, [source.id]);
    const rootId = duplicated.duplicatedIds[0];
    actions.commitShapes(duplicated.shapes.map((shape) => shape.id === rootId ? { ...shape, name: `${screenKey} · ${state}`, productState: { ...source.productState!, state } } : shape));
    select(rootId!);
    setRemoteResult(null);
    setMessage(`Created a draft ${state} state for ${screenKey}.`);
  };
  const updateSuppression = async (finding: CoverageFinding, suppress: boolean) => {
    if (suppress) await suppressCoverageFinding(board.id!, finding.fingerprint, suppressionReason);
    else await unsuppressCoverageFinding(board.id!, finding.fingerprint);
    await refreshOverview();
    setRemoteResult(null);
    setMessage(suppress ? "Finding marked not applicable with an audit reason." : "Finding restored to active coverage.");
  };

  return <>
    <section className={styles.inspectorSection}>
      <h2><Gauge aria-hidden="true" /> Product coverage</h2>
      <p className={styles.fieldHint}>Proves critical journeys across states, roles, viewports, permissions, recovery, and accessibility.</p>
      {!result ? <p role="status">Preparing coverage…</p> : <>
        <div className={styles.coverageHero} data-blocked={result.criticalBlockers > 0 || undefined}><strong>{result.score}%</strong><span>{result.criticalBlockers ? `${result.criticalBlockers} critical blocker${result.criticalBlockers === 1 ? "" : "s"}` : "No critical blockers"}<small>{result.findings.filter((finding) => !finding.suppressed).length} active · {result.suppressedCount} suppressed</small></span></div>
        <div className={styles.coverageBars}>{Object.entries(result.categories).map(([category, score]) => <div key={category}><span>{category}<b>{score.score}%</b></span><progress max="100" value={score.score} aria-label={`${category} coverage`} /></div>)}</div>
      </>}
      <div className={styles.buttonGrid}>
        <button type="button" disabled={busy || !board.id} onClick={() => void run(runFullGraph)}><ArrowClockwise aria-hidden="true" /> Run full graph</button>
        {(["json", "junit", "sarif"] as const).map((format) => <button type="button" className={styles.coverageExport} disabled={!result} onClick={() => downloadCoverageReport(result!, format)} key={format}>{format.toUpperCase()}</button>)}
      </div>
      <div className={styles.coverageSections} role="tablist" aria-label="Coverage views">{(["findings", "matrix", "journeys", "history", "policy", "evidence"] as const).map((item) => <button type="button" role="tab" aria-selected={section === item} key={item} onClick={() => setSection(item)}>{item}</button>)}</div>
    </section>

    {section === "findings" && <section className={styles.inspectorSection}>
      <h2>Findings</h2>
      <div className={styles.segmented} role="group" aria-label="Finding filter">{(["active", "critical", "all"] as const).map((item) => <button type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
      <label className={styles.fullField}><span>Not-applicable reason</span><input value={suppressionReason} onChange={(event) => setSuppressionReason(event.target.value)} /></label>
      {!findings.length && <p className={styles.successLine}><Check aria-hidden="true" /> No findings in this view.</p>}
      <div className={styles.coverageFindingList}>{findings.map((finding) => <article key={finding.fingerprint} className={styles.coverageFinding} data-severity={finding.severity}>
        <button type="button" className={styles.coverageFindingJump} disabled={finding.boardId !== board.id || !finding.frameId} onClick={() => select(finding.frameId!)}><span>{finding.message}</span><small>{finding.severity} · {finding.rule.replaceAll("_", " ").toLowerCase()}</small></button>
        <p>{finding.remediation}</p><div>{finding.rule === "REQUIRED_STATE_MISSING" && <button type="button" disabled={!actions.canEdit} onClick={() => createMissingState(finding)}>Create state</button>}{finding.suppressed ? <button type="button" disabled={!actions.canEdit} onClick={() => void run(() => updateSuppression(finding, false))}>Restore</button> : <button type="button" disabled={!actions.canEdit || suppressionReason.trim().length < 3} onClick={() => void run(() => updateSuppression(finding, true))}>Not applicable</button>}</div>
      </article>)}</div>
    </section>}

    {section === "matrix" && <section className={styles.inspectorSection}><h2>State matrix</h2>{!screens.length ? <p className={styles.fieldHint}>Tag frames to build the matrix.</p> : <div className={styles.coverageMatrix} role="table" aria-label="Screen and state coverage"><div role="row"><b role="columnheader">Screen</b>{(overview?.policy.requiredStates ?? DEFAULT_COVERAGE_POLICY.requiredStates).map((state) => <b role="columnheader" key={state}>{state}</b>)}</div>{screens.map((screen) => <div role="row" key={screen}><span role="rowheader">{screen}</span>{(overview?.policy.requiredStates ?? DEFAULT_COVERAGE_POLICY.requiredStates).map((state) => {
      const node = result?.graph.nodes.find((candidate) => candidate.metadata.screenKey === screen && candidate.metadata.state === state);
      return <span role="cell" className={styles.coverageMatrixCell} key={state}><button type="button" aria-label={`${screen} ${state}: ${node ? "covered" : "missing"}`} data-covered={Boolean(node) || undefined} disabled={!node || node.boardId !== board.id} onClick={() => select(node!.frameId)}>{node ? "✓" : "—"}</button></span>;
    })}</div>)}</div>}</section>}

    {section === "journeys" && <section className={styles.inspectorSection}>
      <h2>Critical journeys</h2><div className={styles.assetList}>{(overview?.flows ?? result?.graph.flows ?? []).map((journey) => <div className={styles.assetRow} key={journey.id}><span><Graph aria-hidden="true" />{journey.name}<small>{journey.criticality} · {result?.flowScores[journey.id] ?? 100}%</small></span><div><button type="button" disabled={journey.startBoardId !== board.id} onClick={() => select(journey.startFrameId)}>Start</button><button type="button" disabled={!actions.canEdit || journey.startBoardId !== board.id} onClick={() => void run(async () => { await archiveProductFlow(board.id!, journey.id); setOverview((current) => current ? { ...current, flows: current.flows.filter((item) => item.id !== journey.id) } : current); })}>Archive</button></div></div>)}</div>
      <h2>New journey</h2><label className={styles.fullField}><span>Name</span><input value={flowName} onChange={(event) => setFlowName(event.target.value)} placeholder="Purchase" /></label><label className={styles.fullField}><span>Start frame</span><select value={flowStartFrameId} onChange={(event) => setFlowStartFrameId(event.target.value)}><option value="">Choose…</option>{board.shapes.filter((shape) => shape.type === "frame" && !shape.parentId).map((shape) => <option value={shape.id} key={shape.id}>{shape.name ?? shape.id}</option>)}</select></label><label className={styles.fullField}><span>Criticality</span><select value={flowCriticality} onChange={(event) => setFlowCriticality(event.target.value as ProductCriticality)}><option value="critical">Critical</option><option value="required">Required</option><option value="optional">Optional</option></select></label><button type="button" disabled={!actions.canEdit || !flowName.trim() || !flowStartFrameId || busy} onClick={() => void run(createFlow)}>Create journey</button>
      {result && <div className={styles.coverageGraph} role="img" aria-label={`${result.graph.nodes.length} journey states and ${result.graph.edges.length} transitions`}>{result.graph.nodes.map((node) => <button type="button" key={node.id} disabled={node.boardId !== board.id} onClick={() => select(node.frameId)}><b>{node.metadata.screenKey}</b><small>{node.metadata.state} · {node.metadata.viewport}</small></button>)}</div>}
      {result?.graph.flows.map((flow) => { const generated = compilePlaywrightJourney(result.graph, flow.id); return <details className={styles.coverageCode} key={flow.id}><summary>{flow.name} Playwright spec</summary><pre>{generated.code}</pre>{generated.unsupported.length > 0 && <small>{generated.unsupported.join(" · ")}</small>}</details>; })}
    </section>}

    {section === "history" && <section className={styles.inspectorSection}><h2>Coverage history</h2><div className={styles.assetList}>{(overview?.runs ?? []).map((runSummary) => <div className={styles.assetRow} key={runSummary.id}><span>{runSummary.score}% coverage<small>{runSummary.branch_id ? "branch" : "main"} · {runSummary.critical_blockers} critical · {new Date(runSummary.created_at).toLocaleString()}</small></span></div>)}</div>{!overview?.runs.length && <p className={styles.fieldHint}>Run full graph coverage to create the first immutable result.</p>}{overview && overview.runs.length >= 2 && <button type="button" disabled={busy} onClick={() => void run(async () => setComparison(await compareCoverageRuns(board.id!, overview.runs[1]!.id, overview.runs[0]!.id)))}>Compare latest runs</button>}{comparison && <dl className={styles.inspectGrid}><div><dt>Score change</dt><dd>{comparison.scoreDelta > 0 ? "+" : ""}{comparison.scoreDelta}</dd></div><div><dt>New findings</dt><dd>{comparison.newFindings.length}</dd></div><div><dt>Resolved</dt><dd>{comparison.resolvedFindings.length}</dd></div><div><dt>Blocking</dt><dd>{comparison.blocking ? "Yes" : "No"}</dd></div></dl>}</section>}

    {section === "policy" && overview && <section className={styles.inspectorSection}>
      <h2>Coverage policy</h2><label className={styles.fullField}><span>Policy name</span><input value={overview.policy.name} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, name: event.target.value } })} /></label><label className={styles.fullField}><span>Required states</span><input value={overview.policy.requiredStates.join(", ")} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, requiredStates: event.target.value.split(",").map((item) => item.trim()).filter((item) => PRODUCT_STATE_KINDS.includes(item as never)) as typeof overview.policy.requiredStates } })} /></label><label className={styles.fullField}><span>Required roles</span><input value={overview.policy.requiredRoles.join(", ")} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, requiredRoles: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} /></label><label className={styles.fullField}><span>Minimum score</span><input type="number" min="0" max="100" value={overview.policy.minimumScore} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, minimumScore: Math.max(0, Math.min(100, Number(event.target.value))) } })} /></label>
      <label className={styles.toggleRow}><span>Require frame metadata</span><input type="checkbox" checked={overview.policy.requireMetadata} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, requireMetadata: event.target.checked } })} /></label><label className={styles.toggleRow}><span>Require requirement links</span><input type="checkbox" checked={overview.policy.requireRequirementRefs} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, requireRequirementRefs: event.target.checked } })} /></label><label className={styles.toggleRow}><span>Block dead ends</span><input type="checkbox" checked={overview.policy.enforceNoDeadEnds} onChange={(event) => setOverview({ ...overview, policy: { ...overview.policy, enforceNoDeadEnds: event.target.checked } })} /></label><button type="button" disabled={busy || !actions.canEdit || !overview.permissions.managePolicy} onClick={() => void run(async () => { const policy = await saveCoveragePolicy(board.id!, overview.policy); setOverview({ ...overview, policy }); setRemoteResult(null); setMessage(`Coverage policy v${policy.version} saved.`); })}>Save policy version</button>
      <h2>Branch gate</h2><label className={styles.fullField}><span>Mode</span><select value={overview.gate.mode} onChange={(event) => setOverview({ ...overview, gate: { ...overview.gate, mode: event.target.value as typeof overview.gate.mode } })}><option value="off">Off</option><option value="advisory">Advisory</option><option value="enforced">Enforced</option></select></label><label className={styles.fullField}><span>Gate score</span><input type="number" min="0" max="100" value={overview.gate.minimum_score} onChange={(event) => setOverview({ ...overview, gate: { ...overview.gate, minimum_score: Math.max(0, Math.min(100, Number(event.target.value))) } })} /></label><label className={styles.toggleRow}><span>Block critical regressions</span><input type="checkbox" checked={overview.gate.block_critical_regressions} onChange={(event) => setOverview({ ...overview, gate: { ...overview.gate, block_critical_regressions: event.target.checked } })} /></label><button type="button" disabled={busy || !overview.permissions.manageGate} onClick={() => void run(async () => { const gate = await saveCoverageGate(board.id!, { mode: overview.gate.mode, minimumScore: overview.gate.minimum_score, blockCriticalRegressions: overview.gate.block_critical_regressions }); setOverview({ ...overview, gate }); setMessage("Branch coverage gate saved."); })}>Save branch gate</button>
    </section>}

    {section === "evidence" && <section className={styles.inspectorSection}><h2>Runtime evidence</h2><p className={styles.fieldHint}>Privacy-safe screen/state events reveal design-to-production drift without collecting customer content.</p><button type="button" disabled={busy || !board.id} onClick={() => void run(async () => setTelemetry(await loadCoverageTelemetry(board.id!, board.activeBranchId)))}>Analyze production evidence</button>{telemetry && <dl className={styles.inspectGrid}><div><dt>Never observed</dt><dd>{telemetry.neverObserved.length}</dd></div><div><dt>Not designed</dt><dd>{telemetry.notDesigned.length}</dd></div><div><dt>Failures</dt><dd>{Object.values(telemetry.failures).reduce((sum, count) => sum + count, 0)}</dd></div><div><dt>Abandoned</dt><dd>{Object.values(telemetry.abandonments).reduce((sum, count) => sum + count, 0)}</dd></div></dl>}<h2>Assisted drafts</h2><p className={styles.fieldHint}>Suggestions never alter the canvas automatically; deterministic coverage validates any accepted draft.</p><button type="button" disabled={busy || !result} onClick={() => void run(async () => { try { setSuggestions(await requestCoverageSuggestions(board.id!, board.activeBranchId)); } catch { setSuggestions(suggestCoverageDrafts(result!)); } })}>Generate suggestions</button><div className={styles.assetList}>{suggestions.map((suggestion) => <div className={styles.assetRow} key={suggestion.findingFingerprint}><span>{suggestion.title}<small>{suggestion.prompt}</small></span></div>)}</div></section>}

    {message && <p className={styles.successLine} role="status"><Check aria-hidden="true" /> {message}</p>}
    {error && <p className={styles.fieldError} role="alert">{error}</p>}
  </>;
};

export default ProductCoveragePanel;
