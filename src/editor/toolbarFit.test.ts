import { fitToolCount, toolbarAvailableWidth } from "./toolbarFit";

const base = { chrome: 131, step: 38, gap: 2, total: 18, minimum: 2 };

describe("fitToolCount", () => {
  it("shows every tool when they all fit", () => {
    expect(fitToolCount({ ...base, available: 131 + 18 * 38 - 2 })).toBe(18);
    expect(fitToolCount({ ...base, available: 2000 })).toBe(18);
  });

  it("makes room for the More tools button once the tools overflow", () => {
    // 700px: (700 - 131 + 2) / 38 = 15 slots, one of which is the More button.
    expect(fitToolCount({ ...base, available: 700 })).toBe(14);
    expect(fitToolCount({ ...base, available: 131 + 18 * 38 - 3 })).toBe(16);
  });

  it("never hides the pinned tools, however narrow the canvas", () => {
    expect(fitToolCount({ ...base, available: 120 })).toBe(2);
    expect(fitToolCount({ ...base, available: 0 })).toBe(2);
  });
});

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
}) as DOMRect;

const layout = (element: HTMLElement, box: DOMRect) => {
  element.getBoundingClientRect = () => box;
};

describe("toolbarAvailableWidth", () => {
  const dockRow = (width: number) => {
    const row = document.createElement("div");
    Object.defineProperty(row, "clientWidth", { value: width });
    const toolbar = document.createElement("div");
    row.append(toolbar);
    layout(toolbar, rect(200, 100, 400, 46));
    return { row, toolbar };
  };

  it("has no width to offer a toolbar that isn't in a dock", () => {
    expect(toolbarAvailableWidth(document.createElement("div"))).toBe(0);
  });

  it("uses the whole row when nothing shares the toolbar's line", () => {
    const { row, toolbar } = dockRow(900);
    const hidden = document.createElement("div");
    layout(hidden, rect(0, 0, 0, 0));
    const above = document.createElement("div");
    layout(above, rect(760, 46, 137, 46));
    row.append(hidden, above);
    expect(toolbarAvailableWidth(toolbar)).toBe(900);
  });

  it("keeps room on both sides for a control centred beside the toolbar", () => {
    const { row, toolbar } = dockRow(1100);
    const zoom = document.createElement("div");
    layout(zoom, rect(960, 100, 137, 46));
    row.append(zoom);
    expect(toolbarAvailableWidth(toolbar)).toBe(1100 - 2 * 137);
    // jsdom doesn't compute column-gap, so the dock's 12px gap is supplied directly.
    const styles = vi.spyOn(window, "getComputedStyle").mockReturnValue({ columnGap: "12px" } as CSSStyleDeclaration);
    expect(toolbarAvailableWidth(toolbar)).toBe(1100 - 2 * (137 + 12));
    styles.mockRestore();
  });
});
