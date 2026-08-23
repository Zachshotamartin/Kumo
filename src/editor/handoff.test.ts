import type { Shape } from "../classes/shape";
import { inspectTokens, shapeCss, shapeReact } from "./handoff";

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
});
