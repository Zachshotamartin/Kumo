import { fireEvent, render, screen } from "@testing-library/react";
import type { Shape } from "../../classes/shape";
import CanvasGuides from "./CanvasGuides";

const guide = (id: string, axis: "vertical" | "horizontal", value: number): Shape => ({
  id, type: "guide", guideAxis: axis, x1: axis === "vertical" ? value : 0, x2: axis === "vertical" ? value : 0,
  y1: axis === "horizontal" ? value : 0, y2: axis === "horizontal" ? value : 0, width: 0, height: 0, level: 0, zIndex: 0, locked: true,
});

const canvas = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

const renderGuides = (options: { canEdit?: boolean; rulers?: boolean; bounds?: DOMRect | undefined; onParentKey?: () => void; onParentPointer?: () => void; onParentDoubleClick?: () => void } = {}) => {
  const onMove = vi.fn();
  const onRemove = vi.fn();
  render(
    // Stands in for the canvas, which handles the same keys and pointers.
    <div role="presentation" onKeyDown={options.onParentKey} onPointerDown={options.onParentPointer} onDoubleClick={options.onParentDoubleClick}>
      <CanvasGuides
        guides={[guide("vertical", "vertical", 100), guide("horizontal", "horizontal", 50)]}
        viewport={{ x: 0, y: 0, zoom: 2 }}
        canEdit={options.canEdit ?? true}
        rulers={options.rulers ?? true}
        bounds={() => ("bounds" in options ? options.bounds : canvas)}
        toWorld={({ clientX, clientY }) => ({ x: clientX / 2, y: clientY / 2 })}
        onMove={onMove}
        onRemove={onRemove}
      />
    </div>
  );
  return { onMove, onRemove, vertical: screen.getByRole("button", { name: /Vertical guide/ }), horizontal: screen.getByRole("button", { name: /Horizontal guide/ }) };
};

describe("CanvasGuides", () => {
  it("places guides at their screen position and says how to remove them", () => {
    const { vertical, horizontal } = renderGuides();
    expect(vertical).toHaveStyle({ left: "200px" });
    expect(horizontal).toHaveStyle({ top: "100px" });
    expect(vertical).toHaveAccessibleName("Vertical guide at 100. Drag to move. Drag onto a ruler, double-click, or press Delete to remove.");
    expect(vertical).toHaveAttribute("title", "Drag to move. Drag onto a ruler, double-click, or press Delete to remove.");
  });

  it("moves a guide by the distance dragged, without jumping to the pointer", () => {
    const parent = vi.fn();
    const { vertical, onMove, onRemove } = renderGuides({ onParentPointer: parent });
    fireEvent.pointerDown(vertical, { pointerId: 1, button: 0, clientX: 204, clientY: 300 });
    expect(parent).not.toHaveBeenCalled();
    expect(vertical).toHaveFocus();
    fireEvent.pointerMove(vertical, { pointerId: 1, clientX: 254, clientY: 300 });
    expect(vertical).toHaveStyle({ left: "250px" });
    expect(vertical).toHaveAttribute("data-dragging", "true");
    expect(vertical).not.toHaveAttribute("data-removing");
    expect(vertical).toHaveAccessibleName(/^Vertical guide at 125\./);
    fireEvent.pointerUp(vertical, { pointerId: 1, clientX: 254, clientY: 300 });
    expect(onMove).toHaveBeenCalledWith("vertical", 125);
    expect(onRemove).not.toHaveBeenCalled();
    expect(vertical).not.toHaveAttribute("data-dragging");
  });

  it("moves horizontal guides along the vertical axis", () => {
    const { horizontal, onMove } = renderGuides();
    fireEvent.pointerDown(horizontal, { pointerId: 2, button: 0, clientX: 400, clientY: 100 });
    fireEvent.pointerUp(horizontal, { pointerId: 2, clientX: 400, clientY: 160 });
    expect(onMove).toHaveBeenCalledWith("horizontal", 80);
  });

  it("leaves a guide in place when it is only clicked", () => {
    const { vertical, onMove, onRemove } = renderGuides();
    fireEvent.pointerDown(vertical, { pointerId: 1, button: 0, clientX: 204, clientY: 300 });
    fireEvent.pointerUp(vertical, { pointerId: 1, clientX: 204, clientY: 300 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("removes a guide released over a ruler, including a click on its ruler marker", () => {
    const { vertical, onMove, onRemove } = renderGuides();
    fireEvent.pointerDown(vertical, { pointerId: 1, button: 0, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(vertical, { pointerId: 1, clientX: 200, clientY: 10 });
    expect(vertical).toHaveAttribute("data-removing", "true");
    fireEvent.pointerUp(vertical, { pointerId: 1, clientX: 200, clientY: 10 });
    expect(onRemove).toHaveBeenCalledWith("vertical");

    fireEvent.pointerDown(vertical, { pointerId: 3, button: 0, clientX: 10, clientY: 300 });
    fireEvent.pointerUp(vertical, { pointerId: 3, clientX: 10, clientY: 300 });
    expect(onRemove).toHaveBeenCalledTimes(2);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("removes a guide dragged off the canvas", () => {
    const { horizontal, onRemove } = renderGuides();
    for (const [clientX, clientY] of [[900, 300], [-5, 300], [400, 700], [400, -5]]) {
      fireEvent.pointerDown(horizontal, { pointerId: 4, button: 0, clientX: 400, clientY: 100 });
      fireEvent.pointerUp(horizontal, { pointerId: 4, clientX, clientY });
    }
    expect(onRemove).toHaveBeenCalledTimes(4);
  });

  it("moves instead of removing when the rulers are hidden or the canvas is unmeasured", () => {
    const hidden = renderGuides({ rulers: false });
    fireEvent.pointerDown(hidden.vertical, { pointerId: 1, button: 0, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(hidden.vertical, { pointerId: 1, clientX: 10, clientY: 300 });
    expect(hidden.onMove).toHaveBeenCalledWith("vertical", 5);
    expect(hidden.onRemove).not.toHaveBeenCalled();
    document.body.innerHTML = "";

    const unmeasured = renderGuides({ bounds: undefined });
    fireEvent.pointerDown(unmeasured.vertical, { pointerId: 1, button: 0, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(unmeasured.vertical, { pointerId: 1, clientX: 900, clientY: 300 });
    expect(unmeasured.onRemove).not.toHaveBeenCalled();
  });

  it("ignores other pointers, other buttons and cancelled drags", () => {
    const { vertical, horizontal, onMove, onRemove } = renderGuides();
    fireEvent.pointerMove(vertical, { pointerId: 1, clientX: 254, clientY: 300 });
    fireEvent.pointerUp(vertical, { pointerId: 1, clientX: 254, clientY: 300 });
    fireEvent.pointerDown(vertical, { pointerId: 1, button: 2, clientX: 204, clientY: 300 });
    expect(vertical).not.toHaveAttribute("data-dragging");
    fireEvent.pointerDown(vertical, { pointerId: 1, button: 0, clientX: 204, clientY: 300 });
    fireEvent.pointerMove(vertical, { pointerId: 9, clientX: 254, clientY: 300 });
    fireEvent.pointerMove(horizontal, { pointerId: 1, clientX: 254, clientY: 300 });
    fireEvent.pointerUp(horizontal, { pointerId: 1, clientX: 254, clientY: 300 });
    fireEvent.pointerUp(vertical, { pointerId: 9, clientX: 254, clientY: 300 });
    expect(vertical).toHaveStyle({ left: "200px" });
    fireEvent.pointerCancel(vertical, { pointerId: 1 });
    expect(vertical).not.toHaveAttribute("data-dragging");
    fireEvent.pointerUp(vertical, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("captures the pointer when the browser allows it", () => {
    const setPointerCapture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: setPointerCapture });
    const { vertical } = renderGuides();
    fireEvent.pointerDown(vertical, { pointerId: 7, button: 0, clientX: 204, clientY: 300 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  });

  it("removes a guide on double-click, Delete or Backspace without deleting the canvas selection", () => {
    const parentKey = vi.fn();
    const parentDoubleClick = vi.fn();
    const { vertical, horizontal, onRemove } = renderGuides({ onParentKey: parentKey, onParentDoubleClick: parentDoubleClick });
    fireEvent.doubleClick(vertical);
    expect(parentDoubleClick).not.toHaveBeenCalled();
    fireEvent.keyDown(vertical, { key: "Delete" });
    fireEvent.keyDown(horizontal, { key: "Backspace" });
    expect(onRemove.mock.calls).toEqual([["vertical"], ["vertical"], ["horizontal"]]);
    expect(parentKey).not.toHaveBeenCalled();
    fireEvent.keyDown(vertical, { key: "Enter" });
    expect(onRemove).toHaveBeenCalledTimes(3);
    expect(parentKey).toHaveBeenCalledOnce();
  });

  it("is read-only for viewers", () => {
    const parent = vi.fn();
    const { vertical, onMove, onRemove } = renderGuides({ canEdit: false, onParentPointer: parent });
    expect(vertical).not.toHaveAttribute("title");
    fireEvent.pointerDown(vertical, { pointerId: 1, button: 0, clientX: 204, clientY: 300 });
    expect(parent).not.toHaveBeenCalled();
    fireEvent.pointerUp(vertical, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.doubleClick(vertical);
    fireEvent.keyDown(vertical, { key: "Delete" });
    expect(onMove).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });
});
