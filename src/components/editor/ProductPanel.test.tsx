import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import ProductPanel from "./ProductPanel";

const mocks = vi.hoisted(() => ({
  actions: { canEdit: true, commitShapes: vi.fn(), commitBoardPatch: vi.fn() },
  graph: vi.fn(), libraries: vi.fn(), templates: vi.fn(), publish: vi.fn(), diff: vi.fn(), apply: vi.fn(), createTemplate: vi.fn(), extensions: vi.fn(),
  libraryVersions: vi.fn(), govern: vi.fn(), installExtension: vi.fn(), publishExtension: vi.fn(), toggleExtension: vi.fn(), uninstallExtension: vi.fn(), publishCommunity: vi.fn(), unpublishCommunity: vi.fn(),
  syncEvents: vi.fn(),
}));

vi.mock("../../editor/useEditorActions", () => ({ useEditorActions: () => mocks.actions }));
vi.mock("../../services/productRepository", () => ({
  loadProductGraph: mocks.graph,
  loadLibraries: mocks.libraries,
  loadTemplates: mocks.templates,
  publishLibrary: mocks.publish,
  loadLibraryDiff: mocks.diff,
  applyLibrary: mocks.apply,
  createTemplate: mocks.createTemplate,
  loadLibraryVersions: mocks.libraryVersions,
  governLibraryRelease: mocks.govern,
}));
vi.mock("../../services/platformRepository", () => ({
  loadExtensions: mocks.extensions,
  installExtension: mocks.installExtension, publishExtension: mocks.publishExtension, toggleExtension: mocks.toggleExtension, uninstallExtension: mocks.uninstallExtension,
  publishCommunity: mocks.publishCommunity, unpublishCommunity: mocks.unpublishCommunity,
}));
vi.mock("../../collaboration/offlineJournal", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../collaboration/offlineJournal")>(),
  readSyncEvents: mocks.syncEvents,
}));
vi.mock("./ProductCoveragePanel", () => ({ default: () => <div>Coverage tools</div> }));

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 100, y2: 60,
  width: 100, height: 60, level: 0, zIndex: 1, parentId: null, ...patch,
});

const defaultShapes = [
  shape("copy", { type: "text", name: "Hero copy", text: "Launch Kumo", color: "#777777", backgroundColor: "#888888" }),
  shape("image", { type: "image" }),
  shape("link", { type: "board", boardId: "destination", title: "Roadmap" }),
];

const makeStore = (board: Record<string, unknown> = {}) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", role: "owner", title: "Product", type: "private", uid: "owner",
    shapes: defaultShapes,
    ...board,
  }));
  store.dispatch(setSelectedShapes(["copy"]));
  return store;
};

describe("ProductPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actions.canEdit = true;
    window.localStorage.clear();
    mocks.graph.mockResolvedValue({
      sourceId: "board",
      nodes: [
        { id: "board", title: "Product", visibility: "private", accessible: true, manageable: true },
        { id: "destination", title: "Roadmap", visibility: "private", accessible: false, manageable: false },
      ],
      edges: [{ sourceId: "board", targetId: "destination", shapeId: "link" }], incoming: [],
    });
    mocks.libraries.mockResolvedValue({ libraries: [{ id: "library", source_board_id: "other", owner_id: "owner", name: "System", description: "", visibility: "public", latest_version: 2, updated_at: new Date().toISOString() }], subscriptions: [{ library_id: "library", accepted_version: 1 }] });
    mocks.templates.mockResolvedValue([{ id: "template", owner_id: "owner", source_board_id: "board", name: "Starter", description: "", visibility: "private", created_at: "", updated_at: "" }]);
    mocks.publish.mockResolvedValue({ libraryId: "library", version: 3, assetCount: 4 });
    mocks.diff.mockResolvedValue({ version: 2, diff: [{ sourceId: "component", status: "changed" }] });
    mocks.apply.mockResolvedValue({ applied: true, version: 2, diff: [] });
    mocks.createTemplate.mockResolvedValue({ template: { id: "new-template", name: "Product" } });
    mocks.extensions.mockResolvedValue([]);
    mocks.libraryVersions.mockResolvedValue({ versions: [] });
    mocks.govern.mockResolvedValue({ updated: true });
    mocks.publishCommunity.mockResolvedValue({ publication: { slug: "product-system" } });
    mocks.unpublishCommunity.mockResolvedValue({ unpublished: true });
    mocks.installExtension.mockResolvedValue({ installed: true, permissions: [] });
    mocks.publishExtension.mockResolvedValue({ extension: { id: "published" } });
    mocks.toggleExtension.mockResolvedValue({ enabled: false });
    mocks.uninstallExtension.mockResolvedValue({ uninstalled: true });
    mocks.syncEvents.mockResolvedValue([]);
  });

  it("renders a permission-aware board graph with broken-link health", async () => {
    const store = makeStore();
    render(<Provider store={store}><ProductPanel /></Provider>);
    expect((await screen.findAllByText("Roadmap"))[0]).toBeVisible();
    expect(screen.getByText("Broken").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("img", { name: "2 connected boards and 1 links" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Roadmap/ }));
    expect(store.getState().selected.selectedShapes).toEqual(["link"]);
  });

  it("opens the integrated product coverage workspace", async () => {
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "coverage" }));
    expect(screen.getByText("Coverage tools")).toBeVisible();
  });

  it("finds, selects, and replaces text across the document", async () => {
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "find" }));
    fireEvent.change(screen.getByLabelText("Find layers, text, tokens, annotations, and board links"), { target: { value: "Launch" } });
    fireEvent.change(screen.getByLabelText("Replace text with"), { target: { value: "Ship" } });
    expect(screen.getByText(/text · Launch Kumo/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Replace all text" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "copy", text: "Ship Kumo" })]));
  });

  it("audits accessibility and runs permission-scoped extension commands", async () => {
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "accessibility" }));
    expect(screen.getByText("Images need alternative text.")).toBeVisible();
    expect(screen.getByText(/Text contrast is/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Images need alternative text/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fix all safe issues" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "image", altText: expect.any(String) })]));
    fireEvent.click(screen.getByRole("tab", { name: "extensions" }));
    fireEvent.change(screen.getByLabelText("Command value"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename selection" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "image", name: "Renamed" })]));
  });

  it("reports mounted document complexity and publishes a community board", async () => {
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "performance" }));
    expect(screen.getByText("Complexity")).toBeVisible();
    expect(screen.getByText("This board is within the healthy interactive budget.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "publish" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A reusable product system" } });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "design, , tools" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish board" }));
    await waitFor(() => expect(mocks.publishCommunity).toHaveBeenCalledWith("board", expect.objectContaining({ description: "A reusable product system", tags: ["design", "tools"] })));
  });

  it("publishes, reviews, applies library changes, and creates templates", async () => {
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "libraries" }));
    fireEvent.click(screen.getByRole("button", { name: /Publish update/ }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledWith("board", "library"));
    fireEvent.click(screen.getByRole("button", { name: "Save board as template" }));
    await waitFor(() => expect(mocks.createTemplate).toHaveBeenCalled());
  });

  it("restores or discards an offline snapshot", async () => {
    window.localStorage.setItem("kumo:recovery:board", JSON.stringify({ boardId: "board", savedAt: Date.now(), baseRevision: 1, baseBackgroundColor: "#313131", backgroundColor: "#000", baseShapes: [], shapes: [shape("recovered")] }));
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    expect(await screen.findByRole("heading", { name: /Offline recovery/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Merge recovery" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "recovered" })]));
    expect(mocks.actions.commitBoardPatch).toHaveBeenCalledWith({ backGroundColor: "#000" });
    expect(window.localStorage.getItem("kumo:recovery:board")).toBeNull();
  });

  it("shows durable offline sync history in the recovery tools", async () => {
    mocks.syncEvents.mockResolvedValueOnce([
      { id: 1, boardId: "board", status: "failed", at: 1, detail: "1 queued mutation remains" },
      { boardId: "board", status: "synced", at: 2 },
    ]);
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    fireEvent.click(screen.getByRole("tab", { name: "recovery" }));
    expect(await screen.findByText("Sync history")).toBeVisible();
    expect(await screen.findByText("failed")).toBeVisible();
    expect(screen.getByText(/1 queued mutation remains/)).toBeVisible();
    expect(screen.getByText("synced")).toBeVisible();
  });

  it("handles active and stale sync-history failures", async () => {
    mocks.syncEvents.mockRejectedValueOnce(new Error("journal unavailable"));
    const active = render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    fireEvent.click(screen.getByRole("tab", { name: "recovery" }));
    expect(await screen.findByText("No offline sync activity has been recorded.")).toBeVisible();
    active.unmount();

    let rejectSync: (reason: unknown) => void = () => undefined;
    mocks.syncEvents.mockImplementationOnce(() => new Promise((_, reject) => { rejectSync = reject; }));
    const stale = render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    fireEvent.click(screen.getByRole("tab", { name: "recovery" }));
    stale.unmount();
    await act(async () => { rejectSync(new Error("late")); await Promise.resolve(); });
  });

  it("reviews named and unnamed recovery conflicts without replacing a remotely changed background", async () => {
    const base = [
      shape("named", { name: "Base named" }),
      shape("board-named", { name: "Base board name" }),
      shape("unnamed", { name: "Base unnamed" }),
    ];
    const remote = [
      shape("named", { name: "Remote named" }),
      shape("board-named", { name: "Current board name" }),
      shape("unnamed", { name: undefined, x1: 5 }),
    ];
    const local = [
      shape("named", { name: "Offline named" }),
      shape("board-named", { name: undefined }),
      shape("unnamed", { name: undefined, x1: 10 }),
    ];
    window.localStorage.setItem("kumo:recovery:board", JSON.stringify({
      boardId: "board", savedAt: Date.now(), baseRevision: 1,
      baseBackgroundColor: "#313131", backgroundColor: "#000000", baseShapes: base, shapes: local,
    }));
    render(<Provider store={makeStore({ backGroundColor: "#222222", shapes: remote })}><ProductPanel /></Provider>);
    expect(await screen.findByText("Offline named")).toBeVisible();
    expect(screen.getByText("Current board name")).toBeVisible();
    expect(screen.getByText("unnamed")).toBeVisible();
    const keepCurrent = screen.getAllByRole("button", { name: "Keep current" });
    const useOffline = screen.getAllByRole("button", { name: "Use offline" });
    fireEvent.click(keepCurrent[0]!);
    fireEvent.click(useOffline[1]!);
    expect(keepCurrent[0]).toHaveAttribute("aria-pressed", "true");
    expect(useOffline[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Merge recovery" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
    expect(mocks.actions.commitBoardPatch).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("with 3 reviewed conflicts");
  });

  it("governs semantic library releases through approval, rollback, and deprecation", async () => {
    mocks.libraryVersions.mockResolvedValue({ versions: [
      { library_id: "library", version: 3, semantic_version: "2.0.0", release_status: "review", description: "Breaking update", assets: [], created_by: "owner", created_at: "" },
      { library_id: "library", version: 2, semantic_version: "1.0.0", release_status: "deprecated", description: "Old", assets: [], created_by: "owner", created_at: "" },
    ] });
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "libraries" }));
    fireEvent.click(screen.getByRole("button", { name: "Releases" }));
    expect(await screen.findByText("v2.0.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.govern).toHaveBeenCalledWith("approve-library-release", "library", 3));
    fireEvent.click(screen.getAllByRole("button", { name: "Make current" })[0]!);
    await waitFor(() => expect(mocks.govern).toHaveBeenCalledWith("rollback-library", "library", 3));
    fireEvent.click(screen.getByRole("button", { name: "Deprecate" }));
    await waitFor(() => expect(mocks.govern).toHaveBeenCalledWith("deprecate-library-release", "library", 3));
  });

  it("installs, executes, toggles, removes, and publishes declarative extensions", async () => {
    const catalog = [
      { id: "enabled", name: "Enabled extension", description: "", verified: true, publisher_id: "owner", updated_at: "", manifest: { id: "enabled", name: "Enabled extension", permissions: ["read-document", "write-document"], commands: [{ id: "rename", name: "Catalog rename", operation: "rename-selected" }] }, installed_extensions: [{ user_id: "owner", granted_permissions: ["read-document", "write-document"], enabled: true }] },
      { id: "available", name: "Available extension", description: "", verified: true, publisher_id: "owner", updated_at: "", manifest: { id: "available", name: "Available extension", permissions: ["read-document"], commands: [] }, installed_extensions: [] },
    ];
    mocks.extensions.mockResolvedValue(catalog);
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "extensions" }));
    fireEvent.click(screen.getByRole("button", { name: "Catalog rename" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(mocks.toggleExtension).toHaveBeenCalledWith("enabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    await waitFor(() => expect(mocks.uninstallExtension).toHaveBeenCalledWith("enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(mocks.installExtension).toHaveBeenCalledWith("available", ["read-document"]));
    fireEvent.click(screen.getByRole("button", { name: "Publish extension" }));
    await waitFor(() => expect(mocks.publishExtension).toHaveBeenCalledWith(expect.objectContaining({ id: "kumo.quick-edit" }), "Published from Product"));
  });

  it("unpublishes community work, discards recovery data, closes, and reports invalid extension manifests", async () => {
    window.localStorage.setItem("kumo:recovery:board", JSON.stringify({ boardId: "board", savedAt: Date.now(), baseRevision: 1, baseBackgroundColor: "#313131", backgroundColor: "#000", baseShapes: [], shapes: [shape("recovered")] }));
    const store = makeStore();
    render(<Provider store={store}><ProductPanel /></Provider>);
    expect(await screen.findByRole("heading", { name: /Offline recovery/ })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(mocks.unpublishCommunity).toHaveBeenCalledWith("board"));
    fireEvent.click(screen.getByRole("tab", { name: "recovery" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(window.localStorage.getItem("kumo:recovery:board")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "extensions" }));
    fireEvent.change(screen.getByLabelText("Publish a declarative manifest"), { target: { value: "not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish extension" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close product tools" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
  });

  it("handles graph inconsistencies, accessible links, and missing local board layers", async () => {
    mocks.graph.mockResolvedValue({
      sourceId: "board",
      nodes: [
        { id: "board", title: "A very long current board title", visibility: "private", accessible: true, manageable: false },
        { id: "remote", title: "Remote", visibility: "public", accessible: true, manageable: true },
      ],
      edges: [
        { sourceId: "board", targetId: "remote", shapeId: "remote-link" },
        { sourceId: "missing", targetId: "remote", shapeId: "bad-source" },
        { sourceId: "board", targetId: "missing", shapeId: "bad-target" },
      ],
      incoming: [{ sourceId: "remote", targetId: "board", shapeId: "incoming" }],
    });
    const view = render(<Provider store={makeStore({ shapes: [] })}><ProductPanel /></Provider>);
    expect(await screen.findByRole("img", { name: "2 connected boards and 3 links" })).toBeInTheDocument();
    expect(screen.getByText("Backlinks").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Remote/ })).toBeDisabled();
    expect(view.container.querySelectorAll("line")).toHaveLength(1);
  });

  it("shows empty search and clean accessibility states and selects a result", async () => {
    const store = makeStore({ shapes: [shape("clean", { name: "Clean layer", width: 100, height: 100 })] });
    render(<Provider store={store}><ProductPanel /></Provider>);
    await screen.findByRole("img", { name: /connected boards/ });
    fireEvent.click(screen.getByRole("tab", { name: "find" }));
    fireEvent.change(screen.getByLabelText("Find layers, text, tokens, annotations, and board links"), { target: { value: "missing" } });
    expect(screen.getByText("No document matches.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find layers, text, tokens, annotations, and board links"), { target: { value: "Clean" } });
    fireEvent.click(screen.getByRole("button", { name: /Clean layer/ }));
    expect(store.getState().selected.selectedShapes).toEqual(["clean"]);
    fireEvent.click(screen.getByRole("tab", { name: "accessibility" }));
    expect(screen.getByText("No accessibility findings.")).toBeInTheDocument();
  });

  it("covers draft releases, current libraries, unchanged diffs, and release display fallbacks", async () => {
    mocks.libraries.mockResolvedValue({
      libraries: [
        { id: "library", source_board_id: "other", owner_id: "owner", name: "Current", description: "", visibility: "public", latest_version: 2, updated_at: "" },
        { id: "new", source_board_id: "other", owner_id: "other", name: "New", description: "", visibility: "public", latest_version: 1, updated_at: "" },
        { id: "self", source_board_id: "board", owner_id: "owner", name: "Self", description: "", visibility: "public", latest_version: 1, updated_at: "" },
      ],
      subscriptions: [{ library_id: "library", accepted_version: 2 }, { library_id: "self", accepted_version: 1 }],
    });
    mocks.diff.mockResolvedValueOnce({ version: 2, diff: [{ sourceId: "same", status: "unchanged" }] });
    mocks.libraryVersions.mockResolvedValue({ versions: [
      { library_id: "library", version: 3, semantic_version: null, release_status: "published", description: "", assets: [], created_by: "owner", created_at: "" },
      { library_id: "library", version: 2, semantic_version: "1.5.0", release_status: "deprecated", description: "Old", assets: [], created_by: "owner", created_at: "" },
    ] });
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "libraries" }));
    expect(screen.getByText(/v2 · up to date/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Update" })[1]).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Library name"), { target: { value: "New system" } });
    fireEvent.change(screen.getByLabelText("Release notes"), { target: { value: "First\n\nSecond" } });
    fireEvent.change(screen.getByLabelText("Semantic version"), { target: { value: "2.0.0-beta.1" } });
    fireEvent.change(screen.getByLabelText("Release state"), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Create release" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith("board", expect.objectContaining({
      name: "New system",
      semanticVersion: "2.0.0-beta.1",
      releaseStatus: "draft",
      changelog: ["First", "Second"],
    })));
    expect(await screen.findByText(/Created version/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Update" })[0]!);
    expect(await screen.findByText("This library is already current.")).toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Releases" })[0]!);
    expect(await screen.findByText("v3")).toBeInTheDocument();
    expect(screen.getByText("published · No release notes")).toBeInTheDocument();
    expect(screen.getByText("deprecated · Old")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Make current" })[0]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Make current" })[1]).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Make current" })[0]!);
    await waitFor(() => expect(mocks.govern).toHaveBeenCalledWith("rollback-library", "library", 3));
  });

  it("covers extension permission states and developer catalog activation", async () => {
    mocks.actions.canEdit = false;
    mocks.extensions.mockResolvedValue([
      { id: "disabled", name: "Disabled", description: "", verified: false, publisher_id: "owner", updated_at: "", manifest: { id: "disabled", name: "Disabled", permissions: [], commands: [] }, installed_extensions: [{ user_id: "owner", granted_permissions: [], enabled: false }] },
      { id: "fresh", name: "Fresh", description: "Useful", verified: true, publisher_id: "owner", updated_at: "", manifest: { id: "fresh", name: "Fresh", permissions: [], commands: [] } },
    ]);
    const store = makeStore({ title: null });
    store.dispatch(setSelectedShapes([]));
    render(<Provider store={store}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "libraries" }));
    fireEvent.click(screen.getByRole("button", { name: "Save board as template" }));
    await waitFor(() => expect(mocks.createTemplate).toHaveBeenCalledWith("board", "Board template", "Reusable board starting point", "private"));
    fireEvent.click(screen.getByRole("tab", { name: "extensions" }));
    expect(screen.getByRole("button", { name: "Rename selection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create rectangle" })).toBeDisabled();
    expect(screen.getByText(/Developer build · No description/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(mocks.toggleExtension).toHaveBeenCalledWith("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(mocks.installExtension).toHaveBeenCalledWith("fresh", []));
    fireEvent.click(screen.getByRole("button", { name: "Publish extension" }));
    await waitFor(() => expect(mocks.publishExtension).toHaveBeenCalledWith(expect.any(Object), "Published from Kumo"));
  });

  it("runs create-rectangle without a selection and renders watch and heavy performance guidance", async () => {
    const watchShape = shape("vector", { vectorPoints: Array.from({ length: 15_010 }, (_, index) => ({ id: `watch-${index}`, x: index, y: index })) });
    const watchStore = makeStore({ shapes: [watchShape] });
    watchStore.dispatch(setSelectedShapes([]));
    const first = render(<Provider store={watchStore}><ProductPanel /></Provider>);
    await screen.findByRole("img", { name: /connected boards/ });
    fireEvent.click(screen.getByRole("tab", { name: "extensions" }));
    expect(screen.getByRole("button", { name: "Rename selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Create rectangle" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "performance" }));
    expect(screen.getByText("Consider splitting dense sections into linked boards.")).toBeInTheDocument();
    first.unmount();

    const heavyShape = shape("heavy", { vectorPoints: Array.from({ length: 50_010 }, (_, index) => ({ id: `heavy-${index}`, x: index, y: index })) });
    render(<Provider store={makeStore({ shapes: [heavyShape] })}><ProductPanel /></Provider>);
    await screen.findByRole("img", { name: /connected boards/ });
    fireEvent.click(screen.getByRole("tab", { name: "performance" }));
    expect(screen.getByText(/This board is heavy/)).toBeInTheDocument();
  });

  it("handles missing board guards and normalizes community tags", async () => {
    const store = makeStore({ id: null, roomId: null, title: null, shapes: [] });
    render(<Provider store={store}><ProductPanel /></Provider>);
    expect(screen.getByText("Loading graph…")).toBeInTheDocument();
    expect(mocks.graph).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "coverage" }));
    expect(screen.getByText("Coverage tools")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "libraries" }));
    expect(screen.getByLabelText("Library name")).toHaveValue("Kumo library");
    fireEvent.click(screen.getByRole("button", { name: /Publish update/ }));
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "publish" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Community" } });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "design, , tools" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish board" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(mocks.publishCommunity).not.toHaveBeenCalled();
    expect(mocks.unpublishCommunity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "recovery" }));
    expect(screen.getByText("No local recovery snapshot is waiting.")).toBeInTheDocument();
  });

  it("reports initial and operation failures and ignores stale initialization", async () => {
    mocks.graph.mockRejectedValueOnce("offline");
    const failed = render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Product tools could not be loaded.");
    failed.unmount();

    mocks.unpublishCommunity.mockRejectedValueOnce("nope");
    const operation = render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The operation failed.");
    operation.unmount();

    let finish: (value: unknown) => void = () => undefined;
    mocks.graph.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const stale = render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    stale.unmount();
    await act(async () => {
      finish({ sourceId: "board", nodes: [], edges: [], incoming: [] });
      await Promise.resolve();
    });

    let reject: (reason: unknown) => void = () => undefined;
    mocks.graph.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const staleFailure = render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    staleFailure.unmount();
    await act(async () => {
      reject(new Error("late"));
      await Promise.resolve();
    });
  });
});
