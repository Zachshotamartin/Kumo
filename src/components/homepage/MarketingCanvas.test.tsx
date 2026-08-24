import { fireEvent, render, screen } from "@testing-library/react";
import MarketingCanvas from "./MarketingCanvas";

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

    expect(Array.from(container.querySelectorAll("[data-shape-type='vector'] path"))
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
});
