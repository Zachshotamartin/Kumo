import { render, screen } from "@testing-library/react";
import type { Shape } from "../../classes/shape";
import { AdvancedShapeContent } from "./AdvancedShapeContent";

const shape = (type: Shape["type"], patch: Partial<Shape> = {}): Shape => ({
  id: `shape-${type}`, type, name: type, x1: 0, y1: 0, x2: 180, y2: 100,
  width: 180, height: 100, level: 0, zIndex: 1, parentId: null, ...patch,
});

describe("advanced canvas shape rendering", () => {
  it.each([
    ["arrow", "arrow"], ["circle", "circle"], ["diamond", "diamond"],
  ] as const)("renders a labeled connector with %s endpoint markers", (startCap, endCap) => {
    const connector = shape("connector", {
      id: `connector-${startCap}`,
      connectorLabel: "Approval path",
      connectorStartCap: startCap,
      connectorEndCap: endCap,
      connectorRouting: "orthogonal",
      connectorStart: { x: 0, y: 0, anchor: "auto" },
      connectorEnd: { x: 180, y: 100, anchor: "auto" },
      borderColor: "#b87a2e",
      borderWidth: 4,
      strokeDash: [4, 2],
    });
    const { container } = render(<AdvancedShapeContent shape={connector} shapes={[connector]} zoom={2} />);
    expect(screen.getByLabelText("Approval path")).toBeVisible();
    expect(container.querySelector("path[marker-start]")).toHaveAttribute("stroke-width", "4");
    expect(container.querySelector("marker[id^='start-']")).toBeInTheDocument();
    expect(screen.getByText("Approval path")).toBeVisible();
  });

  it("expands the connector viewport around obstacle-avoiding detours", () => {
    const obstacle = shape("rectangle", { id: "obstacle", x1: 70, x2: 110, y1: -30, y2: 130, width: 40, height: 160 });
    const connector = shape("connector", {
      id: "detour", x1: 0, y1: 50, x2: 180, y2: 50, width: 180, height: 0,
      connectorRouting: "orthogonal", connectorAvoidObstacles: true,
      connectorStart: { x: 0, y: 50, anchor: "auto" }, connectorEnd: { x: 180, y: 50, anchor: "auto" },
    });
    const { container } = render(<AdvancedShapeContent shape={connector} shapes={[obstacle, connector]} zoom={1} />);
    const viewBox = container.querySelector("svg")?.getAttribute("viewBox")?.split(" ").map(Number) ?? [];
    expect(viewBox[3]).toBeGreaterThan(100);
  });

  it("renders sticky notes, tables, code, and rich links as semantic content", () => {
    const { rerender } = render(<AdvancedShapeContent shape={shape("sticky", { text: "Vote here" })} shapes={[]} zoom={1} />);
    expect(screen.getByText("Vote here")).toBeVisible();
    rerender(<AdvancedShapeContent shape={shape("table", { columns: 2, rows: 2, tableCells: [["Name", "Status"], ["Kumo", "Ready"]] })} shapes={[]} zoom={1} />);
    expect(screen.getByRole("table")).toHaveTextContent("NameStatusKumoReady");
    expect(screen.getAllByRole("cell")).toHaveLength(4);
    rerender(<AdvancedShapeContent shape={shape("code", { codeLanguage: "typescript", text: "const ready = true;" })} shapes={[]} zoom={1} />);
    expect(screen.getByText("typescript")).toBeVisible();
    expect(screen.getByText("const ready = true;")).toBeVisible();
    rerender(<AdvancedShapeContent shape={shape("link", { embedTitle: "Kumo docs", embedDescription: "Product guide", embedImageUrl: "https://assets.test/preview.png" })} shapes={[]} zoom={1} />);
    expect(screen.getByText("Kumo docs")).toBeVisible();
    expect(screen.getByText("Product guide")).toBeVisible();
    expect(document.querySelector("img")).toHaveAttribute("src", "https://assets.test/preview.png");
  });

  it("renders accessible, configurable video media and otherwise yields no overlay", () => {
    const video = shape("image", { mediaType: "video", backgroundImage: "https://assets.test/demo.mp4", mediaAutoplay: true, mediaLoop: true, mediaMuted: false });
    const { container, rerender } = render(<AdvancedShapeContent shape={video} shapes={[]} zoom={1} />);
    const element = container.querySelector("video");
    expect(element).toHaveAttribute("src", "https://assets.test/demo.mp4");
    expect(element).toHaveAttribute("autoplay");
    expect(element).toHaveAttribute("loop");
    expect(element).not.toHaveAttribute("muted");
    expect(element?.querySelector("track")).toHaveAttribute("kind", "captions");
    rerender(<AdvancedShapeContent shape={shape("rectangle")} shapes={[]} zoom={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders connector and content defaults", () => {
    const connector = shape("connector", {
      id: "connector invalid/id",
      x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0,
      connectorStartCap: "unknown" as Shape["connectorStartCap"],
      connectorEndCap: "none",
      connectorStart: { x: 0, y: 0, anchor: "auto" },
      connectorEnd: { x: 0, y: 0, anchor: "auto" },
      borderColor: undefined,
      borderWidth: undefined,
      opacity: undefined,
    });
    const view = render(<AdvancedShapeContent shape={connector} shapes={[connector]} zoom={1} />);
    expect(screen.getByLabelText("Connector")).toBeVisible();
    expect(view.container.querySelector("path[marker-start]")).toHaveAttribute("stroke", "#d9d9d9");
    expect(view.container.querySelector("path[marker-start]")).toHaveAttribute("stroke-width", "2");

    view.rerender(<AdvancedShapeContent shape={shape("sticky", { text: "" })} shapes={[]} zoom={1} />);
    expect(screen.getByText("Write an idea")).toBeVisible();
    view.rerender(<AdvancedShapeContent shape={shape("table", { rows: undefined, columns: undefined, tableCells: undefined })} shapes={[]} zoom={1} />);
    expect(screen.getAllByRole("cell")).toHaveLength(9);
    view.rerender(<AdvancedShapeContent shape={shape("table", { tableCells: [] })} shapes={[]} zoom={1} />);
    expect(screen.getByRole("table")).toHaveStyle({ gridTemplateColumns: "repeat(1, minmax(0, 1fr))" });
    view.rerender(<AdvancedShapeContent shape={shape("code", { codeLanguage: undefined, text: undefined })} shapes={[]} zoom={1} />);
    expect(screen.getByText("plain text")).toBeVisible();
  });

  it("renders link and video fallback sources", () => {
    const view = render(<AdvancedShapeContent shape={shape("link", { embedTitle: "", embedDescription: "", embedUrl: "https://kumo.test" })} shapes={[]} zoom={1} />);
    expect(screen.getByText("Link preview")).toBeVisible();
    expect(screen.getByText("https://kumo.test")).toBeVisible();
    expect(view.container.querySelector("img")).toBeNull();
    view.rerender(<AdvancedShapeContent shape={shape("link", { embedTitle: "", embedDescription: "", embedUrl: "" })} shapes={[]} zoom={1} />);
    expect(screen.getByText("Paste a link")).toBeVisible();
    view.rerender(<AdvancedShapeContent shape={shape("image", { mediaType: "video", backgroundImage: "", embedUrl: "https://assets.test/embed.mp4", mediaMuted: undefined })} shapes={[]} zoom={1} />);
    expect(view.container.querySelector("video")).toHaveAttribute("src", "https://assets.test/embed.mp4");
    expect((view.container.querySelector("video") as HTMLVideoElement).muted).toBe(true);
    view.rerender(<AdvancedShapeContent shape={shape("image", { mediaType: "video", backgroundImage: "", embedUrl: "" })} shapes={[]} zoom={1} />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
