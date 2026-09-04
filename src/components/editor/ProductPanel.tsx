import {
  PersonArmsSpread,
  ArrowClockwise,
  Check,
  Graph,
  Gauge,
  Globe,
  MagnifyingGlass,
  Package,
  PuzzlePiece,
  RocketLaunch,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearRecoverySnapshot, loadRecoverySnapshot, mergeRecoverySnapshot, resolveRecoveryConflicts, type RecoveryResolution } from "../../collaboration/offlineRecovery";
import { readSyncEvents, type OfflineSyncEvent } from "../../collaboration/offlineJournal";
import {
  auditAccessibility,
  analyzeDocumentPerformance,
  applyAccessibilityFixes,
  replaceDocumentText,
  runExtensionCommand,
  searchDocument,
  type ExtensionManifest,
} from "../../platform/productCapabilities";
import {
  applyLibrary,
  createTemplate,
  loadLibraries,
  loadLibraryDiff,
  loadProductGraph,
  loadTemplates,
  publishLibrary,
  governLibraryRelease,
  loadLibraryVersions,
  type BoardTemplateSummary,
  type DesignLibrarySummary,
  type DesignLibraryVersion,
  type LibrarySubscription,
  type ProductGraph,
} from "../../services/productRepository";
import { installExtension, loadExtensions, publishCommunity, publishExtension, toggleExtension, uninstallExtension, unpublishCommunity, type CatalogExtension } from "../../services/platformRepository";
import { useEditorActions } from "../../editor/useEditorActions";
import { setRightPanel } from "../../features/editor/editorSlice";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";
import ProductCoveragePanel from "./ProductCoveragePanel";

type ProductTab = "coverage" | "graph" | "find" | "libraries" | "accessibility" | "extensions" | "performance" | "publish" | "recovery";

const builtInExtension: ExtensionManifest = {
  id: "kumo.quick-edit",
  name: "Quick edit",
  permissions: ["read-document", "write-document"],
  commands: [
    { id: "rename", name: "Rename selection", operation: "rename-selected" },
    { id: "fill", name: "Set selection fill", operation: "set-fill" },
    { id: "rectangle", name: "Create rectangle", operation: "create-rectangle" },
  ],
};

const errorMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;

const ProductPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const [tab, setTab] = useState<ProductTab>(() => board.id && loadRecoverySnapshot(board.id) ? "recovery" : "graph");
  const [recoveryResolutions, setRecoveryResolutions] = useState<Record<string, RecoveryResolution>>({});
  const [graph, setGraph] = useState<ProductGraph | null>(null);
  const [libraries, setLibraries] = useState<DesignLibrarySummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<LibrarySubscription[]>([]);
  const [templates, setTemplates] = useState<BoardTemplateSummary[]>([]);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [libraryName, setLibraryName] = useState(board.title ?? "Kumo library");
  const [libraryNote, setLibraryNote] = useState("");
  const [extensionInput, setExtensionInput] = useState("#b87a2e");
  const [extensions, setExtensions] = useState<CatalogExtension[]>([]);
  const [extensionManifest, setExtensionManifest] = useState(JSON.stringify(builtInExtension, null, 2));
  const [libraryVersions, setLibraryVersions] = useState<DesignLibraryVersion[]>([]);
  const [semanticVersion, setSemanticVersion] = useState("1.0.0");
  const [releaseStatus, setReleaseStatus] = useState<"draft" | "review" | "published">("published");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityTags, setCommunityTags] = useState("design, collaboration");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncEvents, setSyncEvents] = useState<OfflineSyncEvent[]>([]);

  const reloadLibraries = useCallback(async () => {
    const result = await loadLibraries(board.id!);
    setLibraries(result.libraries);
    setSubscriptions(result.subscriptions);
  }, [board.id]);

  useEffect(() => {
    if (!board.id) return;
    let active = true;
    void Promise.all([loadProductGraph(board.id), loadLibraries(board.id), loadTemplates(), loadExtensions()])
      .then(([nextGraph, libraryResult, nextTemplates, nextExtensions]) => {
        if (!active) return;
        setGraph(nextGraph);
        setLibraries(libraryResult.libraries);
        setSubscriptions(libraryResult.subscriptions);
        setTemplates(nextTemplates);
        setExtensions(nextExtensions);
      })
      .catch((caught) => active && setError(errorMessage(caught, "Product tools could not be loaded.")));
    return () => { active = false; };
  }, [board.id]);

  useEffect(() => {
    if (!board.id || tab !== "recovery") return;
    let active = true;
    void readSyncEvents(board.id).then((events) => { if (active) setSyncEvents(events); })
      .catch(() => { if (active) setSyncEvents([]); });
    return () => { active = false; };
  }, [board.id, tab]);

  const searchResults = useMemo(() => searchDocument(board.shapes, query), [board.shapes, query]);
  const findings = useMemo(() => auditAccessibility(board.shapes), [board.shapes]);
  const performance = useMemo(() => analyzeDocumentPerformance(board.shapes, { x: 0, y: 0, width: 1920 / 1, height: 1080 / 1 }), [board.shapes]);
  const recovery = board.id ? loadRecoverySnapshot(board.id) : null;
  const recoveryMerge = useMemo(() => recovery
    ? mergeRecoverySnapshot(recovery.baseShapes, board.shapes, recovery.shapes)
    : null, [board.shapes, recovery]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); }
    catch (caught) { setError(errorMessage(caught, "The operation failed.")); }
    finally { setBusy(false); }
  };

  const select = (shapeId: string) => dispatch(setSelectedShapes([shapeId]));
  const refreshExtensions = async () => setExtensions(await loadExtensions());
  const catalogManifest = (extension: CatalogExtension) => extension.manifest as ExtensionManifest;
  return (
    <aside className={styles.inspectorPanel} aria-label="Product tools">
      <div className={styles.panelHeading}><span>Product tools</span><button type="button" aria-label="Close product tools" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button></div>
      <div className={styles.productTabs} role="tablist" aria-label="Product tools">
        {(["coverage", "graph", "find", "libraries", "accessibility", "extensions", "performance", "publish", "recovery"] as ProductTab[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      <div className={styles.inspectorBody}>
        {tab === "coverage" && <ProductCoveragePanel key={board.id ?? "no-board"} />}

        {tab === "graph" && <section className={styles.inspectorSection}>
          <h2><Graph aria-hidden="true" /> Board graph</h2>
          <p className={styles.fieldHint}>Backlinks and permission health for every direct connection.</p>
          {!graph && <p role="status">Loading graph…</p>}
          {graph && <>
            <dl className={styles.inspectGrid}><div><dt>Boards</dt><dd>{graph.nodes.length}</dd></div><div><dt>Links</dt><dd>{graph.edges.length}</dd></div><div><dt>Backlinks</dt><dd>{graph.incoming.length}</dd></div><div><dt>Broken</dt><dd>{graph.edges.filter((edge) => !graph.nodes.find((node) => node.id === edge.targetId)?.accessible).length}</dd></div></dl>
            <svg className={styles.boardGraphMap} viewBox="0 0 240 180" role="img" aria-label={`${graph.nodes.length} connected boards and ${graph.edges.length} links`}>
              {graph.edges.map((edge, index) => {
                const sourceIndex = graph.nodes.findIndex((node) => node.id === edge.sourceId);
                const targetIndex = graph.nodes.findIndex((node) => node.id === edge.targetId);
                if (sourceIndex < 0 || targetIndex < 0) return null;
                const sourceAngle = sourceIndex / Math.max(1, graph.nodes.length) * Math.PI * 2 - Math.PI / 2;
                const targetAngle = targetIndex / Math.max(1, graph.nodes.length) * Math.PI * 2 - Math.PI / 2;
                const target = graph.nodes[targetIndex];
                return <line key={`${edge.sourceId}:${edge.targetId}:${index}`} x1={120 + Math.cos(sourceAngle) * 70} y1={90 + Math.sin(sourceAngle) * 60} x2={120 + Math.cos(targetAngle) * 70} y2={90 + Math.sin(targetAngle) * 60} data-broken={!target?.accessible || undefined} />;
              })}
              {graph.nodes.map((node, index) => {
                const angle = index / Math.max(1, graph.nodes.length) * Math.PI * 2 - Math.PI / 2;
                const x = 120 + Math.cos(angle) * 70;
                const y = 90 + Math.sin(angle) * 60;
                return <g key={node.id} transform={`translate(${x} ${y})`} data-current={node.id === graph.sourceId || undefined} data-inaccessible={!node.accessible || undefined}><circle r={node.id === graph.sourceId ? 13 : 9} /><text y={22} textAnchor="middle">{node.title.slice(0, 15)}</text></g>;
              })}
            </svg>
            <div className={styles.assetList}>
              {graph.nodes.map((node) => {
                const localShape = board.shapes.find((shape) => shape.type === "board" && shape.boardId === node.id);
                return <button type="button" className={styles.assetApply} key={node.id} disabled={!localShape} onClick={() => select(localShape!.id)}><Graph aria-hidden="true" /><span>{node.title}<small>{node.accessible ? node.visibility : "Access required"}{node.manageable ? " · manageable" : ""}</small></span></button>;
              })}
            </div>
          </>}
        </section>}

        {tab === "find" && <section className={styles.inspectorSection}>
          <h2><MagnifyingGlass aria-hidden="true" /> Find and replace</h2>
          <label className={styles.fullField}><span>Find layers, text, tokens, annotations, and board links</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className={styles.fullField}><span>Replace text with</span><input value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label>
          <button type="button" disabled={!query || !actions.canEdit} onClick={() => actions.commitShapes(replaceDocumentText(board.shapes, query, replacement))}>Replace all text</button>
          <div className={styles.assetList}>{searchResults.map((result, index) => <button className={styles.assetApply} type="button" key={`${result.shapeId}:${result.kind}:${index}`} onClick={() => select(result.shapeId)}><MagnifyingGlass aria-hidden="true" /><span>{result.label}<small>{result.kind} · {result.match}</small></span></button>)}</div>
          {query && !searchResults.length && <p className={styles.fieldHint}>No document matches.</p>}
        </section>}

        {tab === "libraries" && <>
          <section className={styles.inspectorSection}>
            <h2><Package aria-hidden="true" /> Publish this board</h2>
            <label className={styles.fullField}><span>Library name</span><input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} /></label>
            <label className={styles.fullField}><span>Release notes</span><textarea value={libraryNote} onChange={(event) => setLibraryNote(event.target.value)} /></label>
            <div className={styles.fieldGrid}><label className={styles.fullField}><span>Semantic version</span><input value={semanticVersion} onChange={(event) => setSemanticVersion(event.target.value)} placeholder="1.0.0" /></label><label className={styles.fullField}><span>Release state</span><select value={releaseStatus} onChange={(event) => setReleaseStatus(event.target.value as typeof releaseStatus)}><option value="draft">Draft</option><option value="review">Request approval</option><option value="published">Publish now</option></select></label></div>
            <button type="button" disabled={busy || board.role !== "owner"} onClick={() => void run(async () => { if (!board.id) return; const result = await publishLibrary(board.id, { name: libraryName, description: "Reusable Kumo design assets", visibility: "public", versionDescription: libraryNote, semanticVersion, releaseStatus, changelog: libraryNote.split("\n").filter(Boolean) }); setMessage(`${releaseStatus === "published" ? "Published" : "Created"} version ${result.version} with ${result.assetCount} assets.`); await reloadLibraries(); })}><RocketLaunch aria-hidden="true" /> {releaseStatus === "published" ? "Publish update" : "Create release"}</button>
          </section>
          <section className={styles.inspectorSection}>
            <h2>Available libraries</h2>
            <div className={styles.assetList}>{libraries.map((library) => {
              const accepted = subscriptions.find((subscription) => subscription.library_id === library.id)?.accepted_version ?? 0;
              return <div className={styles.assetRow} key={library.id}><span><Package aria-hidden="true" />{library.name}<small>v{library.latest_version} · {accepted === library.latest_version ? "up to date" : `update from v${accepted}`}</small></span><div><button type="button" disabled={busy || !board.id || !actions.canEdit || library.source_board_id === board.id} onClick={() => void run(async () => { const diff = await loadLibraryDiff(board.id!, library.id); const changed = diff.diff.filter((item) => item.status !== "unchanged").length; if (!changed) { setMessage("This library is already current."); return; } await applyLibrary(board.id!, library.id); setMessage(`Applied ${changed} reviewed library changes.`); await reloadLibraries(); })}>{accepted ? "Update" : "Add"}</button>{library.owner_id === board.uid && <button type="button" onClick={() => void run(async () => { const result = await loadLibraryVersions(library.id); setLibraryVersions(result.versions); })}>Releases</button>}</div></div>;
            })}</div>
            {libraryVersions.length > 0 && <div className={styles.assetList}>{libraryVersions.map((version) => <div className={styles.assetRow} key={`${version.library_id}:${version.version}`}><span>v{version.semantic_version ?? version.version}<small>{version.release_status} · {version.description || "No release notes"}</small></span><div>{version.release_status === "review" && <button type="button" onClick={() => void run(async () => { await governLibraryRelease("approve-library-release", version.library_id, version.version); setLibraryVersions((current) => current.map((item) => item.version === version.version ? { ...item, release_status: "published" } : item)); })}>Approve</button>}{version.release_status !== "deprecated" && <button type="button" onClick={() => void run(async () => { await governLibraryRelease("deprecate-library-release", version.library_id, version.version); setLibraryVersions((current) => current.map((item) => item.version === version.version ? { ...item, release_status: "deprecated" } : item)); })}>Deprecate</button>}<button type="button" disabled={version.release_status === "deprecated"} onClick={() => void run(async () => { await governLibraryRelease("rollback-library", version.library_id, version.version); setMessage(`v${version.semantic_version ?? version.version} is current.`); })}>Make current</button></div></div>)}</div>}
          </section>
          <section className={styles.inspectorSection}><h2>Templates</h2><button type="button" disabled={busy || !board.id} onClick={() => void run(async () => { const result = await createTemplate(board.id!, board.title ?? "Board template", "Reusable board starting point", "private"); setTemplates((current) => [result.template, ...current]); setMessage("Template created."); })}>Save board as template</button><div className={styles.assetList}>{templates.map((template) => <div className={styles.assetRow} key={template.id}><span>{template.name}<small>{template.visibility}</small></span></div>)}</div></section>
        </>}

        {tab === "accessibility" && <section className={styles.inspectorSection}>
          <h2><PersonArmsSpread aria-hidden="true" /> Accessibility audit</h2>
          <p className={styles.fieldHint}>Contrast, alternative text, accessible names, focus order, and touch targets.</p>
          {!!findings.length && <button type="button" disabled={!actions.canEdit} onClick={() => { actions.commitShapes(applyAccessibilityFixes(board.shapes, findings)); setMessage(`Applied safe fixes for ${findings.length} findings.`); }}>Fix all safe issues</button>}
          {!findings.length && <p className={styles.successLine}><Check aria-hidden="true" /> No accessibility findings.</p>}
          <div className={styles.assetList}>{findings.map((finding, index) => <button type="button" className={styles.assetApply} key={`${finding.shapeId}:${finding.rule}:${index}`} onClick={() => select(finding.shapeId)}><PersonArmsSpread aria-hidden="true" /><span>{finding.message}<small>{finding.severity} · {finding.rule}</small></span></button>)}</div>
        </section>}

        {tab === "extensions" && <section className={styles.inspectorSection}>
          <h2><PuzzlePiece aria-hidden="true" /> Extensions</h2>
          <p className={styles.fieldHint}>Kumo extensions are declarative and permission-scoped; they cannot execute arbitrary page scripts.</p>
          <label className={styles.fullField}><span>Command value</span><input value={extensionInput} onChange={(event) => setExtensionInput(event.target.value)} /></label>
          <div className={styles.buttonGrid}>{builtInExtension.commands.map((command) => <button type="button" key={command.id} disabled={!actions.canEdit || (command.operation !== "create-rectangle" && !selectedIds.length)} onClick={() => actions.commitShapes(runExtensionCommand(board.shapes, selectedIds, builtInExtension, command.id, extensionInput))}>{command.name}</button>)}</div>
          <h2>Extension catalog</h2>
          <div className={styles.assetList}>{extensions.map((extension) => {
            const installation = extension.installed_extensions?.[0];
            return <div className={styles.assetRow} key={extension.id}><span><PuzzlePiece aria-hidden="true" />{extension.name}<small>{extension.verified ? "Verified" : "Developer build"} · {extension.description || "No description"}</small></span><div>{installation?.enabled && catalogManifest(extension).commands.map((command) => <button type="button" key={command.id} disabled={!actions.canEdit || (command.operation !== "create-rectangle" && !selectedIds.length)} onClick={() => actions.commitShapes(runExtensionCommand(board.shapes, selectedIds, catalogManifest(extension), command.id, extensionInput))}>{command.name}</button>)}{installation ? <><button type="button" onClick={() => void run(async () => { await toggleExtension(extension.id, !installation.enabled); await refreshExtensions(); })}>{installation.enabled ? "Disable" : "Enable"}</button><button type="button" onClick={() => void run(async () => { await uninstallExtension(extension.id); await refreshExtensions(); })}>Uninstall</button></> : <button type="button" onClick={() => void run(async () => { await installExtension(extension.id, extension.manifest.permissions); await refreshExtensions(); })}>Install</button>}</div></div>;
          })}</div>
          <label className={styles.fullField}><span>Publish a declarative manifest</span><textarea rows={10} spellCheck={false} value={extensionManifest} onChange={(event) => setExtensionManifest(event.target.value)} /></label>
          <button type="button" onClick={() => void run(async () => { const parsed = JSON.parse(extensionManifest) as CatalogExtension["manifest"]; await publishExtension(parsed, `Published from ${board.title ?? "Kumo"}`); await refreshExtensions(); setMessage(`${parsed.name} was added to your developer catalog.`); })}>Publish extension</button>
        </section>}

        {tab === "performance" && <section className={styles.inspectorSection}>
          <h2><Gauge aria-hidden="true" /> Document performance</h2>
          <p className={styles.fieldHint}>The canvas only mounts visible layers plus their parents, while storage retains the entire board.</p>
          <dl className={styles.inspectGrid}><div><dt>Health</dt><dd>{performance.level}</dd></div><div><dt>Layers</dt><dd>{performance.shapeCount}</dd></div><div><dt>Mounted</dt><dd>{performance.renderedShapeCount}</dd></div><div><dt>Complexity</dt><dd>{performance.estimatedComplexity}</dd></div><div><dt>Images</dt><dd>{performance.imageCount}</dd></div><div><dt>Vector points</dt><dd>{performance.vectorPointCount}</dd></div></dl>
          <p className={performance.level === "healthy" ? styles.successLine : styles.fieldHint}>{performance.level === "healthy" ? "This board is within the healthy interactive budget." : performance.level === "watch" ? "Consider splitting dense sections into linked boards." : "This board is heavy. Reduce effects and very dense vectors for smoother collaboration."}</p>
        </section>}

        {tab === "publish" && <section className={styles.inspectorSection}>
          <h2><Globe aria-hidden="true" /> Publish to community</h2>
          <p className={styles.fieldHint}>Publish a discoverable, remixable snapshot of this board. Only the owner can update or remove it.</p>
          <label className={styles.fullField}><span>Description</span><textarea value={communityDescription} onChange={(event) => setCommunityDescription(event.target.value)} placeholder="What can the community learn or build from this board?" /></label>
          <label className={styles.fullField}><span>Tags</span><input value={communityTags} onChange={(event) => setCommunityTags(event.target.value)} placeholder="design system, workshop" /></label>
          <div className={styles.buttonGrid}><button type="button" disabled={busy || !board.id || board.role !== "owner" || !communityDescription.trim()} onClick={() => void run(async () => { const result = await publishCommunity(board.id!, { description: communityDescription, tags: communityTags.split(",").map((tag) => tag.trim()).filter(Boolean), remixAllowed: true }); setMessage(`Published as ${result.publication.slug}.`); })}>Publish board</button><button type="button" disabled={busy || !board.id || board.role !== "owner"} onClick={() => void run(async () => { await unpublishCommunity(board.id!); setMessage("Community publication removed."); })}>Unpublish</button></div>
        </section>}

        {tab === "recovery" && <section className={styles.inspectorSection}>
          <h2><ArrowClockwise aria-hidden="true" /> Offline recovery</h2>
          {!recovery || !recoveryMerge ? <p className={styles.fieldHint}>No local recovery snapshot is waiting.</p> : <><p>A local snapshot from {new Date(recovery.savedAt).toLocaleString()} contains {recovery.shapes.length} layers. Independent edits merge automatically; current collaborative work is kept for unresolved conflicts.</p>{recoveryMerge.conflicts.length > 0 && <div className={styles.assetList}>{recoveryMerge.conflicts.map((conflict) => <div className={styles.assetRow} key={conflict.shapeId}><span>{recovery.shapes.find((shape) => shape.id === conflict.shapeId)?.name ?? board.shapes.find((shape) => shape.id === conflict.shapeId)?.name ?? conflict.shapeId}<small>Conflict: {conflict.fields.join(", ")}</small></span><div><button type="button" aria-pressed={(recoveryResolutions[conflict.shapeId] ?? "remote") === "remote"} onClick={() => setRecoveryResolutions((current) => ({ ...current, [conflict.shapeId]: "remote" }))}>Keep current</button><button type="button" aria-pressed={recoveryResolutions[conflict.shapeId] === "local"} onClick={() => setRecoveryResolutions((current) => ({ ...current, [conflict.shapeId]: "local" }))}>Use offline</button></div></div>)}</div>}<div className={styles.buttonGrid}><button type="button" disabled={!actions.canEdit} onClick={() => { const next = resolveRecoveryConflicts(recoveryMerge, board.shapes, recovery.shapes, recoveryResolutions); actions.commitShapes(next); const localBackgroundChanged = recovery.backgroundColor !== recovery.baseBackgroundColor; const remoteBackgroundChanged = board.backGroundColor !== recovery.baseBackgroundColor; if (localBackgroundChanged && !remoteBackgroundChanged) actions.commitBoardPatch({ backGroundColor: recovery.backgroundColor }); clearRecoverySnapshot(recovery.boardId); setMessage(`Recovered local work${recoveryMerge.conflicts.length ? ` with ${recoveryMerge.conflicts.length} reviewed conflicts` : ""}.`); }}>Merge recovery</button><button type="button" onClick={() => { clearRecoverySnapshot(recovery.boardId); setMessage("Recovery snapshot discarded."); }}>Discard</button></div></>}
          <h2>Sync history</h2>
          {!syncEvents.length ? <p className={styles.fieldHint}>No offline sync activity has been recorded.</p> : <div className={styles.assetList}>{syncEvents.map((event, index) => <div className={styles.assetRow} key={`${event.id ?? event.at}:${index}`}><span>{event.status}<small>{new Date(event.at).toLocaleString()}{event.detail ? ` · ${event.detail}` : ""}</small></span></div>)}</div>}
        </section>}

        {message && <p className={styles.successLine} role="status"><Check aria-hidden="true" /> {message}</p>}
        {error && <p className={styles.fieldError} role="alert">{error}</p>}
      </div>
    </aside>
  );
};

export default ProductPanel;
