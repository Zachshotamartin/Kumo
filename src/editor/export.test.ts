import type { Shape } from "../classes/shape";
import { downloadBlob, embedSvgImages, parseKumoDocument, serializeKumoDocument, serializePdf, serializeSvg, svgToPng } from "./export";

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

  it("serializes clipping, images, text layout, every boolean mode, and secondary paint branches", () => {
    const frame = shape("frame", "frame", { clipContent: true, borderStyle: "dashed" });
    const ellipse = shape("ellipse", "ellipse", {
      parentId: frame.id,
      flipX: true,
      fillType: "radial-gradient",
      gradientStops: [{ id: "a", position: -1, color: "#fff", opacity: 2 }, { id: "b", position: 2, color: "#000", opacity: -1 }],
      backgroundImage: "data:image/png;base64,aW1hZ2U=",
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
    expect(svg).toContain("boolean-subtract");
    expect(svg).toContain("boolean-clip-0");
    expect(svg).toContain("fill-rule=\"nonzero\"");
    expect(svg).toContain("fill-rule=\"evenodd\"");
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

  it("rejects malformed imports", () => {
    expect(() => parseKumoDocument("{}" )).toThrow("not a Kumo document");
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", schemaVersion: 4, shapes: [null] }))).toThrow("Object 1 is invalid");
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", schemaVersion: 3, shapes: [] }))).toThrow("schema 3");
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
});
