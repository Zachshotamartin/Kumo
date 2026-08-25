import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { loadWorkspaceFonts, uploadWorkspaceFont } from "../../services/fontRepository";
import AdvancedStudioPanel from "./AdvancedStudioPanel";

const mocks = vi.hoisted(() => ({
  actions: { canEdit: true, commitShapes: vi.fn(), patchSelected: vi.fn() },
}));
const nativeDocumentFonts = document.fonts;

vi.mock("../../editor/useEditorActions", () => ({ useEditorActions: () => mocks.actions }));
vi.mock("../../services/fontRepository", () => ({ loadWorkspaceFonts: vi.fn(), uploadWorkspaceFont: vi.fn() }));

const shape = (id: string, type: Shape["type"] = "rectangle", patch: Partial<Shape> = {}): Shape => ({
  id, type, name: id, x1: 0, y1: 0, x2: 160, y2: 100, width: 160, height: 100,
  level: 0, zIndex: 1, parentId: null, backgroundColor: "#ffffff", borderColor: "#17181a", borderWidth: 1,
  ...patch,
});

const renderStudio = (selected: Shape, others: Shape[] = []) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", baseRoomId: "board:board", role: "owner", type: "private", title: "Studio",
    shapes: [selected, ...others], linkedBoards: { linked: { id: "linked", title: "Linked board", accessible: true, visibility: "private", role: "viewer", updatedAt: 1 } },
  }));
  store.dispatch(setSelectedShapes([selected.id]));
  render(<Provider store={store}><AdvancedStudioPanel /></Provider>);
  return store;
};

const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("advanced canvas studio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.actions.canEdit = true;
    vi.mocked(loadWorkspaceFonts).mockReturnValue(new Promise(() => undefined));
    vi.mocked(uploadWorkspaceFont).mockResolvedValue({ id: "font", workspace_id: "workspace", family: "Acme Sans", style: "normal", weight_min: 400, weight_max: 700, storage_key: "fonts/acme.woff2", mime_type: "font/woff2", created_at: "now", url: "https://assets.test/acme.woff2" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(document, "fonts", { configurable: true, value: nativeDocumentFonts });
  });

  it("edits connector routing and creates editable diagrams", () => {
    const connector = shape("connector", "connector", {
      connectorRouting: "orthogonal", connectorLabel: "Approve", connectorStartCap: "none", connectorEndCap: "arrow",
      connectorStart: { x: 0, y: 0, anchor: "auto" }, connectorEnd: { x: 160, y: 100, anchor: "auto" },
    });
    renderStudio(connector);
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "curved" } });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Review" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "circle" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "diamond" } });
    fireEvent.click(screen.getByLabelText("Avoid objects"));
    fireEvent.change(screen.getByLabelText("Flowchart source"), { target: { value: "flowchart LR\nA[Idea] --> B{Ready}" } });
    fireEvent.click(screen.getByRole("button", { name: "Create editable diagram" }));
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ connectorRouting: "curved" });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ connectorLabel: "Review" });
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "connector" })]));
  });

  it("quick-connects a selected node in every direction", () => {
    for (const direction of ["left", "right", "top", "bottom"]) {
      renderStudio(shape(`node-${direction}`));
      fireEvent.click(screen.getByRole("button", { name: direction }));
      cleanup();
    }
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(4);
    expect(mocks.actions.commitShapes).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ type: "connector" })]));
  });

  it("creates, selects, removes, and configures named prototype flows", () => {
    const frame = shape("frame", "frame", { prototypeOverflowAxis: "none", prototypePosition: "sticky", prototypeStickyOffset: 8 });
    const flow = shape("flow", "resource", { hidden: true, resourceKind: "prototype-flow", resourceName: "Checkout", resourceValue: { json: JSON.stringify({ id: "flow-id", startFrameId: "frame", name: "Checkout", description: "Purchase path" }) } });
    const store = renderStudio(frame, [flow]);
    openTab("prototype");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Onboarding" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "First-run path" } });
    fireEvent.click(screen.getByRole("button", { name: "Create from selected frame" }));
    expect(screen.getByRole("status")).toHaveTextContent("Prototype flow created");
    const row = screen.getByText("Checkout").closest("div")!;
    fireEvent.click(within(row).getByRole("button", { name: "Select" }));
    expect(store.getState().selected.selectedShapes).toEqual(["frame"]);
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    fireEvent.change(screen.getByLabelText("Overflow axis"), { target: { value: "vertical" } });
    fireEvent.change(screen.getByLabelText("Position in prototype"), { target: { value: "fixed" } });
    fireEvent.change(screen.getByLabelText("Sticky offset"), { target: { value: "24" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ prototypeOverflowAxis: "vertical", prototypeOverflow: "scroll" });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ prototypeStickyOffset: 24 });
  });

  it("edits layered fills, gradients, strokes, corners, and smoothing", () => {
    renderStudio(shape("paint", "rectangle", {
      backgroundColor: "#aaaaaa", borderRadius: 6,
      fills: [
        { id: "solid", type: "solid", color: "#111111", opacity: 0.8, visible: true },
        { id: "gradient", type: "linear-gradient", opacity: 1, visible: true, gradientAngle: 45, gradientStops: [{ id: "start", color: "#222222", opacity: 1, position: 0 }, { id: "end", color: "#eeeeee", opacity: 1, position: 1 }] },
      ],
      strokes: [{ id: "stroke", color: "#333333", width: 2, opacity: 1, visible: true, style: "solid", align: "center" }],
    }));
    openTab("style");
    fireEvent.change(screen.getByLabelText("Fill 1 color"), { target: { value: "#444444" } });
    fireEvent.change(screen.getByLabelText("Gradient stop 1 color"), { target: { value: "#555555" } });
    fireEvent.change(screen.getByLabelText("Stroke 1 color"), { target: { value: "#666666" } });
    const angle = screen.getByLabelText("Angle");
    fireEvent.change(angle, { target: { value: "120" } });
    const opacity = screen.getAllByLabelText("Opacity")[0]!;
    fireEvent.change(opacity, { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "5" } });
    for (const button of ["Add fill", "Add gradient", "Add stroke"]) fireEvent.click(screen.getByRole("button", { name: button }));
    fireEvent.click(screen.getByRole("button", { name: "Remove fill 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove stroke 1" }));
    fireEvent.change(screen.getByLabelText("top Left"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Corner smoothing"), { target: { value: "0.4" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ cornerSmoothing: 0.4 });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ cornerRadii: expect.objectContaining({ topLeft: 12 }) }));
  });

  it("searches, applies, uploads, and replaces fonts", async () => {
    const addFont = vi.fn();
    const loadFontFace = vi.fn().mockResolvedValue(undefined);
    class TestFontFace {
      constructor(public family: string, public source: string, public descriptors: FontFaceDescriptors) {}
      load = async () => { await loadFontFace(); return this as unknown as FontFace; };
    }
    vi.stubGlobal("FontFace", TestFontFace);
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: addFont } });
    vi.mocked(loadWorkspaceFonts).mockResolvedValue([{ id: "workspace-font", workspace_id: "workspace", family: "Workspace Serif", style: "normal", weight_min: 400, weight_max: 700, storage_key: "font.woff2", mime_type: "font/woff2", created_at: "now", url: "https://assets.test/font.woff2" }]);
    renderStudio(shape("copy", "text", { text: "Kumo", fontFamily: "Unavailable Font" }));
    openTab("fonts");
    fireEvent.click(await screen.findByRole("button", { name: /Workspace Serif/ }));
    await waitFor(() => expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ fontFamily: "Workspace Serif" }));
    expect(loadFontFace).toHaveBeenCalledOnce();
    expect(addFont).toHaveBeenCalledWith(expect.objectContaining({ family: "Workspace Serif", descriptors: expect.objectContaining({ weight: "400 700" }) }));
    fireEvent.change(screen.getByLabelText("Search fonts"), { target: { value: "Inter" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Inter/ })[0]!);
    await waitFor(() => expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ fontFamily: "Inter" }));
    expect(localStorage.getItem("kumo:recent-fonts")).toContain("Inter");
    fireEvent.change(screen.getByLabelText("Family name"), { target: { value: "Acme Sans" } });
    const file = new File(["font"], "acme.woff2", { type: "font/woff2" });
    fireEvent.change(screen.getByLabelText("Font file"), { target: { files: [file] } });
    expect(await screen.findByText("Acme Sans added to the workspace.")).toBeVisible();
    expect(uploadWorkspaceFont).toHaveBeenCalledWith(file, "Acme Sans");
    fireEvent.click(screen.getByRole("button", { name: "Replace with Inter" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
  });

  it("imports CSV, Mermaid, editable SVG, rich links, and videos", () => {
    renderStudio(shape("selected"));
    openTab("import");
    const type = screen.getByLabelText("Content type");
    const content = screen.getByLabelText("Paste content");
    fireEvent.change(content, { target: { value: "Name,Status\nKumo,Ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    fireEvent.change(type, { target: { value: "mermaid" } });
    fireEvent.change(screen.getByLabelText("Paste content"), { target: { value: "flowchart LR\nA-->B" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    fireEvent.change(type, { target: { value: "svg" } });
    fireEvent.change(screen.getByLabelText("Paste content"), { target: { value: '<svg><rect x="0" y="0" width="80" height="40" fill="#b87a2e"/></svg>' } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    fireEvent.change(type, { target: { value: "url" } });
    fireEvent.change(screen.getByLabelText("Public URL"), { target: { value: "https://assets.test/demo.mp4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    fireEvent.change(screen.getByLabelText("Public URL"), { target: { value: "https://kumo.test/guide" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(5);
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ mediaType: "video" })]));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "link" })]));
  });

  it("edits imported tables, notes, code, and link metadata", () => {
    const table = shape("table", "table", { tableCells: [["Name", "Status"], ["Kumo", "Ready"]], rows: 2, columns: 2 });
    renderStudio(table);
    openTab("import");
    fireEvent.change(screen.getByLabelText("Edit selected table as CSV"), { target: { value: "A,B,C\n1,2,3" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ rows: 2, columns: 3 }));
    cleanup();
    renderStudio(shape("note", "sticky", { text: "Original" }));
    openTab("import");
    fireEvent.change(screen.getByLabelText("Edit selected sticky"), { target: { value: "Changed" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ text: "Changed" });
  });

  it("runs workshop controls and creates reaction stamps", () => {
    renderStudio(shape("selected"));
    openTab("workshop");
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    fireEvent.click(screen.getByRole("button", { name: "Start 5 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(screen.getByLabelText("Voting open"));
    fireEvent.change(screen.getByLabelText("Votes per person"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Optional background audio URL"), { target: { value: "https://assets.test/focus.mp3" } });
    for (const label of ["+1 stamp", "Emphasis", "High five"]) fireEvent.click(screen.getByRole("button", { name: label }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(8);
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "sticky", text: "+1" })]));
  });

  it("pins and unpins live linked-board portals and closes the studio", () => {
    const store = renderStudio(shape("portal", "board", { boardId: "linked", title: "Linked board" }));
    openTab("portal");
    expect(screen.getByText("Live")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Version ID (optional)"), { target: { value: "version-42" } });
    fireEvent.click(screen.getByRole("button", { name: "Pin portal" }));
    fireEvent.click(screen.getByRole("button", { name: "Follow live" }));
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ portalVersionId: "version-42", portalPinnedAt: expect.any(String) }));
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ portalVersionId: null, portalPinnedAt: null });
    fireEvent.click(screen.getByRole("button", { name: "Close canvas studio" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
  });

  it("disables mutations for viewers", () => {
    mocks.actions.canEdit = false;
    renderStudio(shape("selected"));
    expect(screen.getByRole("button", { name: "Create editable diagram" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "right" })).toBeDisabled();
  });

  it("renders connector defaults and disables unsupported quick connections", () => {
    renderStudio(shape("connector", "connector", {
      connectorRouting: undefined,
      connectorLabel: undefined,
      connectorStartCap: undefined,
      connectorEndCap: undefined,
      connectorAvoidObstacles: false,
    }));
    expect(screen.getByLabelText("Route")).toHaveValue("orthogonal");
    expect(screen.getByLabelText("Label")).toHaveValue("");
    expect(screen.getByLabelText("Start")).toHaveValue("none");
    expect(screen.getByLabelText("End")).toHaveValue("arrow");
    expect(screen.getByLabelText("Avoid objects")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "right" })).toBeDisabled();
  });

  it("covers empty prototype state, flow fallbacks, and clip overflow", () => {
    const flow = shape("flow", "resource", { hidden: true, resourceKind: "prototype-flow", resourceName: "Flow", resourceValue: { json: JSON.stringify({ id: "flow-id", startFrameId: "missing", name: "Flow", description: "" }) } });
    const store = renderStudio(shape("rectangle"), [flow]);
    act(() => store.dispatch(setSelectedShapes([])));
    openTab("prototype");
    expect(screen.getByText("No description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create from selected frame" })).toBeDisabled();
    expect(screen.queryByText("Scrolling and position")).not.toBeInTheDocument();
    cleanup();

    renderStudio(shape("frame", "frame", { prototypeOverflowAxis: undefined, prototypePosition: undefined }));
    openTab("prototype");
    fireEvent.change(screen.getByLabelText("Overflow axis"), { target: { value: "none" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ prototypeOverflowAxis: "none", prototypeOverflow: "clip" });
  });

  it("covers empty and fallback paint stacks and every conditional paint update", () => {
    const paint = shape("fallback-paint", "rectangle", {
      backgroundColor: undefined,
      borderColor: undefined,
      borderWidth: undefined,
      borderRadius: undefined,
      cornerRadii: { topLeft: 2 },
      cornerSmoothing: undefined,
      fills: [
        { id: "plain", type: "solid", color: undefined, opacity: 1, visible: true },
        { id: "radial", type: "radial-gradient", opacity: 0.5, visible: true, gradientAngle: undefined, gradientStops: undefined },
        { id: "image", type: "image", opacity: 1, visible: true },
      ],
      strokes: [
        { id: "one", color: "#111111", width: 1, opacity: 1, visible: true, style: "solid", align: "center" },
        { id: "two", color: "#222222", width: 2, opacity: 1, visible: true, style: "solid", align: "center" },
      ],
    } as unknown as Partial<Shape>);
    renderStudio(paint);
    openTab("style");
    expect(screen.getByLabelText("Fill 1 color")).toHaveValue("#ffffff");
    expect(screen.getByLabelText("Angle")).toHaveValue(90);
    fireEvent.change(screen.getAllByLabelText("Type")[0]!, { target: { value: "linear-gradient" } });
    fireEvent.change(screen.getAllByLabelText("Type")[0]!, { target: { value: "image" } });
    fireEvent.change(screen.getAllByLabelText("Opacity")[1]!, { target: { value: "0.25" } });
    fireEvent.change(screen.getAllByLabelText("Width")[0]!, { target: { value: "-3" } });
    fireEvent.change(screen.getByLabelText("Stroke 2 color"), { target: { value: "#333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove stroke 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add fill" }));
    fireEvent.click(screen.getByRole("button", { name: "Add stroke" }));
    for (const corner of ["top Left", "top Right", "bottom Left", "bottom Right"]) {
      fireEvent.change(screen.getByLabelText(corner), { target: { value: "-4" } });
    }
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({
      fills: expect.arrayContaining([expect.objectContaining({ type: "linear-gradient", gradientStops: expect.any(Array) })]),
    }));
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ cornerRadii: expect.objectContaining({ bottomRight: 0 }) }));
    cleanup();

    const store = renderStudio(shape("none"));
    act(() => store.dispatch(setSelectedShapes([])));
    openTab("style");
    expect(screen.getByText("Select a shape to edit its paint stack and independent corners.")).toBeInTheDocument();
  });

  it("handles font cache, storage failures, unsupported browsers, and upload failures", async () => {
    vi.mocked(loadWorkspaceFonts).mockResolvedValue([
      { id: "fixed", workspace_id: "workspace", family: "Fixed Font", style: null, weight_min: 500, weight_max: 500, storage_key: "fixed.woff2", mime_type: "font/woff2", created_at: "now", url: "https://assets.test/fixed.woff2" },
    ] as unknown as Awaited<ReturnType<typeof loadWorkspaceFonts>>);
    const storageRead = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    renderStudio(shape("copy", "text", { fontFamily: "Missing" }));
    openTab("fonts");
    fireEvent.click(screen.getByRole("button", { name: /Arial/ }));
    await waitFor(() => expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ fontFamily: "Arial" }));
    storageRead.mockRestore();
    storageWrite.mockRestore();

    fireEvent.change(screen.getByLabelText("Search fonts"), { target: { value: "Inter" } });
    const inter = screen.getByRole("button", { name: /^Inter/ });
    fireEvent.click(inter);
    await waitFor(() => expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ fontFamily: "Inter" }));
    fireEvent.click(inter);
    await waitFor(() => expect(mocks.actions.patchSelected).toHaveBeenCalledTimes(3));
    cleanup();

    vi.stubGlobal("FontFace", undefined);
    renderStudio(shape("copy-2", "text"));
    openTab("fonts");
    fireEvent.click(await screen.findByRole("button", { name: /Fixed Font/ }));
    expect(await screen.findByText("This browser cannot load workspace fonts.")).toBeInTheDocument();
    cleanup();

    vi.mocked(uploadWorkspaceFont).mockRejectedValueOnce("upload failed");
    renderStudio(shape("copy-3", "text"));
    openTab("fonts");
    fireEvent.change(screen.getByLabelText("Family name"), { target: { value: "Broken" } });
    fireEvent.change(screen.getByLabelText("Font file"), { target: { files: [] } });
    fireEvent.change(screen.getByLabelText("Font file"), { target: { files: [new File(["bad"], "bad.woff2", { type: "font/woff2" })] } });
    expect(await screen.findByText("Font upload failed.")).toBeInTheDocument();
  });

  it("ignores font registry load failures and deletes rejected font cache entries", async () => {
    vi.mocked(loadWorkspaceFonts).mockRejectedValueOnce(new Error("registry offline"));
    renderStudio(shape("copy", "text"));
    openTab("fonts");
    expect(screen.getByText("Font registry")).toBeInTheDocument();

    class RejectingFontFace {
      constructor(public family: string) {}
      load = () => Promise.reject("font rejected");
    }
    vi.stubGlobal("FontFace", RejectingFontFace);
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    cleanup();
    vi.mocked(loadWorkspaceFonts).mockResolvedValue([{ id: "reject", workspace_id: "workspace", family: "Reject Font", style: "normal", weight_min: 400, weight_max: 400, storage_key: "reject.woff2", mime_type: "font/woff2", created_at: "now", url: "https://assets.test/reject.woff2" }]);
    renderStudio(shape("copy-2", "text"));
    openTab("fonts");
    fireEvent.click(await screen.findByRole("button", { name: /Reject Font/ }));
    expect(await screen.findByText("Font loading failed.")).toBeInTheDocument();
  });

  it("handles invalid imports and edits code and link metadata defaults", () => {
    renderStudio(shape("code", "code", { text: undefined }));
    openTab("import");
    fireEvent.change(screen.getByLabelText("Content type"), { target: { value: "svg" } });
    fireEvent.change(screen.getByLabelText("Paste content"), { target: { value: "<svg></svg>" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    fireEvent.change(screen.getByLabelText("Edit selected code"), { target: { value: "const ready = true;" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ text: "const ready = true;" });
    cleanup();

    renderStudio(shape("link", "link", { embedTitle: undefined, embedDescription: undefined }));
    openTab("import");
    fireEvent.change(screen.getByLabelText("Content type"), { target: { value: "url" } });
    fireEvent.change(screen.getByLabelText("Public URL"), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: "Add editable content" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Guide" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Details" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ embedTitle: "Guide" });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ embedDescription: "Details" });
  });

  it("updates and clears an active workshop timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
    const clearInterval = vi.spyOn(window, "clearInterval");
    const workshop = shape("workshop", "resource", { resourceKind: "workshop-state", resourceValue: { json: JSON.stringify({ timerEndsAt: Date.now() + 61_000, timerDurationSeconds: 300, votingOpen: false, votesPerPerson: 3, musicUrl: "https://assets.test/audio.mp3" }) } });
    const view = renderStudio(shape("selected"), [workshop]);
    openTab("workshop");
    expect(screen.getByRole("timer")).toHaveTextContent("01:01");
    expect(document.querySelector("audio")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getByRole("timer")).toHaveTextContent("00:59");
    cleanup();
    expect(clearInterval).toHaveBeenCalled();
    void view;
    vi.useRealTimers();
  });

  it("renders every portal status and clears a blank version", () => {
    renderStudio(shape("portal", "board", { boardId: "missing", title: undefined }));
    openTab("portal");
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Access required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pin portal" }));
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ portalVersionId: null }));
    cleanup();

    renderStudio(shape("portal-2", "board", { boardId: undefined }));
    openTab("portal");
    expect(screen.getByText("Not linked")).toBeInTheDocument();
    cleanup();

    renderStudio(shape("not-portal"));
    openTab("portal");
    expect(screen.getByText(/Select a linked-board object/)).toBeInTheDocument();
  });

  it("prevents workshop stamps from mutating a read-only board", () => {
    mocks.actions.canEdit = false;
    renderStudio(shape("selected"));
    openTab("workshop");
    fireEvent.click(screen.getByRole("button", { name: "+1 stamp" }));
    expect(mocks.actions.commitShapes).not.toHaveBeenCalled();
  });

  it("loads a fixed workspace font with descriptor fallbacks and skips an existing web stylesheet", async () => {
    const add = vi.fn();
    class FixedFontFace {
      constructor(public family: string, public source: string, public descriptors: FontFaceDescriptors) {}
      load = async () => this as unknown as FontFace;
    }
    vi.stubGlobal("FontFace", FixedFontFace);
    Object.defineProperty(document, "fonts", { configurable: true, value: { add } });
    vi.mocked(loadWorkspaceFonts).mockResolvedValue([{ id: "fixed-success", workspace_id: "workspace", family: "Fixed Success", style: null, weight_min: 500, weight_max: 500, storage_key: "fixed.woff2", mime_type: "font/woff2", created_at: "now", url: "https://assets.test/fixed-success.woff2" }] as unknown as Awaited<ReturnType<typeof loadWorkspaceFonts>>);
    renderStudio(shape("copy", "text"));
    openTab("fonts");
    fireEvent.click(await screen.findByRole("button", { name: /Fixed Success/ }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({ descriptors: { style: "normal", weight: "500" } })));
    cleanup();

    const link = document.createElement("link");
    link.dataset.kumoFont = "Manrope";
    document.head.append(link);
    renderStudio(shape("copy-2", "text"));
    openTab("fonts");
    fireEvent.click(screen.getByRole("button", { name: /^Manrope/ }));
    await waitFor(() => expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ fontFamily: "Manrope" }));
    link.remove();
  });

  it("covers empty paint arrays, sticky defaults, table defaults, and typed upload errors", async () => {
    renderStudio(shape("empty-paint", "rectangle", { fills: undefined, strokes: undefined, backgroundColor: undefined, borderColor: undefined, borderWidth: undefined, borderRadius: undefined, cornerRadii: undefined }));
    openTab("style");
    fireEvent.click(screen.getByRole("button", { name: "Add fill" }));
    fireEvent.click(screen.getByRole("button", { name: "Add gradient" }));
    fireEvent.click(screen.getByRole("button", { name: "Add stroke" }));
    fireEvent.change(screen.getByLabelText("top Left"), { target: { value: "3" } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ strokes: [expect.objectContaining({ color: "#17181a", width: 1 })] }));
    cleanup();

    renderStudio(shape("sticky-frame", "frame", { prototypePosition: "sticky", prototypeStickyOffset: undefined }));
    openTab("prototype");
    expect(screen.getByLabelText("Sticky offset")).toHaveValue(0);
    cleanup();

    renderStudio(shape("empty-table", "table", { tableCells: undefined }));
    openTab("import");
    expect(screen.getByLabelText("Edit selected table as CSV")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Edit selected table as CSV"), { target: { value: " " } });
    expect(mocks.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ columns: 1 }));
    cleanup();

    vi.mocked(uploadWorkspaceFont).mockRejectedValueOnce(new Error("Upload unavailable"));
    renderStudio(shape("font-copy", "text"));
    openTab("fonts");
    fireEvent.change(screen.getByLabelText("Family name"), { target: { value: "Unavailable" } });
    fireEvent.change(screen.getByLabelText("Font file"), { target: { files: [new File(["bad"], "bad.woff2", { type: "font/woff2" })] } });
    expect(await screen.findByText("Upload unavailable")).toBeInTheDocument();
  });
});
