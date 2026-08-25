import type { Shape } from "../classes/shape";
import { designTokenExport, inspectTokens, shapeCss, shapeJson, shapeReact, shapeStory, shapeSwiftUI } from "./handoff";

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
});
