import {
  PersonArmsSpread,
  ArrowClockwise,
  Check,
  Graph,
  MagnifyingGlass,
  Package,
  PuzzlePiece,
  RocketLaunch,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { clearRecoverySnapshot, loadRecoverySnapshot } from "../../collaboration/offlineRecovery";
import {
  auditAccessibility,
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
  type BoardTemplateSummary,
  type DesignLibrarySummary,
  type LibrarySubscription,
  type ProductGraph,
} from "../../services/productRepository";
import { useEditorActions } from "../../editor/useEditorActions";
import { setRightPanel } from "../../features/editor/editorSlice";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

type ProductTab = "graph" | "find" | "libraries" | "accessibility" | "extensions" | "recovery";

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

const ProductPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const [tab, setTab] = useState<ProductTab>("graph");
  const [graph, setGraph] = useState<ProductGraph | null>(null);
  const [libraries, setLibraries] = useState<DesignLibrarySummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<LibrarySubscription[]>([]);
  const [templates, setTemplates] = useState<BoardTemplateSummary[]>([]);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [libraryName, setLibraryName] = useState(board.title ?? "Kumo library");
  const [libraryNote, setLibraryNote] = useState("");
  const [extensionInput, setExtensionInput] = useState("#b87a2e");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadLibraries = useCallback(async () => {
    if (!board.id) return;
    const result = await loadLibraries(board.id);
    setLibraries(result.libraries);
    setSubscriptions(result.subscriptions);
  }, [board.id]);

  useEffect(() => {
    if (!board.id) return;
    let active = true;
    void Promise.all([loadProductGraph(board.id), loadLibraries(board.id), loadTemplates()])
      .then(([nextGraph, libraryResult, nextTemplates]) => {
        if (!active) return;
        setGraph(nextGraph);
        setLibraries(libraryResult.libraries);
        setSubscriptions(libraryResult.subscriptions);
        setTemplates(nextTemplates);
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Product tools could not be loaded."));
    return () => { active = false; };
  }, [board.id]);

  const searchResults = useMemo(() => searchDocument(board.shapes, query), [board.shapes, query]);
  const findings = useMemo(() => auditAccessibility(board.shapes), [board.shapes]);
  const recovery = board.id ? loadRecoverySnapshot(board.id) : null;

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed."); }
    finally { setBusy(false); }
  };

  const select = (shapeId: string) => dispatch(setSelectedShapes([shapeId]));

  return (
    <aside className={styles.inspectorPanel} aria-label="Product tools">
      <div className={styles.panelHeading}><span>Product tools</span><button type="button" aria-label="Close product tools" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button></div>
      <div className={styles.productTabs} role="tablist" aria-label="Product tools">
        {(["graph", "find", "libraries", "accessibility", "extensions", "recovery"] as ProductTab[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      <div className={styles.inspectorBody}>
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
                return <button type="button" className={styles.assetApply} key={node.id} disabled={!localShape} onClick={() => localShape && select(localShape.id)}><Graph aria-hidden="true" /><span>{node.title}<small>{node.accessible ? node.visibility : "Access required"}{node.manageable ? " · manageable" : ""}</small></span></button>;
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
            <button type="button" disabled={busy || board.role !== "owner"} onClick={() => void run(async () => { if (!board.id) return; const result = await publishLibrary(board.id, { name: libraryName, description: "Reusable Kumo design assets", visibility: "public", versionDescription: libraryNote }); setMessage(`Published version ${result.version} with ${result.assetCount} assets.`); await reloadLibraries(); })}><RocketLaunch aria-hidden="true" /> Publish update</button>
          </section>
          <section className={styles.inspectorSection}>
            <h2>Available libraries</h2>
            <div className={styles.assetList}>{libraries.map((library) => {
              const accepted = subscriptions.find((subscription) => subscription.library_id === library.id)?.accepted_version ?? 0;
              return <div className={styles.assetRow} key={library.id}><span><Package aria-hidden="true" />{library.name}<small>v{library.latest_version} · {accepted === library.latest_version ? "up to date" : `update from v${accepted}`}</small></span><button type="button" disabled={busy || !actions.canEdit || library.source_board_id === board.id} onClick={() => void run(async () => { if (!board.id) return; const diff = await loadLibraryDiff(board.id, library.id); const changed = diff.diff.filter((item) => item.status !== "unchanged").length; if (!changed) { setMessage("This library is already current."); return; } await applyLibrary(board.id, library.id); setMessage(`Applied ${changed} reviewed library changes.`); await reloadLibraries(); })}>{accepted ? "Update" : "Add"}</button></div>;
            })}</div>
          </section>
          <section className={styles.inspectorSection}><h2>Templates</h2><button type="button" disabled={busy || !board.id} onClick={() => void run(async () => { if (!board.id) return; const result = await createTemplate(board.id, board.title ?? "Board template", "Reusable board starting point", "private"); setTemplates((current) => [result.template, ...current]); setMessage("Template created."); })}>Save board as template</button><div className={styles.assetList}>{templates.map((template) => <div className={styles.assetRow} key={template.id}><span>{template.name}<small>{template.visibility}</small></span></div>)}</div></section>
        </>}

        {tab === "accessibility" && <section className={styles.inspectorSection}>
          <h2><PersonArmsSpread aria-hidden="true" /> Accessibility audit</h2>
          <p className={styles.fieldHint}>Contrast, alternative text, accessible names, focus order, and touch targets.</p>
          {!findings.length && <p className={styles.successLine}><Check aria-hidden="true" /> No accessibility findings.</p>}
          <div className={styles.assetList}>{findings.map((finding, index) => <button type="button" className={styles.assetApply} key={`${finding.shapeId}:${finding.rule}:${index}`} onClick={() => select(finding.shapeId)}><PersonArmsSpread aria-hidden="true" /><span>{finding.message}<small>{finding.severity} · {finding.rule}</small></span></button>)}</div>
        </section>}

        {tab === "extensions" && <section className={styles.inspectorSection}>
          <h2><PuzzlePiece aria-hidden="true" /> Extensions</h2>
          <p className={styles.fieldHint}>Kumo extensions are declarative and permission-scoped; they cannot execute arbitrary page scripts.</p>
          <label className={styles.fullField}><span>Command value</span><input value={extensionInput} onChange={(event) => setExtensionInput(event.target.value)} /></label>
          <div className={styles.buttonGrid}>{builtInExtension.commands.map((command) => <button type="button" key={command.id} disabled={!actions.canEdit || (command.operation !== "create-rectangle" && !selectedIds.length)} onClick={() => actions.commitShapes(runExtensionCommand(board.shapes, selectedIds, builtInExtension, command.id, extensionInput))}>{command.name}</button>)}</div>
        </section>}

        {tab === "recovery" && <section className={styles.inspectorSection}>
          <h2><ArrowClockwise aria-hidden="true" /> Offline recovery</h2>
          {!recovery ? <p className={styles.fieldHint}>No local recovery snapshot is waiting.</p> : <><p>A local snapshot from {new Date(recovery.savedAt).toLocaleString()} contains {recovery.shapes.length} layers.</p><div className={styles.buttonGrid}><button type="button" disabled={!actions.canEdit} onClick={() => { actions.commitShapes(recovery.shapes); clearRecoverySnapshot(recovery.boardId); setMessage("Recovered local work."); }}>Restore snapshot</button><button type="button" onClick={() => { clearRecoverySnapshot(recovery.boardId); setMessage("Recovery snapshot discarded."); }}>Discard</button></div></>}
        </section>}

        {message && <p className={styles.successLine} role="status"><Check aria-hidden="true" /> {message}</p>}
        {error && <p className={styles.fieldError} role="alert">{error}</p>}
      </div>
    </aside>
  );
};

export default ProductPanel;
