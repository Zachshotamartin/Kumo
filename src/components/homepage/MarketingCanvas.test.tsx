import { act, fireEvent, render, screen } from "@testing-library/react";
import MarketingCanvas from "./MarketingCanvas";
import appStore from "../../store";

vi.mock("../brand/KumoLogo", () => ({ default: ({ label }: { label: string }) => <div aria-label={label} /> }));
let resize: () => void;
const bounds = { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, toJSON: () => ({}) };
const canvas = () => screen.getByRole("application", { name: "Kumo design canvas" });
const point = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y, button: 0, buttons: 1 });
const draw = () => {
  fireEvent.click(screen.getByRole("button", { name: "Rectangle (R)" }));
  fireEvent.pointerDown(canvas(), point(200, 200));
  fireEvent.pointerMove(canvas(), point(320, 280));
  fireEvent.pointerUp(canvas(), point(320, 280));
};

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("ResizeObserver", class { constructor(private callback: () => void) {} observe(element: HTMLElement) { if (element.hasAttribute("data-context")) resize = this.callback; } disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(bounds);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 1000 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 1000 });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => true;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("landing page production editor integration", () => {
  it("uses the editor for drawing, resize, selection, undo, redo, text editing and reset without changing the application store", () => {
    const before = appStore.getState();
    const { container } = render(<MarketingCanvas logoContext="idle" logoStatus="Ready" />);
    expect(screen.getByRole("heading", { level: 1, name: "Every board can lead somewhere." })).toBeVisible();
    expect(container.querySelectorAll("[data-shape-type='text']")).toHaveLength(9);
    draw();
    expect(container.querySelectorAll("[data-shape-type='rectangle']")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Resize from bottom right" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(container.querySelectorAll("[data-shape-type='rectangle']")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(container.querySelectorAll("[data-shape-type='rectangle']")).toHaveLength(1);
    fireEvent.pointerDown(canvas(), point(250, 220));
    fireEvent.pointerUp(canvas(), point(250, 220));
    fireEvent.click(screen.getByRole("button", { name: "Delete selection" }));
    expect(container.querySelectorAll("[data-shape-type='rectangle']")).toHaveLength(0);
    fireEvent.doubleClick(canvas(), point(100, 780));
    const text = screen.getByRole("textbox", { name: "Edit text" });
    fireEvent.pointerDown(text, point(100, 780));
    fireEvent.change(text, { target: { value: "A local edit." } });
    fireEvent.blur(text);
    expect(screen.getByRole("heading", { name: "A local edit." })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset canvas" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(appStore.getState()).toEqual(before);
  });
  it("preserves edits through auth status and size updates, but reseeds an untouched composition", () => {
    const view = render(<MarketingCanvas logoContext="idle" logoStatus="Ready" />);
    act(() => resize());
    draw();
    act(() => resize());
    view.rerender(<MarketingCanvas logoContext="loading" logoStatus="Signing in" />);
    expect(view.container.querySelectorAll("[data-shape-type='rectangle']")).toHaveLength(1);
    expect(screen.getByText("Signing in")).toBeVisible();
    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    view.unmount();
  });
  it("does not intercept login form shortcuts, paste, or page scrolling before the canvas is focused", () => {
    render(<><MarketingCanvas logoContext="idle" logoStatus="Ready" /><input aria-label="Email" /></>);
    const field = screen.getByRole("textbox", { name: "Email" });
    field.focus();
    const undo = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    field.dispatchEvent(undo);
    expect(undo.defaultPrevented).toBe(false);
    const wheel = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
    canvas().dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    field.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
  });
});
