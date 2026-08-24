import { fireEvent, render, screen } from "@testing-library/react";
import { TextEditor } from "./TextEditor";

describe("TextEditor", () => {
  it("focuses and selects the value, updates live, fits content, and commits on blur", () => {
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 7;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const { unmount } = render(
      <TextEditor
        value="Original copy"
        style={{ fontSize: 18 }}
        verticalAlign="center"
        autoResize="auto-height"
        onChange={onChange}
        onBlur={onBlur}
      />
    );
    const editor = screen.getByRole("textbox", { name: "Edit text" });
    const select = vi.spyOn(editor as HTMLTextAreaElement, "select");
    Object.defineProperty(editor, "scrollHeight", { configurable: true, value: 64 });

    frame?.(0);
    expect(editor).toHaveFocus();
    expect(select).toHaveBeenCalledOnce();
    fireEvent.change(editor, { target: { value: "Edited copy" } });
    expect(onChange).toHaveBeenCalledWith("Edited copy");
    expect(editor).toHaveValue("Edited copy");
    expect(editor).toHaveStyle({ height: "64px" });
    expect(editor).toHaveAttribute("wrap", "soft");
    fireEvent.blur(editor);
    expect(onBlur).toHaveBeenCalledWith("Edited copy");

    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("keeps auto-width text on explicit lines without an internal scrollbar", () => {
    render(
      <TextEditor
        value="A long point-text line"
        style={{}}
        verticalAlign="flex-start"
        autoResize="auto-width"
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    );
    const editor = screen.getByRole("textbox", { name: "Edit text" });
    expect(editor).toHaveAttribute("wrap", "off");
    expect(editor).toHaveAttribute("data-auto-resize", "auto-width");
  });

  it("keeps pointer and click gestures inside the text editor", () => {
    const parentPointer = vi.fn();
    const parentClick = vi.fn();
    render(
      <div
        role="button"
        tabIndex={0}
        onKeyDown={vi.fn()}
        onPointerDown={parentPointer}
        onClick={parentClick}
      >
        <TextEditor
          value="Selectable words"
          style={{}}
          verticalAlign="flex-start"
          onChange={vi.fn()}
          onBlur={vi.fn()}
        />
      </div>
    );
    const editor = screen.getByRole("textbox", { name: "Edit text" });
    fireEvent.pointerDown(editor);
    fireEvent.click(editor);
    fireEvent.doubleClick(editor);
    expect(parentPointer).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
