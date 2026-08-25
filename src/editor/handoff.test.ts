import type { Shape } from "../classes/shape";
import { compareFrames, componentPlayground, designTokenExport, downloadableAssets, inspectTokens, shapeCss, shapeJson, shapeReact, shapeStory, shapeSwiftUI, variableAliasTrace } from "./handoff";

const shape: Shape = {
  id: "text", type: "text", name: "Hero title", text: "Build <together>",
  x1: 10, y1: 20, x2: 210, y2: 80, width: 200, height: 60, level: 0, zIndex: 1,
  backgroundColor: "#252629", color: "#f4f1eb", borderColor: "#b87a2e", borderWidth: 1,
  fontFamily: "Helvetica Neue", fontSize: 32, fontWeight: "600", lineHeight: 1.1,
  variableBindings: { color: "variable" },
};

describe("developer handoff", () => {
  it("generates copyable CSS with geometry and visual properties", () => {
    expect(shapeCss(shape)).toContain("left: 10px");
    expect(shapeCss(shape)).toContain("font-family: 'Helvetica Neue'");
  });

  it("generates safe React markup and enumerates tokens", () => {
    expect(shapeReact(shape)).toContain("function HeroTitle");
    expect(shapeReact(shape)).toContain("Build &lt;together&gt;");
    expect(inspectTokens(shape)).toMatchObject({ colors: ["#252629", "#f4f1eb", "#b87a2e"], variables: [{ property: "color", id: "variable" }] });
  });

  it("generates valid component identifiers and escapes JSX expressions", () => {
    const output = shapeReact({ ...shape, name: "123 card", text: "Hello {danger}" });
    expect(output).toContain("function Layer123Card");
    expect(output).toContain("Hello &#123;danger&#125;");
  });

  it("generates SwiftUI and structured handoff JSON with accessibility and readiness", () => {
    const ready = { ...shape, semanticRole: "heading" as const, altText: "Hero", focusOrder: 1, devStatus: "ready" as const };
    expect(shapeSwiftUI(ready)).toContain("Text(\"Build <together>\")");
    expect(shapeSwiftUI(ready)).toContain(".frame(width: 200, height: 60)");
    expect(JSON.parse(shapeJson(ready))).toMatchObject({
      id: "text", status: "ready", accessibility: { role: "heading", altText: "Hero", focusOrder: 1 },
    });
  });

  it("generates Storybook metadata and portable design-token JSON", () => {
    expect(shapeStory(shape)).toContain("export const Default");
    const tokens = JSON.parse(designTokenExport({ ...shape, assetId: "asset", fillStyleId: "fill" }));
    expect(tokens.color["layer-1"]).toEqual({ $type: "color", $value: "#252629" });
    expect(tokens.assets).toEqual(expect.objectContaining({ "asset-1": { $type: "asset", $value: "asset" } }));
    expect(tokens.variables.color.$value).toBe("{variable}");
  });

  it("traces variable aliases, including safe detection of circular references", () => {
    const primary = { ...shape, id: "primary", type: "resource" as const, resourceName: "Primary", variableAliasId: "secondary" };
    const secondary = { ...shape, id: "secondary", type: "resource" as const, resourceName: "Secondary", variableAliasId: "primary" };
    expect(variableAliasTrace([primary, secondary], { ...shape, variableBindings: { color: "primary" } })).toEqual([
      { property: "color", id: "primary", chain: ["Primary", "Secondary"], circular: true },
    ]);
  });

  it("builds component playground controls from definitions, variants, and overrides", () => {
    const definition = { ...shape, id: "definition", type: "frame" as const, componentDefinition: true, componentSetId: "set", componentProperties: { label: { type: "text" as const, label: "Label", defaultValue: "Default" } } };
    const hover = { ...definition, id: "hover", name: "Hover" };
    const instance = { ...shape, id: "instance", type: "frame" as const, instanceOf: "definition", instanceProperties: { label: "Changed" } };
    expect(componentPlayground([definition, hover, instance], instance)).toEqual(expect.objectContaining({
      definition, variants: [definition, hover], properties: [expect.objectContaining({ id: "label", currentValue: "Changed" })],
    }));
    expect(componentPlayground([shape], shape)).toBeNull();
  });

  it("compares frame layout values and enumerates all downloadable asset sources", () => {
    const comparison = compareFrames({ ...shape, width: 200, height: 60, backgroundColor: "#000000", paddingTop: 0 }, { ...shape, x2: 250, y2: 100, width: 240, height: 80, backgroundColor: "#ffffff", paddingTop: 12 });
    expect(comparison.size).toEqual({ width: 40, height: 20 });
    expect(comparison.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "backgroundColor" }), expect.objectContaining({ field: "paddingTop" })]));
    expect(downloadableAssets({ ...shape, backgroundImage: "https://assets.test/background.png", embedImageUrl: "https://assets.test/embed.png", fills: [{ id: "image", type: "image", visible: true, opacity: 1, imageUrl: "https://assets.test/fill.png" }] })).toEqual([
      { label: "Hero title", url: "https://assets.test/background.png" },
      { label: "Hero title preview", url: "https://assets.test/embed.png" },
      { label: "Hero title fill", url: "https://assets.test/fill.png" },
    ]);
  });

  it("serializes sparse and stroke-driven CSS without inventing optional declarations", () => {
    const sparse = { ...shape, name: "Plain", fontFamily: "Inter", fontSize: 0, letterSpacing: 0, rotation: 0, blendMode: "normal" as const,
      backgroundColor: undefined, color: undefined, borderColor: undefined, borderWidth: undefined, borderStyle: undefined,
      borderRadius: undefined, opacity: undefined, strokes: [
        { id: "hidden", color: "#000", width: 1, opacity: 1, align: "center" as const, style: "solid" as const, visible: false },
        { id: "zero", color: "#000", width: 0, opacity: 1, align: "center" as const, style: "solid" as const, visible: true },
        { id: "stroke", color: "#123456", width: 2, opacity: 1, align: "center" as const, style: "dashed" as const, visible: true },
      ] };
    const css = shapeCss(sparse);
    expect(css).toContain("font-family: Inter");
    expect(css).toContain("border: 2px dashed #123456");
    expect(css).not.toContain("font-size:");
    expect(shapeCss({ ...sparse, letterSpacing: 2, rotation: 15 })).toContain("letter-spacing: 2px");
    expect(shapeCss({ ...sparse, letterSpacing: 2, rotation: 15 })).toContain("rotate(15deg)");

    const defaultBorder = shapeCss({ ...sparse, strokes: undefined, fontFamily: undefined });
    expect(defaultBorder).toContain("border: 0px solid transparent");
  });

  it("covers React, SwiftUI, JSON, and Storybook naming fallbacks", () => {
    const unnamed = { ...shape, name: undefined, type: "rectangle" as const, text: undefined, color: undefined, backgroundColor: undefined };
    expect(shapeReact(unnamed)).toContain("function Rectangle");
    expect(shapeReact({ ...shape, name: "!!!", text: undefined })).toContain("function KumoLayer");
    expect(shapeReact({ ...shape, type: "board", name: undefined, title: undefined })).toContain("Open board");
    expect(shapeReact({ ...shape, type: "board", title: "Open <board>" })).toContain("Open &lt;board&gt;");
    expect(shapeReact({ ...shape, type: "rectangle" })).toContain("></div>");
    expect(shapeSwiftUI(unnamed)).toContain("Rectangle()");
    expect(shapeSwiftUI(unnamed)).toContain('Color(hex: "#000000")');
    expect(shapeSwiftUI({ ...unnamed, backgroundColor: "#ffffff" })).toContain('Color(hex: "#ffffff")');
    expect(shapeSwiftUI({ ...shape, text: undefined })).toContain('Text("")');
    expect(JSON.parse(shapeJson(unnamed))).toMatchObject({ name: "rectangle", status: "designing", accessibility: { role: "none", altText: null, focusOrder: null } });
    expect(shapeStory({ ...shape, name: "!!!" })).toContain("KumoLayer");
    expect(shapeStory({ ...shape, name: undefined })).toContain("Text");
  });

  it("extracts every token source and supports empty token sets", () => {
    const tokenShape = { ...shape,
      gradientStops: [{ id: "gradient", position: 0, color: "#111111", opacity: 1 }],
      fills: [{ id: "fill", type: "linear-gradient" as const, visible: true, opacity: 1, gradientStops: [{ id: "nested", position: 1, color: "#222222", opacity: 1 }] }],
      strokes: [{ id: "stroke", color: "#333333", width: 1, opacity: 1, align: "center" as const, style: "solid" as const, visible: true }],
      textRuns: [], textStyleId: "text-style", effectStyleId: "effect-style",
    };
    expect(inspectTokens(tokenShape).colors).toEqual(expect.arrayContaining(["#111111", "#222222", "#333333"]));
    expect(inspectTokens({ ...shape, fills: [{ id: "solid", type: "solid", color: "#444444", visible: true, opacity: 1 }] }).colors).toContain("#444444");
    expect(inspectTokens({ ...shape, fontWeight: undefined, fontSize: undefined, lineHeight: undefined, fontFamily: undefined }).typography)
      .toBe("normal 18px/1.2 Arial");
    const empty = { ...shape, type: "rectangle" as const, backgroundColor: undefined, color: undefined, borderColor: undefined,
      gradientStops: undefined, fills: undefined, strokes: undefined, assetId: undefined, fillStyleId: undefined, textStyleId: undefined, effectStyleId: undefined, variableBindings: undefined };
    expect(inspectTokens(empty)).toEqual({ colors: [], typography: null, assets: [], variables: [] });
    expect(JSON.parse(designTokenExport(empty))).toMatchObject({ color: {}, typography: {}, assets: {}, variables: {} });
  });

  it("traces missing and terminal aliases and builds definition playground defaults", () => {
    expect(variableAliasTrace([], { ...shape, variableBindings: undefined })).toEqual([]);
    expect(variableAliasTrace([], { ...shape, variableBindings: { color: "missing" } })).toEqual([
      { property: "color", id: "missing", chain: [], circular: false },
    ]);
    const terminal = { ...shape, id: "terminal", type: "resource" as const, resourceName: undefined, variableAliasId: undefined };
    expect(variableAliasTrace([terminal], { ...shape, variableBindings: { color: "terminal" } })[0]).toEqual({
      property: "color", id: "terminal", chain: ["terminal"], circular: false,
    });

    const definition = { ...shape, id: "definition", type: "frame" as const, componentDefinition: true, componentSetId: undefined,
      componentProperties: { label: { type: "text" as const, label: "Label", defaultValue: "Default" } }, instanceProperties: undefined };
    expect(componentPlayground([definition], definition)).toEqual(expect.objectContaining({
      definition, variants: [definition], properties: [expect.objectContaining({ currentValue: "Default" })],
    }));
    expect(componentPlayground([{ ...definition, componentProperties: undefined }], { ...definition, componentProperties: undefined })?.properties).toEqual([]);
  });

  it("returns empty and fallback-named downloadable asset lists", () => {
    expect(downloadableAssets({ ...shape, name: undefined, backgroundImage: "background", embedImageUrl: "preview", fills: [
      { id: "missing", type: "image", visible: true, opacity: 1 },
      { id: "solid", type: "solid", visible: true, opacity: 1, color: "#fff" },
      { id: "image", type: "image", visible: true, opacity: 1, imageUrl: "fill" },
    ] })).toEqual([
      { label: "Layer image", url: "background" },
      { label: "Layer preview", url: "preview" },
      { label: "Layer fill", url: "fill" },
    ]);
    expect(downloadableAssets({ ...shape, backgroundImage: undefined, embedImageUrl: undefined, fills: undefined })).toEqual([]);
  });
});
