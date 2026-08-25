import { fireEvent, render, screen } from "@testing-library/react";
import type { Shape } from "../../classes/shape";
import { MARKETING_STATUS_SHAPE_ID } from "./marketingCanvasModel";
import MarketingCanvas, {
  isFlowShape,
  marketingValue,
  responsiveFontSize,
  textTagForShape,
  textTransform,
} from "./MarketingCanvas";

vi.mock("../brand/KumoLogo", () => ({
  default: ({ label, context }: { label: string; context: string }) => (
    <div aria-label={label} data-context={context} />
  ),
}));

const rect = (width = 1000, height = 1000) => ({
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: width,
  bottom: height,
  width,
  height,
  toJSON: () => ({}),
});

const addPointerCapture = (element: HTMLElement) => {
  Object.defineProperties(element, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
  });
};

describe("MarketingCanvas", () => {
  it("maps modeled text semantics, responsive type, flow roles, and nullish values", () => {
    const shape = (id: string, extra: Partial<Shape> = {}) => ({ id, fontSize: 20, ...extra }) as Shape;
    expect(marketingValue("set", "fallback")).toBe("set");
    expect(marketingValue(null, "fallback")).toBe("fallback");
    expect(marketingValue(undefined, "fallback")).toBe("fallback");
    expect(textTransform(shape("one", { textCase: "upper" }))).toBe("uppercase");
    expect(textTransform(shape("one", { textCase: "lower" }))).toBe("lowercase");
    expect(textTransform(shape("one", { textCase: "title" }))).toBe("capitalize");
    expect(textTransform(shape("one"))).toBe("none");
    expect(textTagForShape(shape("marketing-headline"))).toBe("h1");
    expect(textTagForShape(shape("marketing-eyebrow"))).toBe("p");
    expect(textTagForShape(shape("marketing-copy"))).toBe("p");
    expect(textTagForShape(shape("other"))).toBe("span");
    expect(responsiveFontSize(shape("marketing-brand"))).toContain("clamp(18px");
    expect(responsiveFontSize(shape("marketing-descriptor"))).toContain("clamp(9px");
    expect(responsiveFontSize(shape("marketing-explore"))).toContain("clamp(8px");
    expect(responsiveFontSize(shape(MARKETING_STATUS_SHAPE_ID))).toContain("clamp(9px");
    expect(responsiveFontSize(shape("marketing-eyebrow"))).toContain("clamp(9px");
    expect(responsiveFontSize(shape("marketing-headline"))).toContain("clamp(52px");
    expect(responsiveFontSize(shape("marketing-copy"))).toContain("clamp(15px");
    expect(responsiveFontSize(shape("other", { fontSize: undefined }))).toBe("1.2cqi");
    expect(isFlowShape(shape("marketing-explore"))).toBe(true);
    expect(isFlowShape(shape("marketing-shape"))).toBe(true);
    expect(isFlowShape(shape("marketing-build"))).toBe(true);
    expect(isFlowShape(shape("other"))).toBe(false);
  });

  it("renders the brand copy as layered Kumo model objects with accessible tools", () => {
    const { container } = render(
      <MarketingCanvas logoContext="idle" logoStatus="Ready when the idea is." />
    );

    const headline = screen.getByRole("heading", { name: "Every board can lead somewhere." });
    const headlineObject = headline.closest("[data-model-type='text']");
    expect(headlineObject).toHaveAttribute("data-shape-id", "marketing-headline");
    expect(Number(headlineObject?.getAttribute("data-shape-z"))).toBeGreaterThan(100);
    expect(container.querySelectorAll("[data-model-type='text']")).toHaveLength(9);
    expect(container.querySelector("[data-layer='drawings']")).toBeInTheDocument();
    expect(container.querySelector("[data-layer='marketing-objects']")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Landing canvas tools" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reset canvas" })).toBeEnabled();
  });

  it("draws modeled geometry, supports keyboard stamping, undo, clear, and reset", () => {
    const { container } = render(
      <MarketingCanvas logoContext="idle" logoStatus="Ready when the idea is." />
    );
    const surface = screen.getByRole("button", { name: /Kumo sketch canvas/i });
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(1000, 500),
    });
    addPointerCapture(surface);

    fireEvent.click(screen.getByRole("button", { name: "Rectangle (R)" }));
    fireEvent.pointerDown(surface, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: 300, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 7, clientX: 300, clientY: 250 });

    const rectangle = container.querySelector("[data-shape-type='rectangle']");
    expect(rectangle).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "20%",
      height: "30%",
      backgroundColor: "#f4f2ed",
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo drawing" }));
    expect(container.querySelector("[data-shape-type='rectangle']")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ellipse (O)" }));
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(container.querySelector("[data-shape-type='ellipse']")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear drawings" }));
    expect(container.querySelector("[data-shape-type='ellipse']")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pen (P)" }));
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(container.querySelector("[data-shape-type='vector'] path")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset canvas" }));
    expect(container.querySelector("[data-shape-type='vector']")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select (V)" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("moves and edits text objects, then restores their modeled state", () => {
    render(<MarketingCanvas logoContext="idle" logoStatus="Ready when the idea is." />);
    const headline = screen.getByRole("heading", { name: "Every board can lead somewhere." });
    const headlineObject = headline.closest("[data-shape-id='marketing-headline']") as HTMLDivElement;
    const canvas = headlineObject.parentElement?.parentElement as HTMLDivElement;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(),
    });
    addPointerCapture(headlineObject);

    fireEvent.pointerDown(headlineObject, { pointerId: 9, button: 0, clientX: 100, clientY: 100 });
    expect(headlineObject.querySelector("[data-selection-highlight='true']")).toBeInTheDocument();
    fireEvent.pointerMove(headlineObject, { pointerId: 9, clientX: 200, clientY: 140 });
    fireEvent.pointerUp(headlineObject, { pointerId: 9, clientX: 200, clientY: 140 });
    expect(headlineObject).toHaveAttribute("data-shape-x", "160");
    expect(headlineObject).toHaveAttribute("data-shape-y", "784");

    fireEvent.doubleClick(headlineObject);
    const editor = screen.getByRole("textbox", { name: "Edit text" });
    expect(editor).toHaveValue("Every board can lead somewhere.");
    fireEvent.change(editor, { target: { value: "Move ideas into view." } });
    fireEvent.blur(editor);
    expect(screen.getByRole("heading", { name: "Move ideas into view." })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reset canvas" }));
    const restored = screen.getByRole("heading", { name: "Every board can lead somewhere." });
    expect(restored.closest("[data-shape-id='marketing-headline']"))
      .toHaveAttribute("data-shape-x", "60");
  });

  it("keeps live authentication status in the modeled status object", () => {
    const { rerender } = render(
      <MarketingCanvas logoContext="idle" logoStatus="Ready when the idea is." />
    );
    expect(screen.getByText("Ready when the idea is.")).toBeVisible();

    rerender(<MarketingCanvas logoContext="loading" logoStatus="Opening your workspace" />);
    expect(screen.getByText("Opening your workspace")).toBeVisible();
    expect(screen.getByLabelText("Animated Kumo mascot")).toHaveAttribute("data-context", "loading");
  });

  it("preserves both vector slopes through the shared pen geometry", () => {
    const { container } = render(
      <MarketingCanvas logoContext="idle" logoStatus="Ready when the idea is." />
    );
    const surface = screen.getByRole("button", { name: /Kumo sketch canvas/i });
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(),
    });
    addPointerCapture(surface);
    fireEvent.click(screen.getByRole("button", { name: "Pen (P)" }));

    fireEvent.pointerDown(surface, { pointerId: 21, button: 0, clientX: 100, clientY: 300 });
    fireEvent.pointerMove(surface, { pointerId: 21, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 21, clientX: 300, clientY: 100 });
    fireEvent.pointerDown(surface, { pointerId: 22, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 22, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(surface, { pointerId: 22, clientX: 300, clientY: 300 });

    expect(Array.from(container.querySelectorAll("[data-shape-type='vector'] path[stroke]"))
      .map((path) => path.getAttribute("d")))
      .toEqual(["M 0 200 L 200 0", "M 0 0 L 200 200"]);
  });

  it("selects, highlights, moves, nudges, and removes drawn model shapes", () => {
    const { container } = render(
      <MarketingCanvas logoContext="idle" logoStatus="Ready when the idea is." />
    );
    const canvas = container.firstElementChild as HTMLDivElement;
    const surface = screen.getByRole("button", { name: /Kumo sketch canvas/i });
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(),
    });
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => rect(),
    });
    addPointerCapture(surface);

    fireEvent.click(screen.getByRole("button", { name: "Rectangle (R)" }));
    fireEvent.pointerDown(surface, { pointerId: 31, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 31, clientX: 300, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 31, clientX: 300, clientY: 250 });
    fireEvent.click(screen.getByRole("button", { name: "Select (V)" }));

    const rectangle = screen.getByRole("button", { name: /Rectangle\. Drag to move/i });
    addPointerCapture(rectangle);
    fireEvent.pointerDown(rectangle, { pointerId: 32, button: 0, clientX: 100, clientY: 100 });
    expect(rectangle.querySelector("[data-selection-highlight='true']")).toBeInTheDocument();
    fireEvent.pointerMove(rectangle, { pointerId: 32, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(rectangle, { pointerId: 32, clientX: 200, clientY: 150 });
    expect(rectangle).toHaveStyle({ left: "20%", top: "15%" });

    fireEvent.keyDown(rectangle, { key: "ArrowRight" });
    expect(Number.parseFloat(rectangle.style.left)).toBeCloseTo(20.2);
    fireEvent.keyDown(rectangle, { key: "Delete" });
    expect(screen.queryByRole("button", { name: /Rectangle\. Drag to move/i }))
      .not.toBeInTheDocument();
  });

  it("covers drawing previews, cancellation, pointer mismatches, shortcuts, and capture fallbacks", () => {
    const { container } = render(<MarketingCanvas logoContext="idle" logoStatus="Ready" />);
    const surface = screen.getByRole("button", { name: /Kumo sketch canvas/i });
    Object.defineProperty(surface, "getBoundingClientRect", { configurable: true, value: () => rect() });
    addPointerCapture(surface);

    fireEvent.pointerMove(surface, { pointerId: 90, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 90, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(surface, { pointerId: 91, button: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(surface, { pointerId: 92, button: 0, clientX: 10, clientY: 10 });
    expect(container.querySelectorAll("[data-layer='drawings'] > div")).toHaveLength(0);

    fireEvent.keyDown(surface, { key: "r" });
    fireEvent.pointerDown(surface, { pointerId: 93, button: 0, clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerMove(surface, { pointerId: 94, clientX: 100, clientY: 250, shiftKey: true });
    fireEvent.pointerMove(surface, { pointerId: 93, clientX: 100, clientY: 250, shiftKey: true });
    const previewRect = container.querySelector("svg rect")!;
    expect(previewRect).toHaveAttribute("data-visible", "true");
    expect(previewRect).toHaveAttribute("width", "150");
    fireEvent.pointerCancel(surface, { pointerId: 93, clientX: 100, clientY: 250 });
    expect(previewRect).not.toHaveAttribute("data-visible");
    expect(container.querySelector("[data-shape-type='rectangle']")).not.toBeInTheDocument();

    fireEvent.pointerDown(surface, { pointerId: 95, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 95, clientX: 102, clientY: 102 });
    fireEvent.pointerUp(surface, { pointerId: 95, clientX: 102, clientY: 102 });
    expect(container.querySelector("[data-shape-type='rectangle']")).not.toBeInTheDocument();

    fireEvent.pointerDown(surface, { pointerId: 96, button: 0, clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Select (V)" }));
    fireEvent.pointerMove(surface, { pointerId: 96, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(surface, { pointerId: 96, clientX: 300, clientY: 300 });
    fireEvent.keyDown(surface, { key: "Enter" });

    fireEvent.keyDown(surface, { key: "o" });
    fireEvent.pointerDown(surface, { pointerId: 97, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(surface, { pointerId: 97, clientX: 250, clientY: 150 });
    expect(container.querySelector("svg ellipse")).toHaveAttribute("data-visible", "true");
    fireEvent.lostPointerCapture(surface, { pointerId: 97, clientX: 250, clientY: 150 });
    expect(container.querySelector("[data-shape-type='ellipse']")).toBeInTheDocument();

    fireEvent.keyDown(surface, { key: "p" });
    fireEvent.keyDown(surface, { key: "Enter" });
    fireEvent.keyDown(surface, { key: "z", metaKey: true });
    fireEvent.keyDown(surface, { key: "Enter" });
    fireEvent.keyDown(surface, { key: "z", ctrlKey: true });
    fireEvent.keyDown(surface, { key: "x" });

    Object.defineProperties(surface, {
      setPointerCapture: { configurable: true, value: undefined },
      releasePointerCapture: { configurable: true, value: undefined },
      hasPointerCapture: { configurable: true, value: () => false },
    });
    fireEvent.keyDown(surface, { key: "r" });
    fireEvent.pointerDown(surface, { pointerId: 98, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 98, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(surface, { pointerId: 98, clientX: 300, clientY: 300 });
    expect(container.querySelector("[data-shape-type='rectangle']")).toBeInTheDocument();
  });

  it("covers text selection, keyboard movement, editing guards, cancellation, and status overrides", () => {
    const { container, rerender } = render(<MarketingCanvas logoContext="idle" logoStatus="Ready" />);
    const canvas = container.firstElementChild as HTMLDivElement;
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => rect() });
    const headline = container.querySelector("[data-shape-id='marketing-headline']") as HTMLDivElement;
    addPointerCapture(headline);

    fireEvent.pointerMove(headline, { pointerId: 100, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(headline, { pointerId: 100, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(headline, { pointerId: 101, button: 1, clientX: 100, clientY: 100 });
    fireEvent.focus(headline);
    fireEvent.keyDown(headline, { key: "Tab" });
    fireEvent.keyDown(headline, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(headline, { key: "ArrowRight" });
    fireEvent.keyDown(headline, { key: "ArrowUp" });
    fireEvent.keyDown(headline, { key: "ArrowDown" });

    const beforeCancelX = headline.getAttribute("data-shape-x");
    fireEvent.pointerDown(headline, { pointerId: 102, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(headline, { pointerId: 103, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(headline, { pointerId: 102, clientX: 300, clientY: 300 });
    fireEvent.pointerCancel(headline, { pointerId: 102, clientX: 300, clientY: 300 });
    expect(headline).toHaveAttribute("data-shape-x", beforeCancelX);

    fireEvent.keyDown(headline, { key: "F2" });
    expect(screen.getByRole("textbox", { name: "Edit text" })).toBeVisible();
    fireEvent.pointerDown(headline, { pointerId: 104, button: 0, clientX: 100, clientY: 100 });
    fireEvent.keyDown(headline, { key: "Enter" });
    fireEvent.blur(screen.getByRole("textbox", { name: "Edit text" }));

    fireEvent.click(screen.getByRole("button", { name: "Rectangle (R)" }));
    fireEvent.doubleClick(headline);
    expect(screen.queryByRole("textbox", { name: "Edit text" })).not.toBeInTheDocument();
    fireEvent.pointerDown(headline, { pointerId: 105, button: 0, clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Select (V)" }));
    Object.defineProperty(headline, "hasPointerCapture", { configurable: true, value: () => false });
    fireEvent.pointerDown(headline, { pointerId: 106, button: 0, clientX: 100, clientY: 100 });
    fireEvent.lostPointerCapture(headline, { pointerId: 106, clientX: 100, clientY: 100 });

    const status = container.querySelector(`[data-shape-id='${MARKETING_STATUS_SHAPE_ID}']`) as HTMLDivElement;
    fireEvent.keyDown(status, { key: "Enter" });
    const statusEditor = screen.getByRole("textbox", { name: "Edit text" });
    fireEvent.change(statusEditor, { target: { value: "Custom status" } });
    fireEvent.blur(statusEditor);
    rerender(<MarketingCanvas logoContext="loading" logoStatus="Server status" />);
    expect(screen.getByText("Custom status")).toBeVisible();
  });

  it("covers drawn-shape focus, drag cancellation, capture loss, keyboard variants, and selection guards", () => {
    const { container } = render(<MarketingCanvas logoContext="idle" logoStatus="Ready" />);
    const canvas = container.firstElementChild as HTMLDivElement;
    const surface = screen.getByRole("button", { name: /Kumo sketch canvas/i });
    Object.defineProperty(canvas, "getBoundingClientRect", { configurable: true, value: () => rect() });
    fireEvent.click(screen.getByRole("button", { name: "Rectangle (R)" }));
    fireEvent.keyDown(surface, { key: "Enter" });
    fireEvent.keyDown(surface, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Select (V)" }));
    const shapes = screen.getAllByRole("button", { name: /Rectangle\. Drag to move/i });
    const first = shapes[0]!;
    const second = shapes[1]!;
    addPointerCapture(first);
    addPointerCapture(second);

    fireEvent.pointerMove(first, { pointerId: 110, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(first, { pointerId: 110, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(first, { pointerId: 111, button: 1, clientX: 100, clientY: 100 });
    fireEvent.focus(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(first, { key: "Tab" });
    fireEvent.keyDown(first, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(first, { key: "ArrowUp" });
    fireEvent.keyDown(first, { key: "ArrowDown" });

    fireEvent.pointerDown(first, { pointerId: 112, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(first, { pointerId: 113, clientX: 200, clientY: 200 });
    fireEvent.pointerCancel(first, { pointerId: 112, clientX: 200, clientY: 200 });
    fireEvent.pointerDown(first, { pointerId: 114, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(first, { pointerId: 114, clientX: 150, clientY: 150 });
    fireEvent.lostPointerCapture(first, { pointerId: 114, clientX: 150, clientY: 150 });

    fireEvent.click(screen.getByRole("button", { name: "Ellipse (O)" }));
    fireEvent.focus(second);
    fireEvent.pointerDown(second, { pointerId: 115, button: 0, clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Select (V)" }));
    Object.defineProperty(second, "hasPointerCapture", { configurable: true, value: () => false });
    fireEvent.pointerDown(second, { pointerId: 116, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(second, { pointerId: 116, clientX: 100, clientY: 100 });
    fireEvent.keyDown(second, { key: "Backspace" });
    expect(screen.getAllByRole("button", { name: /Rectangle\. Drag to move/i })).toHaveLength(1);
  });
});
