import type { Shape } from "../classes/shape";
import { downloadBlob, embedSvgImages, parseKumoDocument, serializeKumoDocument, serializePdf, serializeSvg, serializeSvgWithAssets, svgToPng } from "./export";

const shape = (id: string, type = "rectangle", patch: Partial<Shape> = {}): Shape => ({
  id, type, name: id, x1: 10, y1: 20, x2: 110, y2: 70, width: 100, height: 50,
  level: 0, zIndex: 1, parentId: null, backgroundColor: "#fff", ...patch,
});

describe("portable design output", () => {
  it("serializes safe SVG geometry and escaped text", () => {
    const svg = serializeSvg([shape("text", "text", { text: "A < B & C", color: "#123456" })]);
    expect(svg).toContain("viewBox=\"0 0 100 50\"");
    expect(svg).toContain("A &lt; B &amp; C");
  });

  it("includes descendants when exporting a selected frame", () => {
    const frame = shape("frame", "frame");
    const child = shape("child", "text", { parentId: frame.id, text: "Nested", x1: 90, x2: 250 });
    const svg = serializeSvg([frame, child], [frame.id]);
    expect(svg).toContain("Nested");
    expect(svg).toContain('width="100" height="50" viewBox="0 0 100 50"');
  });

  it("preserves vectors, gradients, masks, blending, and effects in SVG", () => {
    const mask = shape("mask", "ellipse", { isMask: true });
    const vector = shape("vector", "vector", {
      maskId: mask.id,
      vectorClosed: true,
      vectorPoints: [{ id: "a", x: 10, y: 20 }, { id: "b", x: 110, y: 70 }],
      fillType: "linear-gradient",
      gradientStops: [{ id: "s1", position: 0, color: "#ff0000", opacity: 1 }, { id: "s2", position: 1, color: "#0000ff", opacity: 0.5 }],
      effects: [{ id: "shadow", type: "drop-shadow", color: "#000000", x: 2, y: 3, blur: 8, spread: 1, visible: true }],
      blendMode: "multiply",
    });
    const svg = serializeSvg([mask, vector]);
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("<mask id=\"mask-mask\"");
    expect(svg).toContain("<feDropShadow");
    expect(svg).toContain("mix-blend-mode:multiply");
    expect(svg).toContain("<path d=\"M 0 0 L 100 50 Z\"");
  });

  it("exports routed connectors as paths with their paint stack and endpoint markers", () => {
    const obstacle = shape("obstacle", "rectangle", { x1: 70, x2: 110, y1: -40, y2: 130, width: 40, height: 170, zIndex: 1 });
    const connector = shape("connector", "connector", {
      x1: 0, y1: 50, x2: 180, y2: 50, width: 180, height: 0, zIndex: 2,
      connectorRouting: "orthogonal", connectorAvoidObstacles: true,
      connectorStart: { anchor: "auto", x: 0, y: 50 }, connectorEnd: { anchor: "auto", x: 180, y: 50 },
      connectorStartCap: "circle", connectorEndCap: "arrow",
      strokes: [{ id: "stroke", color: "#b87a2e", width: 3, opacity: 0.5, visible: true, style: "dashed", align: "center" }],
    });
    const svg = serializeSvg([obstacle, connector]);
    expect(svg).toContain('<marker id="start-connector"');
    expect(svg).toContain('<marker id="end-connector"');
    expect(svg).toContain('stroke="#b87a2e"');
    expect(svg).toContain('stroke-opacity="0.5"');
    expect(svg).toContain('marker-end="url(#end-connector)"');
    expect(svg).not.toContain('<rect x="0" y="90" width="180" height="0"');
  });

  it("preserves structured canvas object content in portable SVG", () => {
    const svg = serializeSvg([
      shape("sticky", "sticky", { text: "Vote <here>" }),
      shape("table", "table", { x1: 130, x2: 330, tableCells: [["Name", "Status"], ["Kumo", "Ready"]], rows: 2, columns: 2 }),
      shape("code", "code", { x1: 350, x2: 550, codeLanguage: "typescript", text: "const ready = true;" }),
      shape("link", "link", { x1: 570, x2: 770, embedTitle: "Kumo docs", embedDescription: "Product guide" }),
      shape("video", "image", { x1: 790, x2: 990, mediaType: "video", backgroundImage: "https://assets.test/demo.mp4" }),
    ]);
    expect(svg).toContain("Vote &lt;here&gt;");
    expect(svg).toContain("Name");
    expect(svg).toContain("Status");
    expect(svg).toContain("typescript");
    expect(svg).toContain("const ready = true;");
    expect(svg).toContain("Kumo docs");
    expect(svg).toContain("Product guide");
    expect(svg).toContain("https://assets.test/demo.mp4");
    expect(svg).not.toContain('<image href="https://assets.test/demo.mp4"');
  });

  it("exports every fill and aligned stroke with independent smoothed corners", () => {
    const svg = serializeSvg([shape("painted", "rectangle", {
      cornerRadii: { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 },
      cornerSmoothing: 0.5,
      fills: [
        { id: "base", type: "solid", color: "#112233", opacity: 1, visible: true },
        { id: "missing-image", type: "image", opacity: 1, visible: true },
        { id: "missing-gradient", type: "radial-gradient", opacity: 1, visible: true, gradientStops: [] },
        { id: "fill", type: "linear-gradient", opacity: 0.5, visible: true, blendMode: "screen", gradientAngle: 30, gradientStops: [
        { id: "start", position: 0, color: "#ff0000", opacity: 1 },
        { id: "end", position: 1, color: "#0000ff", opacity: 0.4 },
      ] }],
      strokes: [
        { id: "inside", color: "#abcdef", width: 2, opacity: 0.75, visible: true, style: "dashed", align: "inside" },
        { id: "outside", color: "#fedcba", width: 3, opacity: 1, visible: true, style: "dotted", align: "outside" },
      ],
    })]);
    expect(svg).toContain('gradientTransform="rotate(30 .5 .5)"');
    expect(svg).toContain('stop-opacity="0.5"');
    expect(svg).toContain('stop-opacity="0.2"');
    expect(svg).toContain('fill="#112233"');
    expect(svg).not.toContain("url(#fill-missing-");
    expect(svg).toContain('mix-blend-mode:screen');
    expect(svg).toContain('stroke="#abcdef"');
    expect(svg).toContain('stroke="#fedcba"');
    expect(svg).toContain('clip-path="url(#stroke-clip-painted)"');
    expect(svg).toContain('mask="url(#stroke-outside-painted)"');
    expect(svg).toContain("M 5.2 0");
  });

  it("serializes clipping, images, text layout, every boolean mode, and secondary paint branches", () => {
    const frame = shape("frame", "frame", { clipContent: true, borderStyle: "dashed" });
    const ellipse = shape("ellipse", "ellipse", {
      parentId: frame.id,
      flipX: true,
      fillType: "radial-gradient",
      gradientStops: [{ id: "a", position: -1, color: "#fff", opacity: 2 }, { id: "b", position: 2, color: "#000", opacity: -1 }],
      backgroundImage: "data:image/png;base64,aW1hZ2U=",
      borderWidth: 2,
      borderStyle: "dotted",
      effects: [
        { id: "blur", type: "layer-blur", color: "#000", x: 0, y: 0, blur: 6, spread: 0, visible: true },
        { id: "shadow", type: "drop-shadow", color: "#000", x: 1, y: 2, blur: 4, spread: 0, visible: true },
      ],
    });
    const text = shape("copy", "text", { parentId: frame.id, text: "One\nTwo", textAlign: "center", textDecoration: "underline", paragraphSpacing: 4 });
    const sources = [shape("left"), shape("right", "ellipse", { x1: 30, x2: 80 })];
    const composites = (["union", "subtract", "intersect", "exclude"] as const).map((operation, index) => shape(`boolean-${operation}`, "boolean", {
      x1: 140 + index * 110,
      x2: 240 + index * 110,
      booleanOperation: operation,
      booleanChildren: sources,
      zIndex: 10 + index,
    }));
    const svg = serializeSvg([frame, ellipse, text, ...composites]);
    expect(svg).toContain("<radialGradient");
    expect(svg).toContain("<feGaussianBlur");
    expect(svg).toContain("scale(-1 1)");
    expect(svg).toContain('<image href="data:image/png;base64,aW1hZ2U="');
    expect(svg).toContain("stroke-linecap=\"round\"");
    expect(svg).toContain("text-anchor=\"middle\"");
    expect(svg).toContain("clip-path=\"url(#clip-frame)\"");
    expect(svg).toContain("boolean-clip-0");
    expect(svg).toContain("fill-rule=\"nonzero\"");
    expect(svg.match(/fill-rule="evenodd"/g)).toHaveLength(2);
  });

  it("serializes sparse defaults, image and radial fills, vector clips, and curved connector caps", () => {
    const curved = shape("curved:id", "connector", {
      x1: 0, y1: 0, x2: 100, y2: 50,
      connectorRouting: "curved",
      connectorStart: { anchor: "auto", x: 0, y: 0 },
      connectorEnd: { anchor: "auto", x: 100, y: 50 },
      connectorStartCap: "diamond",
      connectorEndCap: "circle",
      borderColor: undefined,
      borderWidth: undefined,
    });
    const arrowStart = shape("arrow-start", "connector", {
      connectorStartCap: "arrow", connectorEndCap: "none",
      connectorStart: { anchor: "auto", x: 10, y: 20 }, connectorEnd: { anchor: "auto", x: 110, y: 70 },
    });
    const plainConnector = shape("plain-connector", "connector", {
      connectorStartCap: undefined, connectorEndCap: undefined,
      connectorStart: { anchor: "auto", x: 10, y: 20 }, connectorEnd: { anchor: "auto", x: 110, y: 70 },
    });
    const vector = shape("vector", "vector", {
      backgroundColor: undefined,
      backgroundImage: "data:image/png;base64,aQ==",
      vectorPoints: [{ id: "a", x: 10, y: 20 }, { id: "b", x: 110, y: 70 }],
      vectorClosed: false,
      strokes: [{ id: "outside", color: "#123", width: 2, opacity: 1, visible: true, style: "solid", align: "outside" }],
    });
    const legacyVector = shape("legacy-vector", "vector", {
      backgroundColor: undefined, borderColor: undefined, borderWidth: undefined,
      vectorPoints: [{ id: "a", x: 10, y: 20 }, { id: "b", x: 110, y: 70 }],
      vectorClosed: false, strokeDash: [2, 3], strokeCap: "square",
    });
    const filled = shape("filled", "rectangle", {
      fills: [
        { id: "image", type: "image", imageUrl: "data:image/png;base64,aQ==", opacity: 1, visible: true },
        { id: "radial", type: "radial-gradient", opacity: 1, visible: true, gradientStops: [{ id: "stop", position: 0.5, color: "#fff", opacity: 1 }] },
        { id: "linear", type: "linear-gradient", opacity: 1, visible: true, gradientStops: [{ id: "stop-2", position: 0.5, color: "#000", opacity: 1 }] },
        { id: "empty-solid", type: "solid", color: undefined, opacity: 1, visible: true },
      ],
    });
    const sparseText = shape("sparse-text", "text", {
      text: "one\ntwo", textAlign: "right", color: undefined, fontFamily: undefined, fontSize: undefined,
      fontWeight: undefined, letterSpacing: undefined, opacity: undefined, rotation: undefined, flipY: true,
      paragraphSpacing: undefined,
    });
    const leftText = shape("left-text", "text", { text: "left", textAlign: "left" });
    const emptyText = shape("empty-text", "text", { text: undefined });
    const sticky = shape("sticky", "sticky", { text: "one\ntwo", color: undefined, fontFamily: undefined, fontSize: undefined, lineHeight: undefined });
    const defaultSticky = shape("default-sticky", "sticky", { text: "" });
    const code = shape("code", "code", { codeLanguage: undefined, text: undefined, color: undefined, fontFamily: undefined, fontSize: undefined });
    const link = shape("link", "link", { embedImageUrl: "data:image/png;base64,aQ==", embedTitle: "", embedDescription: "", embedUrl: "", color: undefined, fontFamily: undefined });
    const table = shape("table", "table", { tableCells: undefined, rows: undefined, columns: undefined, color: undefined, fontFamily: undefined, fontSize: undefined, borderColor: undefined, borderWidth: undefined });
    const video = shape("video", "rectangle", { mediaType: "video", embedUrl: undefined, backgroundImage: undefined, color: undefined, fontFamily: undefined });
    const dashed = shape("dashed", "rectangle", { borderWidth: 1, borderStyle: "dashed" });
    const transparent = shape("transparent", "rectangle", { fills: [], backgroundColor: undefined });
    const boolean = shape("modern-boolean", "boolean", {
      booleanOperation: "union", booleanChildren: [shape("boolean-child")],
      fills: [{ id: "boolean-fill", type: "solid", color: "#abc", opacity: 1, visible: true }],
    });
    const maskFrame = shape("mask-frame", "frame", { isMask: true, clipContent: true });
    const maskChild = shape("mask-child", "rectangle", { parentId: maskFrame.id });
    const svg = serializeSvg([curved, arrowStart, plainConnector, vector, legacyVector, filled, sparseText, leftText, emptyText, sticky, defaultSticky, code, link, table, video, dashed, transparent, boolean, maskFrame, maskChild], [], null as unknown as string, { x: 0, y: 0, width: 1000, height: 500 });
    expect(svg).toContain(" C ");
    expect(svg).toContain('<marker id="start-curved-id"');
    expect(svg).toContain('<marker id="end-curved-id"');
    expect(svg).toContain("<pattern id=\"fill-image-filled\"");
    expect(svg).toContain("<radialGradient id=\"fill-radial-filled\"");
    expect(svg).toContain('gradientTransform="rotate(90 .5 .5)"');
    expect(svg).toContain("stroke-outside-vector");
    expect(svg).toContain('text-anchor="end"');
    expect(svg).toContain("Write an idea");
    expect(svg).toContain("plain text");
    expect(svg).toContain("Link preview");
    expect(svg).toContain("Paste a link");
    expect(svg).toContain(">Video<");
    expect(svg).toContain('stroke-dasharray="2 3"');
    expect(svg).toContain('stroke-linecap="square"');
    expect(svg).toContain('fill-rule="nonzero"');
  });

  it("round-trips Kumo JSON and remaps colliding hierarchy and prototype ids", () => {
    const frame = shape("frame", "frame");
    const child = shape("child", "rectangle", { parentId: frame.id, prototypeInteractions: [{ id: "i", trigger: "click", action: "navigate", destinationId: frame.id }] });
    const document = parseKumoDocument(serializeKumoDocument("Board", "#000", [frame, child]), ["frame"]);
    const importedFrame = document.shapes.find((item) => item.type === "frame")!;
    const importedChild = document.shapes.find((item) => item.type === "rectangle")!;
    expect(importedFrame.id).not.toBe("frame");
    expect(importedChild.parentId).toBe(importedFrame.id);
    expect(importedChild.prototypeInteractions?.[0]?.destinationId).toBe(importedFrame.id);
  });

  it("remaps nested object identities and component-set relationships", () => {
    const nested = shape("nested", "rectangle", { parentId: "container" });
    const container = shape("container", "boolean", {
      componentSetId: "set",
      booleanChildren: [nested],
    });
    const set = shape("set", "frame");
    const document = parseKumoDocument(serializeKumoDocument("Board", "#000", [set, container]), ["set", "container", "nested"]);
    const importedSet = document.shapes.find((item) => item.type === "frame")!;
    const importedContainer = document.shapes.find((item) => item.type === "boolean")!;
    const importedNested = importedContainer.booleanChildren![0]!;
    expect(importedContainer.componentSetId).toBe(importedSet.id);
    expect(importedNested.id).not.toBe("nested");
    expect(importedNested.parentId).toBe(importedContainer.id);
  });

  it("includes an otherwise hidden mask definition when exporting only its target", () => {
    const mask = shape("mask", "ellipse", { hidden: true, isMask: true });
    const target = shape("target", "rectangle", { maskId: mask.id });
    const svg = serializeSvg([mask, target], [target.id]);
    expect(svg).toContain('<mask id="mask-mask"');
    expect(svg).toContain('mask="url(#mask-mask)"');
  });

  it("remaps every document relationship and rejects duplicate source ids", () => {
    const page = shape("page", "page-resource", { hidden: true });
    const style = shape("style", "resource", { hidden: true, resourceKind: "fill-style", resourceValue: { backgroundColor: "#fff" } });
    const mask = shape("mask", "ellipse", { pageId: page.id });
    const child = shape("child", "rectangle", {
      pageId: page.id, sectionId: mask.id, maskId: mask.id, fillStyleId: style.id,
      variableBindings: { opacity: style.id },
    });
    const imported = parseKumoDocument(serializeKumoDocument("Board", "#000", [page, style, mask, child]), ["page", "style", "mask"]);
    const importedPage = imported.shapes.find((item) => item.type === "page-resource")!;
    const importedStyle = imported.shapes.find((item) => item.type === "resource")!;
    const importedMask = imported.shapes.find((item) => item.type === "ellipse")!;
    const importedChild = imported.shapes.find((item) => item.id === "child")!;
    expect(importedChild).toMatchObject({ pageId: importedPage.id, sectionId: importedMask.id, maskId: importedMask.id, fillStyleId: importedStyle.id });
    expect(importedChild.variableBindings).toEqual({ opacity: importedStyle.id });
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", schemaVersion: 4, shapes: [shape("same"), shape("same")] }))).toThrow("same id");
  });

  it("sanitizes sparse documents and remaps nested shapes, missing bindings, and interactions", () => {
    const nested = shape("nested", "rectangle", {
      parentId: "outer",
      variableBindings: { kept: "target", dropped: "missing" },
      prototypeInteractions: [
        { id: "go", trigger: "click", action: "navigate", destinationId: "target" },
        { id: "back", trigger: "click", action: "back" },
      ],
    });
    const orphanNested = shape("orphan-nested", "rectangle", { parentId: undefined });
    const target = shape("target");
    const outer = shape("outer", "frame", { shapes: [nested, orphanNested] });
    const source = JSON.stringify({
      format: "kumo-document",
      schemaVersion: 4,
      shapes: [
        { type: "rectangle", x1: "bad", y1: null, x2: null, y2: undefined, width: "bad", height: Infinity, level: NaN, zIndex: NaN },
        target,
        outer,
        shape("top-binding", "rectangle", { variableBindings: { dropped: "missing" } }),
      ],
    });
    const parsed = parseKumoDocument(source);
    expect(parsed).toMatchObject({ title: "Imported board", backgroundColor: "#252629" });
    expect(parsed.shapes[0]).toMatchObject({ x1: 0, y1: 0, x2: 1, y2: 1, level: 0, zIndex: 1 });
    const parsedOuter = parsed.shapes.find((item) => item.type === "frame")!;
    const parsedNested = parsedOuter.shapes![0]!;
    const parsedTarget = parsed.shapes.find((item) => item.name === "target")!;
    expect(parsedNested.parentId).toBe(parsedOuter.id);
    expect(parsedNested.variableBindings).toEqual({ kept: parsedTarget.id });
    expect(parsedNested.prototypeInteractions).toEqual([
      expect.objectContaining({ destinationId: parsedTarget.id }),
      expect.objectContaining({ destinationId: undefined }),
    ]);
    expect(parsedOuter.shapes?.[1]?.parentId).toBeNull();
    expect(parsed.shapes.find((item) => item.name === "top-binding")?.variableBindings).toEqual({});
  });

  it("rejects documents with excessive total nested objects", () => {
    const children = Array.from({ length: 20_001 }, (_, index) => shape(`nested-${index}`));
    expect(() => parseKumoDocument(JSON.stringify({
      format: "kumo-document", schemaVersion: 4, shapes: [shape("root", "frame", { shapes: children })],
    }))).toThrow("too many nested objects");
  });

  it("rejects malformed imports", () => {
    expect(() => parseKumoDocument("{}" )).toThrow("not a Kumo document");
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", schemaVersion: 4, shapes: [null] }))).toThrow("Object 1 is invalid");
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", schemaVersion: 3, shapes: [] }))).toThrow("schema 3");
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", shapes: [] }))).toThrow("schema unknown");
  });

  it("rejects oversized and excessively nested document structures", () => {
    const tooMany = Array.from({ length: 10_001 }, (_, index) => shape(`shape-${index}`));
    expect(() => parseKumoDocument(JSON.stringify({
      format: "kumo-document", schemaVersion: 4, shapes: tooMany,
    }))).toThrow("too many objects");

    let nested = shape("leaf");
    for (let depth = 0; depth < 34; depth += 1) {
      nested = shape(`nested-${depth}`, "boolean", { booleanChildren: [nested] });
    }
    expect(() => parseKumoDocument(JSON.stringify({
      format: "kumo-document", schemaVersion: 4, shapes: [nested],
    }))).toThrow("nested too deeply");
  });

  it("emits a raster-backed multi-page PDF for top-level frames", async () => {
    const first = shape("one", "frame");
    const second = shape("two", "frame", { x1: 200, x2: 300, zIndex: 2 });
    const overflow = shape("overflow", "rectangle", { parentId: first.id, x1: 90, x2: 260 });
    const rasterize = vi.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const output = new TextDecoder().decode(await serializePdf([first, second, overflow], "#fff", rasterize));
    expect(output.startsWith("%PDF-1.4")).toBe(true);
    expect(output).toContain("/Count 2");
    expect(output).toContain("/Subtype /Image");
    expect(rasterize).toHaveBeenCalledTimes(2);
    expect(rasterize.mock.calls[0]?.[0]).toContain('width="100" height="50" viewBox="0 0 100 50"');
    expect(rasterize.mock.calls[0]?.slice(1)).toEqual([100, 50]);
  });

  it("embeds remote image data before portable raster export", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(["image"], { type: "image/png" }) });
    const embedded = await embedSvgImages('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://assets.example/image.png"/></svg>', fetcher);
    expect(embedded).toContain("data:image/png;base64,");
    expect(embedded).not.toContain("https://assets.example");
    await expect(embedSvgImages('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,aQ=="/></svg>', fetcher)).resolves.toContain("data:image/png");
    await expect(embedSvgImages('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://assets.example/missing.png"/></svg>', vi.fn().mockResolvedValue({ ok: false, status: 404 }))).rejects.toThrow("404");
  });

  it("skips local image references, supports xlink, and serializes SVG assets with defaults", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(["asset"]) });
    await expect(embedSvgImages("<svg/>", fetcher)).resolves.toBe("<svg/>");
    const embedded = await embedSvgImages('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image/><image href="blob:local"/><image xlink:href="https://assets.example/x.png"/></svg>', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(embedded).toContain("data:application/octet-stream;base64,");
    await expect(serializeSvgWithAssets([shape("one")])).resolves.toContain("<svg");
  });

  it("downloads generated blobs and revokes their object URLs", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    downloadBlob(new Blob(["document"]), "board.svg");
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
    vi.useRealTimers();
  });

  it("rasterizes SVG output through a scaled canvas", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:svg");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 100;
      naturalHeight = 50;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", LoadedImage);
    const context = { scale: vi.fn(), drawImage: vi.fn() };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    await expect(svgToPng("<svg/>", 3)).resolves.toMatchObject({ type: "image/png" });
    expect(context.scale).toHaveBeenCalledWith(3, 3);
    expect(createObjectURL).toHaveBeenCalled();
    getContext.mockRestore();
    toBlob.mockRestore();
    vi.unstubAllGlobals();
  });

  it("rasterizes the default PDF path through JPEG canvas output", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf-svg");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", LoadedImage);
    const context = { fillStyle: "", fillRect: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" })));
    const output = new TextDecoder().decode(await serializePdf([shape("page", "frame")]));
    expect(output).toContain("/DCTDecode");
    expect(context.fillRect).toHaveBeenCalled();
    getContext.mockRestore();
    toBlob.mockRestore();
    vi.unstubAllGlobals();
  });

  it("exports a whole-document PDF when there are no frames or exportable bounds", async () => {
    const rasterize = vi.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const output = new TextDecoder().decode(await serializePdf([shape("rectangle")], undefined, rasterize));
    expect(output).toContain("/Count 1");
    expect(rasterize).toHaveBeenCalledWith(expect.stringContaining("<svg"), 100, 50);
    await serializePdf([shape("resource", "resource", { hidden: true })], "#fff", rasterize);
    expect(rasterize).toHaveBeenLastCalledWith(expect.stringContaining("<svg"), 800, 600);
    await serializePdf([shape("frame", "frame", { backgroundColor: undefined })], "#123", rasterize);
    expect(rasterize).toHaveBeenLastCalledWith(expect.stringContaining('fill="#123"'), 100, 50);
  });

  it("reports image loading, canvas, and blob failures", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:error");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    class FailedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal("Image", FailedImage);
    await expect(svgToPng("<svg/>")).rejects.toThrow("could not be rasterized");

    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 10;
      naturalHeight = 10;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", LoadedImage);
    const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(svgToPng("<svg/>")).rejects.toThrow("Canvas export is unavailable");
    await expect(serializePdf([shape("frame", "frame")])).rejects.toThrow("Canvas export is unavailable");
    contextSpy.mockReturnValue({ fillStyle: "", fillRect: vi.fn(), scale: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const blobSpy = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    await expect(svgToPng("<svg/>")).rejects.toThrow("PNG export failed");
    await expect(serializePdf([shape("frame", "frame")])).rejects.toThrow("PDF rasterization failed");
    blobSpy.mockRestore();
    contextSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
