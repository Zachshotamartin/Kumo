import { Check, FileArrowUp, FlowArrow, LinkSimple, Palette, TextAa, Timer, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createShapeId, type Shape } from "../../classes/shape";
import {
  BUILTIN_FONTS,
  createAdvancedPrimitive,
  createPrototypeFlow,
  csvCells,
  missingFonts,
  prototypeFlows,
  quickConnectNode,
  removePrototypeFlow,
  replaceFont,
  richLinkShape,
  searchFonts,
  shapesFromMermaid,
  shapesFromSvg,
  tableShapeFromCsv,
  updateWorkshopState,
  workshopState,
  type KumoFont,
} from "../../editor/advancedFeatures";
import { normalizeShape } from "../../editor/geometry";
import { setRightPanel } from "../../features/editor/editorSlice";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import type { AppDispatch, RootState } from "../../store";
import { useEditorActions } from "../../editor/useEditorActions";
import { loadWorkspaceFonts, uploadWorkspaceFont, type WorkspaceFont } from "../../services/fontRepository";
import styles from "./EditorWorkspace.module.css";

type StudioTab = "diagram" | "prototype" | "style" | "fonts" | "import" | "workshop" | "portal";

const recentFonts = (): string[] => {
  try { return JSON.parse(localStorage.getItem("kumo:recent-fonts") ?? "[]") as string[]; }
  catch { return []; }
};

const rememberFont = (family: string) => {
  try { localStorage.setItem("kumo:recent-fonts", JSON.stringify([family, ...recentFonts().filter((item) => item !== family)].slice(0, 8))); }
  catch { /* Recents are optional. */ }
};

const loadedFonts = new Map<string, Promise<void>>();

const loadFont = (font: KumoFont): Promise<void> => {
  if (!font.url || typeof document === "undefined") return Promise.resolve();
  const key = `${font.source}:${font.family}:${font.url}`;
  const existing = loadedFonts.get(key);
  if (existing) return existing;
  const loading = font.source === "workspace"
    ? (async () => {
        if (typeof FontFace === "undefined" || !document.fonts) throw new Error("This browser cannot load workspace fonts.");
        const face = new FontFace(font.family, `url(${JSON.stringify(font.url)})`, {
          style: font.style ?? "normal",
          weight: font.weight!,
        });
        document.fonts.add(await face.load());
      })()
    : Promise.resolve().then(() => {
        if (document.querySelector(`link[data-kumo-font="${CSS.escape(font.family)}"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = font.url!;
        link.dataset.kumoFont = font.family;
        document.head.append(link);
      });
  loadedFonts.set(key, loading);
  loading.catch(() => loadedFonts.delete(key));
  return loading;
};

const AdvancedStudioPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const editor = useSelector((state: RootState) => state.editor);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const [tab, setTab] = useState<StudioTab>("diagram");
  const [mermaid, setMermaid] = useState("flowchart LR\nIdea[Idea] -->|shape| Board[Board]\nBoard --> Share[Share]");
  const [flowName, setFlowName] = useState("Primary flow");
  const [flowDescription, setFlowDescription] = useState("");
  const [fontQuery, setFontQuery] = useState("");
  const [workspaceFonts, setWorkspaceFonts] = useState<WorkspaceFont[]>([]);
  const [fontFamilyName, setFontFamilyName] = useState("");
  const [importMode, setImportMode] = useState<"csv" | "url" | "mermaid" | "svg">("csv");
  const [importValue, setImportValue] = useState("Name,Status\nResearch,In progress\nPrototype,Next");
  const [portalVersion, setPortalVersion] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const selected = board.shapes.find((shape) => selectedIds.includes(shape.id));
  const flows = useMemo(() => prototypeFlows(board.shapes), [board.shapes]);
  const workshop = useMemo(() => workshopState(board.shapes), [board.shapes]);
  const allFonts = useMemo<KumoFont[]>(() => [...BUILTIN_FONTS, ...workspaceFonts.map((font) => ({
    family: font.family,
    category: "sans" as const,
    source: "workspace" as const,
    url: font.url,
    style: font.style,
    weight: font.weight_min === font.weight_max ? String(font.weight_min) : `${font.weight_min} ${font.weight_max}`,
  }))], [workspaceFonts]);
  const fontResults = useMemo(() => searchFonts(allFonts, fontQuery), [allFonts, fontQuery]);
  const unavailableFonts = useMemo(() => missingFonts(board.shapes, allFonts.map((font) => font.family)), [allFonts, board.shapes]);

  useEffect(() => {
    if (!workshop.timerEndsAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [workshop.timerEndsAt]);

  useEffect(() => { void loadWorkspaceFonts().then(setWorkspaceFonts).catch(() => undefined); }, []);

  const origin = { x: editor.viewport.x + 80 / editor.viewport.zoom, y: editor.viewport.y + 80 / editor.viewport.zoom };
  const addShapes = (created: Shape[]) => {
    if (!created.length || !actions.canEdit) return;
    const withPage = created.map((shape) => ({ ...shape, pageId: editor.currentPageId }));
    actions.commitShapes([...board.shapes, ...withPage]);
    dispatch(setSelectedShapes(withPage.map((shape) => shape.id)));
  };

  const applyFont = (font: KumoFont) => {
    void loadFont(font).then(() => {
      rememberFont(font.family);
      actions.patchSelected({ fontFamily: font.family });
      setMessage(`Applied ${font.family}.`);
    }).catch((caught) => setMessage(caught instanceof Error ? caught.message : "Font loading failed."));
  };

  const importContent = () => {
    if (importMode === "csv") addShapes([tableShapeFromCsv(importValue, origin, board.shapes)]);
    else if (importMode === "mermaid") addShapes(shapesFromMermaid(importValue, origin, board.shapes));
    else if (importMode === "svg") addShapes(shapesFromSvg(importValue, origin, board.shapes));
    else {
      const link = richLinkShape(importValue, origin, board.shapes);
      if (link) {
        const video = /\.(mp4|webm|mov)(?:\?.*)?$/i.test(link.embedUrl!)
          ? normalizeShape({ ...link, type: "image", name: "Video", mediaType: "video", mediaAutoplay: false, mediaLoop: false, mediaMuted: true, backgroundImage: link.embedUrl, embedUrl: link.embedUrl })
          : link;
        addShapes([video]);
      }
    }
  };

  const addWorkshopStamp = (text: string, color: string) => {
    const stamp = normalizeShape({
      ...createAdvancedPrimitive("sticky", origin, board.shapes),
      name: `${text} stamp`, text, backgroundColor: color, fontSize: 28,
      x2: origin.x + 120, y2: origin.y + 88,
    });
    addShapes([stamp]);
  };

  const timerRemaining = workshop.timerEndsAt ? Math.max(0, workshop.timerEndsAt - clock) : 0;
  const timerLabel = `${Math.floor(timerRemaining / 60_000).toString().padStart(2, "0")}:${Math.floor(timerRemaining % 60_000 / 1000).toString().padStart(2, "0")}`;

  return <aside className={styles.inspectorPanel} aria-label="Advanced canvas studio">
    <div className={styles.panelHeading}><span>Canvas studio</span><button type="button" aria-label="Close canvas studio" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button></div>
    <div className={styles.productTabs} role="tablist" aria-label="Canvas studio tools">
      {(["diagram", "prototype", "style", "fonts", "import", "workshop", "portal"] as StudioTab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}
    </div>
    <div className={styles.inspectorBody}>
      {tab === "diagram" && <>
        <section className={styles.inspectorSection}><h2><FlowArrow aria-hidden="true" /> Connectors</h2>
          {selected?.type === "connector" ? <>
            <label className={styles.fullField}><span>Route</span><select value={selected.connectorRouting ?? "orthogonal"} onChange={(event) => actions.patchSelected({ connectorRouting: event.target.value as Shape["connectorRouting"] })}><option value="straight">Straight</option><option value="curved">Curved</option><option value="orthogonal">Orthogonal</option></select></label>
            <label className={styles.fullField}><span>Label</span><input value={selected.connectorLabel ?? ""} onChange={(event) => actions.patchSelected({ connectorLabel: event.target.value })} /></label>
            <div className={styles.fieldGrid}><label className={styles.fullField}><span>Start</span><select value={selected.connectorStartCap ?? "none"} onChange={(event) => actions.patchSelected({ connectorStartCap: event.target.value as Shape["connectorStartCap"] })}><option value="none">None</option><option value="arrow">Arrow</option><option value="circle">Circle</option><option value="diamond">Diamond</option></select></label><label className={styles.fullField}><span>End</span><select value={selected.connectorEndCap ?? "arrow"} onChange={(event) => actions.patchSelected({ connectorEndCap: event.target.value as Shape["connectorEndCap"] })}><option value="none">None</option><option value="arrow">Arrow</option><option value="circle">Circle</option><option value="diamond">Diamond</option></select></label></div>
            <label className={styles.preference}><span>Avoid objects</span><input type="checkbox" checked={selected.connectorAvoidObstacles !== false} onChange={(event) => actions.patchSelected({ connectorAvoidObstacles: event.target.checked })} /></label>
          </> : <p className={styles.fieldHint}>Draw or select a connector to change routing, endpoints, labels, and arrowheads.</p>}
        </section>
        <section className={styles.inspectorSection}><h2>Mermaid diagram</h2><label className={styles.fullField}><span>Flowchart source</span><textarea rows={8} spellCheck={false} value={mermaid} onChange={(event) => setMermaid(event.target.value)} /></label><button type="button" disabled={!actions.canEdit} onClick={() => addShapes(shapesFromMermaid(mermaid, origin, board.shapes))}>Create editable diagram</button></section>
        <section className={styles.inspectorSection}><h2>Quick connect</h2><p className={styles.fieldHint}>Create and attach the next node in one action.</p><div className={styles.buttonGrid}>{(["left", "right", "top", "bottom"] as const).map((direction) => <button type="button" key={direction} disabled={!actions.canEdit || !selected || ["connector", "guide", "resource"].includes(selected.type)} onClick={() => { const result = quickConnectNode(board.shapes, selected!.id, direction); actions.commitShapes(result.shapes); dispatch(setSelectedShapes([result.nodeId!])); }}>{direction}</button>)}</div></section>
      </>}

      {tab === "prototype" && <>
        <section className={styles.inspectorSection}><h2>Named prototype flows</h2><p className={styles.fieldHint}>Frames may start multiple named journeys on the same page.</p>
          <label className={styles.fullField}><span>Name</span><input value={flowName} onChange={(event) => setFlowName(event.target.value)} /></label><label className={styles.fullField}><span>Description</span><textarea value={flowDescription} onChange={(event) => setFlowDescription(event.target.value)} /></label>
          <button type="button" disabled={!actions.canEdit || selected?.type !== "frame"} onClick={() => { actions.commitShapes(createPrototypeFlow(board.shapes, selected!.id, flowName, flowDescription)); setMessage("Prototype flow created."); }}>Create from selected frame</button>
          <div className={styles.assetList}>{flows.map((flow) => <div className={styles.assetRow} key={flow.id}><span>{flow.name}<small>{flow.description || "No description"}</small></span><div><button type="button" onClick={() => dispatch(setSelectedShapes([flow.startFrameId]))}>Select</button><button type="button" disabled={!actions.canEdit} onClick={() => actions.commitShapes(removePrototypeFlow(board.shapes, flow.id))}>Remove</button></div></div>)}</div>
        </section>
        {selected && <section className={styles.inspectorSection}><h2>Scrolling and position</h2><label className={styles.fullField}><span>Overflow axis</span><select value={selected.prototypeOverflowAxis ?? "none"} onChange={(event) => actions.patchSelected({ prototypeOverflowAxis: event.target.value as Shape["prototypeOverflowAxis"], prototypeOverflow: event.target.value === "none" ? "clip" : "scroll" })}><option value="none">None</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option><option value="both">Both</option></select></label><label className={styles.fullField}><span>Position in prototype</span><select value={selected.prototypePosition ?? "scroll"} onChange={(event) => actions.patchSelected({ prototypePosition: event.target.value as Shape["prototypePosition"] })}><option value="scroll">Scroll</option><option value="fixed">Fixed</option><option value="sticky">Sticky</option></select></label>{selected.prototypePosition === "sticky" && <label className={styles.fullField}><span>Sticky offset</span><input type="number" value={selected.prototypeStickyOffset ?? 0} onChange={(event) => actions.patchSelected({ prototypeStickyOffset: Number(event.target.value) })} /></label>}</section>}
      </>}

      {tab === "style" && <section className={styles.inspectorSection}><h2><Palette aria-hidden="true" /> Paint stack</h2>
        {!selected ? <p className={styles.fieldHint}>Select a shape to edit its paint stack and independent corners.</p> : <>
          <div className={styles.assetList}>{(selected.fills ?? []).map((fill, index) => <div className={styles.paintEditor} key={fill.id}>
            <div className={styles.assetRow}><span>Fill {index + 1}<small>{Math.round(fill.opacity * 100)}% opacity</small></span><button type="button" aria-label={`Remove fill ${index + 1}`} onClick={() => actions.patchSelected({ fills: selected.fills?.filter((candidate) => candidate.id !== fill.id) })}><X aria-hidden="true" /></button></div>
            <label className={styles.fullField}><span>Type</span><select value={fill.type} onChange={(event) => { const type = event.target.value as NonNullable<Shape["fills"]>[number]["type"]; actions.patchSelected({ fills: selected.fills?.map((candidate) => candidate.id === fill.id ? { ...candidate, type, gradientStops: type.includes("gradient") ? candidate.gradientStops ?? [{ id: createShapeId(), position: 0, color: candidate.color ?? "#b87a2e", opacity: 1 }, { id: createShapeId(), position: 1, color: "#f4f2ed", opacity: 1 }] : candidate.gradientStops } : candidate) }); }}><option value="solid">Solid</option><option value="linear-gradient">Linear gradient</option><option value="radial-gradient">Radial gradient</option><option value="image">Image</option></select></label>
            {fill.type === "solid" && <input aria-label={`Fill ${index + 1} color`} type="color" value={fill.color ?? "#ffffff"} onChange={(event) => actions.patchSelected({ fills: selected.fills?.map((candidate) => candidate.id === fill.id ? { ...candidate, color: event.target.value } : candidate) })} />}
            {(fill.type === "linear-gradient" || fill.type === "radial-gradient") && <><label className={styles.fullField}><span>Angle</span><input type="number" value={Math.round(fill.gradientAngle ?? 90)} onChange={(event) => actions.patchSelected({ fills: selected.fills?.map((candidate) => candidate.id === fill.id ? { ...candidate, gradientAngle: Number(event.target.value) } : candidate) })} /></label>{(fill.gradientStops ?? []).map((stop, stopIndex) => <div className={styles.assetRow} key={stop.id}><span>Stop {stopIndex + 1}<small>{Math.round(stop.position * 100)}%</small></span><input aria-label={`Gradient stop ${stopIndex + 1} color`} type="color" value={stop.color} onChange={(event) => actions.patchSelected({ fills: selected.fills?.map((candidate) => candidate.id === fill.id ? { ...candidate, gradientStops: candidate.gradientStops?.map((item) => item.id === stop.id ? { ...item, color: event.target.value } : item) } : candidate) })} /></div>)}</>}
            <label className={styles.fullField}><span>Opacity</span><input type="range" min="0" max="1" step="0.01" value={fill.opacity} onChange={(event) => actions.patchSelected({ fills: selected.fills?.map((candidate) => candidate.id === fill.id ? { ...candidate, opacity: Number(event.target.value) } : candidate) })} /></label>
          </div>)}</div>
          <div className={styles.buttonGrid}><button type="button" onClick={() => actions.patchSelected({ fills: [...(selected.fills ?? []), { id: createShapeId(), type: "solid", color: selected.backgroundColor ?? "#ffffff", opacity: 1, visible: true }] })}>Add fill</button><button type="button" onClick={() => actions.patchSelected({ fills: [...(selected.fills ?? []), { id: createShapeId(), type: "linear-gradient", opacity: 1, visible: true, gradientAngle: 90, gradientStops: [{ id: createShapeId(), position: 0, color: "#b87a2e", opacity: 1 }, { id: createShapeId(), position: 1, color: "#f4f2ed", opacity: 1 }] }] })}>Add gradient</button></div>
          <h2>Stroke stack</h2><div className={styles.assetList}>{(selected.strokes ?? []).map((stroke, index) => <div className={styles.paintEditor} key={stroke.id}><div className={styles.assetRow}><span>Stroke {index + 1}</span><button type="button" aria-label={`Remove stroke ${index + 1}`} onClick={() => actions.patchSelected({ strokes: selected.strokes?.filter((candidate) => candidate.id !== stroke.id) })}><X aria-hidden="true" /></button></div><div className={styles.fieldGrid}><input aria-label={`Stroke ${index + 1} color`} type="color" value={stroke.color} onChange={(event) => actions.patchSelected({ strokes: selected.strokes?.map((candidate) => candidate.id === stroke.id ? { ...candidate, color: event.target.value } : candidate) })} /><label className={styles.fullField}><span>Width</span><input type="number" min="0" value={stroke.width} onChange={(event) => actions.patchSelected({ strokes: selected.strokes?.map((candidate) => candidate.id === stroke.id ? { ...candidate, width: Math.max(0, Number(event.target.value)) } : candidate) })} /></label></div></div>)}</div><button type="button" onClick={() => actions.patchSelected({ strokes: [...(selected.strokes ?? []), { id: createShapeId(), color: selected.borderColor ?? "#17181a", width: selected.borderWidth ?? 1, opacity: 1, visible: true, style: "solid", align: "center" }] })}>Add stroke</button>
          <h2>Independent corners</h2><div className={styles.fieldGrid}>{(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((corner) => <label className={styles.fullField} key={corner}><span>{corner.replace(/([A-Z])/g, " $1")}</span><input type="number" min="0" value={selected.cornerRadii?.[corner] ?? selected.borderRadius ?? 0} onChange={(event) => actions.patchSelected({ cornerRadii: { topLeft: selected.cornerRadii?.topLeft ?? selected.borderRadius ?? 0, topRight: selected.cornerRadii?.topRight ?? selected.borderRadius ?? 0, bottomRight: selected.cornerRadii?.bottomRight ?? selected.borderRadius ?? 0, bottomLeft: selected.cornerRadii?.bottomLeft ?? selected.borderRadius ?? 0, [corner]: Math.max(0, Number(event.target.value)) } })} /></label>)}</div>
          <label className={styles.fullField}><span>Corner smoothing</span><input type="range" min="0" max="1" step="0.05" value={selected.cornerSmoothing ?? 0} onChange={(event) => actions.patchSelected({ cornerSmoothing: Number(event.target.value) })} /></label>
        </>}
      </section>}

      {tab === "fonts" && <section className={styles.inspectorSection}><h2><TextAa aria-hidden="true" /> Font registry</h2><label className={styles.fullField}><span>Search fonts</span><input value={fontQuery} onChange={(event) => setFontQuery(event.target.value)} /></label>
        {!!recentFonts().length && <p className={styles.fieldHint}>Recent: {recentFonts().join(", ")}</p>}
        <div className={styles.assetList}>{fontResults.map((font) => <button type="button" className={styles.assetApply} key={font.family} disabled={!selected || !actions.canEdit} onClick={() => applyFont(font)}><TextAa aria-hidden="true" /><span style={{ fontFamily: font.family }}>{font.family}<small>{font.source} · {font.category}</small></span></button>)}</div>
        <h2>Upload workspace font</h2><label className={styles.fullField}><span>Family name</span><input value={fontFamilyName} onChange={(event) => setFontFamilyName(event.target.value)} placeholder="Acme Sans" /></label><label className={styles.fullField}><span>Font file</span><input type="file" accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf" disabled={!fontFamilyName.trim()} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void uploadWorkspaceFont(file, fontFamilyName.trim()).then((font) => { setWorkspaceFonts((current) => [...current.filter((item) => item.id !== font.id), font]); setFontFamilyName(""); setMessage(`${font.family} added to the workspace.`); }).catch((caught) => setMessage(caught instanceof Error ? caught.message : "Font upload failed.")); }} /></label>
        {!!unavailableFonts.length && <><h2>Missing fonts</h2>{unavailableFonts.map((font) => <div className={styles.assetRow} key={font}><span>{font}<small>Not in this workspace</small></span><button type="button" onClick={() => actions.commitShapes(replaceFont(board.shapes, font, "Inter"))}>Replace with Inter</button></div>)}</>}
      </section>}

      {tab === "import" && <section className={styles.inspectorSection}><h2><FileArrowUp aria-hidden="true" /> External content</h2><label className={styles.fullField}><span>Content type</span><select value={importMode} onChange={(event) => setImportMode(event.target.value as typeof importMode)}><option value="csv">CSV / spreadsheet</option><option value="url">URL / video</option><option value="mermaid">Mermaid</option><option value="svg">Editable SVG</option></select></label><label className={styles.fullField}><span>{importMode === "url" ? "Public URL" : "Paste content"}</span><textarea rows={9} value={importValue} onChange={(event) => setImportValue(event.target.value)} /></label><button type="button" disabled={!actions.canEdit || !importValue.trim()} onClick={importContent}>Add editable content</button><p className={styles.fieldHint}>Pasted SVG primitives become editable Kumo layers. Images and media can also be dragged, pasted, or added from the Image tool.</p>{selected?.type === "table" && <label className={styles.fullField}><span>Edit selected table as CSV</span><textarea rows={8} value={(selected.tableCells ?? []).map((row) => row.join(",")).join("\n")} onChange={(event) => { const cells = csvCells(event.target.value); actions.patchSelected({ tableCells: cells, rows: cells.length, columns: Math.max(1, ...cells.map((row) => row.length)) }); }} /></label>}{(selected?.type === "sticky" || selected?.type === "code") && <label className={styles.fullField}><span>Edit selected {selected.type}</span><textarea rows={7} value={selected.text ?? ""} onChange={(event) => actions.patchSelected({ text: event.target.value })} /></label>}{selected?.type === "link" && <><label className={styles.fullField}><span>Title</span><input value={selected.embedTitle ?? ""} onChange={(event) => actions.patchSelected({ embedTitle: event.target.value })} /></label><label className={styles.fullField}><span>Description</span><textarea value={selected.embedDescription ?? ""} onChange={(event) => actions.patchSelected({ embedDescription: event.target.value })} /></label></>}</section>}

      {tab === "workshop" && <>
        <section className={styles.inspectorSection}><h2><Timer aria-hidden="true" /> Live workshop</h2><div className={styles.workshopTimer} role="timer">{timerLabel}</div><div className={styles.buttonGrid}><button type="button" disabled={!actions.canEdit} onClick={() => actions.commitShapes(updateWorkshopState(board.shapes, { timerEndsAt: Date.now() + workshop.timerDurationSeconds * 1000 }))}>Start 5 min</button><button type="button" disabled={!actions.canEdit} onClick={() => actions.commitShapes(updateWorkshopState(board.shapes, { timerEndsAt: null }))}>Stop</button></div><label className={styles.preference}><span>Voting open</span><input type="checkbox" checked={workshop.votingOpen} onChange={(event) => actions.commitShapes(updateWorkshopState(board.shapes, { votingOpen: event.target.checked }))} /></label><label className={styles.fullField}><span>Votes per person</span><input type="number" min="1" max="20" value={workshop.votesPerPerson} onChange={(event) => actions.commitShapes(updateWorkshopState(board.shapes, { votesPerPerson: Number(event.target.value) }))} /></label><label className={styles.fullField}><span>Optional background audio URL</span><input type="url" value={workshop.musicUrl} onChange={(event) => actions.commitShapes(updateWorkshopState(board.shapes, { musicUrl: event.target.value }))} /></label>{workshop.musicUrl && <audio src={workshop.musicUrl} controls loop><track kind="captions" src="/empty-captions.vtt" srcLang="en" label="No transcript provided" default /></audio>}</section>
        <section className={styles.inspectorSection}><h2>Stamps and reactions</h2><div className={styles.buttonGrid}><button type="button" onClick={() => addWorkshopStamp("+1", "#b7e4c7")}>+1 stamp</button><button type="button" onClick={() => addWorkshopStamp("!", "#f6d365")}>Emphasis</button><button type="button" onClick={() => addWorkshopStamp("HIGH FIVE", "#cdb4db")}>High five</button></div></section>
      </>}

      {tab === "portal" && <section className={styles.inspectorSection}><h2><LinkSimple aria-hidden="true" /> Live board portal</h2>{selected?.type !== "board" ? <p className={styles.fieldHint}>Select a linked-board object to pin a version or review its update state.</p> : <><dl className={styles.inspectGrid}><div><dt>Destination</dt><dd>{selected.title ?? "Unassigned"}</dd></div><div><dt>Status</dt><dd>{selected.boardId ? board.linkedBoards[selected.boardId]?.accessible ? "Live" : "Access required" : "Not linked"}</dd></div></dl><label className={styles.fullField}><span>Version ID (optional)</span><input value={portalVersion} onChange={(event) => setPortalVersion(event.target.value)} placeholder="Pin an exact version" /></label><div className={styles.buttonGrid}><button type="button" disabled={!actions.canEdit} onClick={() => actions.patchSelected({ portalVersionId: portalVersion.trim() || null, portalPinnedAt: new Date().toISOString() })}>Pin portal</button><button type="button" disabled={!actions.canEdit} onClick={() => actions.patchSelected({ portalVersionId: null, portalPinnedAt: null })}>Follow live</button></div></>}</section>}

      {message && <p className={styles.successLine} role="status"><Check aria-hidden="true" /> {message}</p>}
    </div>
  </aside>;
};

export default AdvancedStudioPanel;
