import type { Shape } from "../classes/shape";
import { downloadBlob, parseKumoDocument, serializeKumoDocument, serializePdf, serializeSvg, svgToPng } from "./export";

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
    const child = shape("child", "text", { parentId: frame.id, text: "Nested" });
    expect(serializeSvg([frame, child], [frame.id])).toContain("Nested");
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

  it("rejects malformed imports", () => {
    expect(() => parseKumoDocument("{}" )).toThrow("not a Kumo document");
    expect(() => parseKumoDocument(JSON.stringify({ format: "kumo-document", shapes: [null] }))).toThrow("Object 1 is invalid");
  });

  it("emits a multi-page PDF for top-level frames", () => {
    const first = shape("one", "frame");
    const second = shape("two", "frame", { x1: 200, x2: 300, zIndex: 2 });
    const output = new TextDecoder().decode(serializePdf([first, second]));
    expect(output.startsWith("%PDF-1.4")).toBe(true);
    expect(output).toContain("/Count 2");
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
});
