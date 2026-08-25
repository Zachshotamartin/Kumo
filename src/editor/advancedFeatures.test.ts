import type { Shape } from "../classes/shape";
import { normalizeShape, shapeBounds } from "./geometry";
import {
  BUILTIN_FONTS,
  anchorPoint,
  appendFreehandPoint,
  connectorEndpoints,
  connectorPath,
  connectorRenderBounds,
  createAdvancedPrimitive,
  createPrototypeFlow,
  csvCells,
  endpointAtPoint,
  finalizeConnector,
  missingFonts,
  prototypeFlows,
  pushBoardTrail,
  quickConnectNode,
  readablePaintBackground,
  refreshAttachedConnectors,
  removePrototypeFlow,
  replaceFont,
  richLinkShape,
  routeConnector,
  searchFonts,
  shapesFromMermaid,
  shapesFromSvg,
  tableShapeFromCsv,
  updatePrototypeFlow,
  updateWorkshopState,
  workshopState,
} from "./advancedFeatures";
import { connectorCurvePoints, segmentHitsBounds } from "./connectorGeometry";

let serial = 0;
const rectangle = (id: string, x: number, y: number, width = 120, height = 80, zIndex = ++serial): Shape => normalizeShape({
  id, type: "rectangle", name: id, x1: x, y1: y, x2: x + width, y2: y + height,
  width, height, level: 0, zIndex, parentId: null, backgroundColor: "#fff", borderColor: "#111", borderWidth: 1,
});

describe("advanced canvas algorithms", () => {
  beforeEach(() => { serial = 0; });

  it("resolves explicit and automatic connector anchors", () => {
    const source = rectangle("source", 0, 0, 100, 60);
    expect(anchorPoint(source, "top")).toEqual({ x: 50, y: 0 });
    expect(anchorPoint(source, "auto", { x: 300, y: 30 })).toEqual({ x: 100, y: 30 });
    expect(anchorPoint(source, "auto", { x: 50, y: -200 })).toEqual({ x: 50, y: 0 });
    expect(anchorPoint(source, "right")).toEqual({ x: 100, y: 30 });
    expect(anchorPoint(source, "bottom")).toEqual({ x: 50, y: 60 });
    expect(anchorPoint(source, "left")).toEqual({ x: 0, y: 30 });
    expect(anchorPoint(source, "auto")).toEqual({ x: 50, y: 30 });
    expect(anchorPoint(source, "auto", { x: -100, y: 30 })).toEqual({ x: 0, y: 30 });
    expect(anchorPoint(source, "auto", { x: 50, y: 200 })).toEqual({ x: 50, y: 60 });
  });

  it("attaches connector endpoints, follows moved nodes, and emits every route type", () => {
    const source = rectangle("source", 0, 0);
    const target = rectangle("target", 360, 160);
    const connector = normalizeShape({
      ...createAdvancedPrimitive("connector", { x: 110, y: 40 }, [source, target]),
      x1: 110, y1: 40, x2: 370, y2: 180,
      connectorStart: { shapeId: source.id, anchor: "right", x: 120, y: 40 },
      connectorEnd: { shapeId: target.id, anchor: "left", x: 360, y: 200 },
    });
    expect(connectorEndpoints([source, target, connector], connector)).toEqual([{ x: 120, y: 40 }, { x: 360, y: 200 }]);
    expect(routeConnector([source, target, connector], connector).length).toBeGreaterThanOrEqual(3);
    expect(connectorPath([source, target, { ...connector, connectorRouting: "straight" }], { ...connector, connectorRouting: "straight" })).toMatch(/^M .* L /);
    expect(connectorPath([source, target, { ...connector, connectorRouting: "curved" }], { ...connector, connectorRouting: "curved" })).toContain(" C ");
    const moved = { ...source, x1: 40, x2: 160 };
    const refreshed = refreshAttachedConnectors([moved, target, connector]).find((shape) => shape.id === connector.id)!;
    expect(refreshed.x1).toBe(160);
    const free = { ...connector, connectorStart: { anchor: "auto" as const, x: 1, y: 2 }, connectorEnd: { anchor: "auto" as const, x: 3, y: 4 } };
    expect(connectorEndpoints([free], free)).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    const fallback = { ...connector, connectorRouting: undefined, connectorStart: undefined, connectorEnd: undefined, x1: 1, y1: 2, x2: 3, y2: 4, borderWidth: undefined };
    expect(connectorEndpoints([fallback], fallback)).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(routeConnector([fallback], fallback)).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(connectorRenderBounds([fallback], fallback)).toMatchObject({ width: 18, height: 18 });
    expect(connectorPath([fallback], fallback)).toContain(" L ");
    const defaultAnchors = { ...connector, connectorStart: { shapeId: source.id, anchor: undefined as never, x: 120, y: 40 }, connectorEnd: { shapeId: target.id, anchor: undefined as never, x: 360, y: 200 } };
    expect(connectorEndpoints([source, target, defaultAnchors], defaultAnchors)).toHaveLength(2);
    const startOnly = { ...connector, connectorStart: { shapeId: source.id, anchor: undefined as never, x: 120, y: 40 }, connectorEnd: undefined };
    expect(connectorEndpoints([source, startOnly], startOnly)[0]).toEqual({ x: 120, y: 40 });
    const endOnly = { ...connector, connectorStart: undefined, connectorEnd: { shapeId: target.id, anchor: undefined as never, x: 360, y: 200 } };
    expect(connectorEndpoints([target, endOnly], endOnly)[1]).toEqual({ x: 360, y: 200 });
    expect(connectorCurvePoints({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual([{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: -14, y: 20 }, { x: 10, y: 20 }]);
  });

  it("chooses an orthogonal detour around obstacles", () => {
    const source = rectangle("source", 0, 100, 80, 60);
    const obstacle = rectangle("obstacle", 170, 65, 100, 130);
    const target = rectangle("target", 360, 100, 80, 60);
    const connector = normalizeShape({
      ...createAdvancedPrimitive("connector", { x: 80, y: 130 }, [source, obstacle, target]),
      x1: 80, y1: 130, x2: 360, y2: 130,
      connectorStart: { shapeId: source.id, anchor: "right", x: 80, y: 130 },
      connectorEnd: { shapeId: target.id, anchor: "left", x: 360, y: 130 },
    });
    const route = routeConnector([source, obstacle, target, connector], connector);
    expect(route.length).toBeGreaterThan(2);
    expect(route.some((point) => point.y < 53 || point.y > 207)).toBe(true);
    const renderBounds = connectorRenderBounds([source, obstacle, target, connector], connector);
    expect(route.every((point) => point.x >= renderBounds.x && point.x <= renderBounds.x + renderBounds.width
      && point.y >= renderBounds.y && point.y <= renderBounds.y + renderBounds.height)).toBe(true);
    const coordinates = [...connectorPath([source, obstacle, target, connector], connector).matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(0);
    expect(segmentHitsBounds({ x: 5, y: -20 }, { x: 5, y: 20 }, { x: 0, y: 0, width: 10, height: 10 }, 0)).toBe(true);
    expect(segmentHitsBounds({ x: 5, y: -20 }, { x: 5, y: -10 }, { x: 0, y: 0, width: 10, height: 10 }, 0)).toBe(false);
    expect(segmentHitsBounds({ x: -20, y: 5 }, { x: 20, y: 5 }, { x: 0, y: 0, width: 10, height: 10 }, 0)).toBe(true);
    expect(segmentHitsBounds({ x: -20, y: 20 }, { x: 20, y: 20 }, { x: 0, y: 0, width: 10, height: 10 }, 0)).toBe(false);
    const distant = rectangle("distant", 1000, 1000);
    expect(routeConnector([source, distant, target, connector], connector).length).toBeGreaterThanOrEqual(2);
  });

  it("finalizes free endpoints against hit shapes and leaves empty endpoints free", () => {
    const source = rectangle("source", 0, 0);
    const connector = normalizeShape({ ...createAdvancedPrimitive("connector", { x: 60, y: 40 }, [source]), x1: 60, y1: 40, x2: 300, y2: 200 });
    const finalized = finalizeConnector([source, connector], connector.id).find((shape) => shape.id === connector.id)!;
    expect(finalized.connectorStart?.shapeId).toBe(source.id);
    expect(finalized.connectorEnd?.shapeId).toBeUndefined();
    expect(finalized.connectorEnd).toMatchObject({ x: 300, y: 200 });
  });

  it("picks the highest eligible endpoint target and rejects invalid finalization", () => {
    const lower = rectangle("lower", 0, 0, 100, 100, 1);
    const higher = rectangle("higher", 0, 0, 100, 100, 2);
    const tied = rectangle("tied", 0, 0, 100, 100, 2);
    const hidden = { ...rectangle("hidden", 0, 0, 100, 100, 10), hidden: true };
    const guide = { ...rectangle("guide", 0, 0, 100, 100, 11), type: "guide" };
    expect(endpointAtPoint([lower, higher, tied, hidden, guide], { x: 50, y: 50 }, "tied").shapeId).toBe(higher.id);
    expect(endpointAtPoint([hidden, guide], { x: 50, y: 50 })).toEqual({ anchor: "auto", x: 50, y: 50 });
    expect(finalizeConnector([lower], "missing")).toEqual([lower]);
    expect(finalizeConnector([lower], lower.id)).toEqual([lower]);
  });

  it("samples marker and highlighter paths without redundant points", () => {
    const marker = createAdvancedPrimitive("marker", { x: 10, y: 10 }, []);
    const unchanged = appendFreehandPoint(marker, { x: 10.2, y: 10.2 }, 2);
    const extended = appendFreehandPoint(marker, { x: 30, y: 25 }, 2);
    expect(unchanged.vectorPoints).toHaveLength(2);
    expect(extended.vectorPoints).toHaveLength(3);
    expect(createAdvancedPrimitive("highlighter", { x: 0, y: 0 }, [])).toMatchObject({ drawingKind: "highlighter", opacity: 0.42, strokeCap: "round" });
    expect(appendFreehandPoint(rectangle("plain", 0, 0), { x: 5, y: 5 })).toMatchObject({ id: "plain" });
    const emptyMarker = { ...marker, vectorPoints: undefined };
    expect(appendFreehandPoint(emptyMarker, { x: 4, y: 4 })?.vectorPoints).toHaveLength(1);
  });

  it.each(["sticky", "table", "code", "link", "connector"] as const)("creates complete %s defaults", (kind) => {
    const shape = createAdvancedPrimitive(kind, { x: 20, y: 30 }, []);
    expect(shape.type).toBe(kind);
    expect(shape.width).toBeGreaterThanOrEqual(0);
    expect(shape.zIndex).toBe(1);
  });

  it("creates, updates, and removes named prototype flows", () => {
    const frame = { ...rectangle("frame", 0, 0, 320, 240), type: "frame" };
    const created = createPrototypeFlow([frame], frame.id, "Checkout", "Complete a purchase");
    const flow = prototypeFlows(created)[0]!;
    expect(flow).toMatchObject({ name: "Checkout", startFrameId: frame.id });
    const renamed = updatePrototypeFlow(created, { ...flow, name: "Purchase", description: "Updated" });
    expect(prototypeFlows(renamed)[0]?.name).toBe("Purchase");
    expect(removePrototypeFlow(renamed, flow.id)).toEqual([expect.objectContaining({ id: frame.id, prototypeFlowIds: [] })]);
    expect(createPrototypeFlow([rectangle("not-frame", 0, 0)], "not-frame", "Nope")).toHaveLength(1);
  });

  it("handles malformed flows, default names, existing IDs, and moved starts", () => {
    const frame = { ...rectangle("frame", 0, 0), type: "frame", prototypeFlowIds: ["existing"] };
    const other = { ...rectangle("other", 200, 0), type: "frame", prototypeFlowIds: ["flow", "keep"] };
    const created = createPrototypeFlow([frame, other], frame.id, "   ", "  note  ");
    expect(prototypeFlows(created)[0]).toMatchObject({ name: "Flow", description: "note" });
    expect(created.find((item) => item.id === frame.id)?.prototypeFlowIds).toEqual(["existing", expect.any(String)]);

    const malformed = normalizeShape({ ...rectangle("malformed", 0, 0), type: "resource", resourceKind: "prototype-flow", resourceValue: { json: "{" } });
    const incomplete = normalizeShape({ ...rectangle("incomplete", 0, 0), type: "resource", resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "only" }) } });
    const empty = normalizeShape({ ...rectangle("empty", 0, 0), type: "resource", resourceKind: "prototype-flow", resourceValue: undefined });
    expect(prototypeFlows([rectangle("plain", 0, 0), malformed, incomplete, empty])).toEqual([]);

    const resource = normalizeShape({ ...rectangle("flow-resource", 0, 0), type: "resource", resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "flow", name: "Old", description: "", startFrameId: frame.id }) } });
    const unrelated = rectangle("unrelated", 400, 0);
    const moved = updatePrototypeFlow([frame, other, unrelated, resource], { id: "flow", name: "Moved", description: "new", startFrameId: frame.id });
    expect(moved.find((item) => item.id === resource.id)).toMatchObject({ resourceName: "Moved" });
    expect(moved.find((item) => item.id === frame.id)?.prototypeFlowIds).toContain("flow");
    expect(moved.find((item) => item.id === other.id)?.prototypeFlowIds).toEqual(["keep"]);
    expect(moved.find((item) => item.id === unrelated.id)).toBe(unrelated);
    expect(removePrototypeFlow([frame, unrelated, resource], "flow")).toContain(unrelated);
  });

  it("searches font registries, detects missing faces, and replaces runs", () => {
    expect(searchFonts(BUILTIN_FONTS, "plex").map((font) => font.family)).toEqual(["IBM Plex Mono"]);
    const shape = { ...rectangle("text", 0, 0), type: "text", fontFamily: "Missing Sans", textRuns: [{ id: "run", start: 0, end: 2, fontFamily: "Missing Sans" }] };
    expect(missingFonts([shape], BUILTIN_FONTS.map((font) => font.family))).toEqual(["Missing Sans"]);
    expect(missingFonts([{ ...shape, fontFamily: "Missing Sans, Arial", textRuns: [] }], BUILTIN_FONTS.map((font) => font.family))).toEqual(["Missing Sans, Arial"]);
    expect(missingFonts([{ ...shape, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", textRuns: [] }], BUILTIN_FONTS.map((font) => font.family))).toEqual([]);
    expect(missingFonts([{ ...shape, fontFamily: "'Inter', sans-serif", textRuns: [] }], BUILTIN_FONTS.map((font) => font.family))).toEqual([]);
    expect(replaceFont([shape], "Missing Sans", "Inter")[0]).toMatchObject({ fontFamily: "Inter", textRuns: [expect.objectContaining({ fontFamily: "Inter" })] });
    expect(searchFonts(BUILTIN_FONTS, "   ")).toBe(BUILTIN_FONTS);
    expect(missingFonts([rectangle("plain", 0, 0), { ...shape, fontFamily: undefined, textRuns: [{ id: "empty", start: 0, end: 1 }] }], [])).toEqual([]);
    expect(missingFonts([{ ...shape, fontFamily: "   ", textRuns: [] }], [])).toEqual(["   "]);
    expect(replaceFont([{ ...shape, fontFamily: "Inter", textRuns: [{ id: "other", start: 0, end: 1, fontFamily: "Inter" }] }], "Missing Sans", "Arial")[0]).toMatchObject({ fontFamily: "Inter", textRuns: [expect.objectContaining({ fontFamily: "Inter" })] });
  });

  it("parses quoted CSV and sizes an editable table", () => {
    expect(csvCells('Name,Note\r\nAda,"hello, world"\r\nLin,"said ""hi"""')).toEqual([
      ["Name", "Note"], ["Ada", "hello, world"], ["Lin", 'said "hi"'],
    ]);
    const table = tableShapeFromCsv("A,B,C\n1,2,3", { x: 10, y: 20 }, []);
    expect(table).toMatchObject({ type: "table", rows: 2, columns: 3, tableCells: [["A", "B", "C"], ["1", "2", "3"]] });
    expect(table.width).toBe(360);
    expect(csvCells("")).toEqual([]);
    expect(csvCells("a\nb,c")).toEqual([["a", ""], ["b", "c"]]);
    expect(tableShapeFromCsv("", { x: 0, y: 0 }, [])).toMatchObject({ rows: 1, columns: 1, width: 240, height: 96 });
  });

  it("validates rich links and derives a readable card", () => {
    expect(richLinkShape("javascript:alert(1)", { x: 0, y: 0 }, [])).toBeNull();
    expect(richLinkShape("https://www.example.com/research", { x: 0, y: 0 }, [])).toMatchObject({ embedTitle: "example.com", embedDescription: "/research" });
    expect(richLinkShape("not a URL", { x: 0, y: 0 }, [])).toBeNull();
    expect(richLinkShape("https://example.com/", { x: 0, y: 0 }, [])).toMatchObject({ embedDescription: "Open website" });
  });

  it("turns Mermaid into editable nodes and attached labeled connectors", () => {
    const shapes = shapesFromMermaid("flowchart LR\nA[Idea] -->|review| B{Decision}\nB --> C(Done)", { x: 0, y: 0 }, []);
    expect(shapes.filter((shape) => shape.type === "connector")).toHaveLength(2);
    expect(shapes.find((shape) => shape.connectorLabel === "review")?.connectorStart?.shapeId).toBeTruthy();
    expect(shapes.find((shape) => shape.name === "Decision")?.rotation).toBe(45);
    expect(shapesFromMermaid("flowchart LR", { x: 0, y: 0 }, [])).toEqual([]);
  });

  it("imports SVG primitives, text, polylines, and cubic paths as editable layers", () => {
    const source = `<svg viewBox="0 0 400 200"><rect id="card" x="10" y="20" width="80" height="40" rx="6" fill="#fff"/><circle cx="140" cy="40" r="20" fill="#f00"/><polyline points="180,20 220,60 260,20" fill="none" stroke="#333"/><path d="M 280 20 C 300 0 340 80 370 40" fill="none" stroke="#000"/><text x="10" y="120" font-size="20">Hello</text></svg>`;
    const shapes = shapesFromSvg(source, { x: 100, y: 200 }, []);
    expect(shapes.map((shape) => shape.type)).toEqual(["rectangle", "ellipse", "vector", "vector", "text"]);
    expect(shapes[0]).toMatchObject({ name: "card", borderRadius: 6 });
    expect(shapes[3]?.vectorPoints?.[0]?.handleOut).toBeDefined();
    expect(shapes[4]).toMatchObject({ text: "Hello", textAutoResize: "auto-width" });
    expect(shapesFromSvg("<svg><bad>", { x: 0, y: 0 }, [])).toEqual([]);
  });

  it("reflects smooth SVG cubic controls in source coordinates before scaling", () => {
    const [vector] = shapesFromSvg('<svg viewBox="0 0 1280 200"><path d="M 0 100 C 100 0 200 0 300 100 S 500 200 600 100"/></svg>', { x: 10, y: 20 }, []);
    expect(vector?.vectorPoints?.[1]?.handleOut).toEqual({ x: 210, y: 120 });
  });

  it("imports SVG fallbacks, styles, every path command, and rejects invalid roots", () => {
    const source = `<svg viewBox="bad bad bad bad" width="800" height="bad">
      <rect x="bad" y="2" width="10" height="10" style="fill: none; stroke: none" stroke-width="-3" opacity="2"/>
      <ellipse cx="30" cy="20" rx="10" ry="5"/>
      <line x1="0" y1="0" x2="10" y2="10"/>
      <polygon points="0,0 10,0 10,10"/>
      <polyline points="1"/>
      <polyline/>
      <path d="M 0 0 H 10 V 10 h 5 v 5 T 20 20 Z"/>
      <path d="m 0 0 l 10 10"/>
      <path d="M 0 0 Q 10 20 20 0 A 5 5 0 0 1 30 10"/>
      <path d="Q 10 20 20 0 L 30 10"/>
      <path d="C 1 2 3 4 5 6 L 8 9"/>
      <path d="S 3 4 5 6 L 8 9"/>
      <path d="M"/>
      <path d="10 20"/>
      <path d="X 1 2"/>
      <path/>
      <text x="0" y="20" style="fill: #123456"></text>
    </svg>`;
    const shapes = shapesFromSvg(source, { x: 10, y: 20 }, []);
    expect(shapes.some((item) => item.type === "ellipse")).toBe(true);
    expect(shapes.filter((item) => item.type === "vector").length).toBeGreaterThanOrEqual(7);
    expect(shapes.find((item) => item.type === "rectangle")).toMatchObject({ name: "SVG rectangle", backgroundColor: "transparent", borderColor: "transparent", borderWidth: 0, opacity: 1 });
    expect(shapes.find((item) => item.type === "text")).toMatchObject({ text: "", color: "#123456" });
    expect(shapesFromSvg("<html></html>", { x: 0, y: 0 }, [])).toEqual([]);
    expect(shapesFromSvg('<svg width="20" height="20"><line x1="0" y1="0" x2="10" y2="10"/></svg>', { x: 0, y: 0 }, [])).toHaveLength(1);

    const parser = globalThis.DOMParser;
    vi.stubGlobal("DOMParser", undefined);
    expect(shapesFromSvg("<svg/>", { x: 0, y: 0 }, [])).toEqual([]);
    vi.stubGlobal("DOMParser", parser);
  });

  it("creates directional connected nodes with stable attachments", () => {
    const source = rectangle("source", 200, 200, 120, 80);
    for (const direction of ["left", "right", "top", "bottom"] as const) {
      const result = quickConnectNode([source], source.id, direction);
      expect(result.nodeId).toBeTruthy();
      const node = result.shapes.find((shape) => shape.id === result.nodeId)!;
      const connector = result.shapes.find((shape) => shape.type === "connector")!;
      expect(connector.connectorStart?.shapeId).toBe(source.id);
      expect(connector.connectorEnd?.shapeId).toBe(node.id);
      if (direction === "left") expect(shapeBounds(node).x).toBeLessThan(source.x1);
      if (direction === "right") expect(shapeBounds(node).x).toBeGreaterThan(source.x2);
    }
    expect(quickConnectNode([source], "missing", "right")).toEqual({ shapes: [source], nodeId: null });
  });

  it("parses standalone Mermaid nodes, ignores invalid edges, and upgrades labels", () => {
    const shapes = shapesFromMermaid(`%% comment
      graph TD
      A
      A[Named A]
      A
      B(Standalone)
      invalid token !
      A --> ???`, { x: 0, y: 0 }, []);
    expect(shapes.filter((item) => item.type !== "connector").map((item) => item.name)).toEqual(["Named A", "Standalone"]);
    expect(shapes.some((item) => item.type === "connector")).toBe(false);
  });

  it("persists workshop settings and tolerates corrupt resource JSON", () => {
    const started = updateWorkshopState([], { votingOpen: true, votesPerPerson: 5, timerEndsAt: 5000 });
    expect(workshopState(started)).toMatchObject({ votingOpen: true, votesPerPerson: 5, timerEndsAt: 5000 });
    const updated = updateWorkshopState(started, { musicUrl: "https://example.com/music.mp3" });
    expect(updated).toHaveLength(1);
    expect(workshopState([{ ...updated[0]!, resourceValue: { json: "{" } }])).toMatchObject({ votingOpen: false, votesPerPerson: 3 });
    const companion = rectangle("companion", 0, 0);
    const updatedWithCompanion = updateWorkshopState([...updated, companion], { votingOpen: false });
    expect(updatedWithCompanion.find((item) => item.id === companion.id)).toBe(companion);
  });

  it("deduplicates connected-board trail entries and caps its history", () => {
    const one = { boardId: "one", title: "One", sourceShapeId: "portal" };
    expect(pushBoardTrail([one], one)).toEqual([one]);
    const trail = Array.from({ length: 40 }, (_, index) => ({ boardId: String(index), title: String(index) }));
    expect(pushBoardTrail(trail, { boardId: "40", title: "40" })).toHaveLength(32);
    expect(pushBoardTrail(trail, { boardId: "40", title: "40" })[0]?.boardId).toBe("9");
  });

  it("renders solid, translucent, image, linear, and radial paint stacks", () => {
    const shape = rectangle("paint", 0, 0);
    expect(readablePaintBackground({ ...shape, fills: [{ id: "solid", type: "solid", color: "#fff", opacity: 1, visible: true }] })).toBe("#fff");
    expect(readablePaintBackground({ ...shape, fills: [{ id: "solid", type: "solid", color: "#fff", opacity: .5, visible: true }] })).toContain("color-mix");
    expect(readablePaintBackground({ ...shape, fills: [{ id: "image", type: "image", imageUrl: "https://example.com/a.png", opacity: 1, visible: true }] })).toContain("url(");
    expect(readablePaintBackground({ ...shape, fills: [{ id: "gradient", type: "linear-gradient", opacity: 1, visible: true, gradientAngle: 45, gradientStops: [{ id: "a", position: 0, color: "#000", opacity: 1 }, { id: "b", position: 1, color: "#fff", opacity: 1 }] }] })).toContain("linear-gradient(45deg");
    expect(readablePaintBackground({ ...shape, fills: [{ id: "gradient", type: "radial-gradient", opacity: 1, visible: true, gradientStops: [{ id: "a", position: 0, color: "#000", opacity: 1 }] }] })).toContain("radial-gradient");
    expect(readablePaintBackground({ ...shape, fills: [] })).toBeUndefined();
  });

  it("refreshes a 20,000-layer document within the interaction budget", () => {
    const document = Array.from({ length: 20_000 }, (_, index) => rectangle(`shape-${index}`, index % 1000, Math.floor(index / 1000) * 10, 8, 8, index));
    const started = performance.now();
    const refreshed = refreshAttachedConnectors(document);
    expect(refreshed).toHaveLength(20_000);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
