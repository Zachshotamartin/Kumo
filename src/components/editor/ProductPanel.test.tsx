import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import ProductPanel from "./ProductPanel";

const mocks = vi.hoisted(() => ({
  actions: { canEdit: true, commitShapes: vi.fn() },
  graph: vi.fn(), libraries: vi.fn(), templates: vi.fn(), publish: vi.fn(), diff: vi.fn(), apply: vi.fn(), createTemplate: vi.fn(), extensions: vi.fn(),
  libraryVersions: vi.fn(), govern: vi.fn(), installExtension: vi.fn(), publishExtension: vi.fn(), toggleExtension: vi.fn(), uninstallExtension: vi.fn(), publishCommunity: vi.fn(), unpublishCommunity: vi.fn(),
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

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 100, y2: 60,
  width: 100, height: 60, level: 0, zIndex: 1, parentId: null, ...patch,
});

const makeStore = () => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", role: "owner", title: "Product", type: "private", uid: "owner",
    shapes: [
      shape("copy", { type: "text", name: "Hero copy", text: "Launch Kumo", color: "#777777", backgroundColor: "#888888" }),
      shape("image", { type: "image" }),
      shape("link", { type: "board", boardId: "destination", title: "Roadmap" }),
    ],
  }));
  store.dispatch(setSelectedShapes(["copy"]));
  return store;
};

describe("ProductPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    fireEvent.click(screen.getByRole("button", { name: "Fix all safe issues" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "image", altText: expect.any(String) })]));
    fireEvent.click(screen.getByRole("tab", { name: "extensions" }));
    fireEvent.change(screen.getByLabelText("Command value"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename selection" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "copy", name: "Renamed" })]));
  });

  it("reports mounted document complexity and publishes a community board", async () => {
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "performance" }));
    expect(screen.getByText("Complexity")).toBeVisible();
    expect(screen.getByText("This board is within the healthy interactive budget.")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "publish" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A reusable product system" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish board" }));
    await waitFor(() => expect(mocks.publishCommunity).toHaveBeenCalledWith("board", expect.objectContaining({ description: "A reusable product system", tags: ["design", "collaboration"] })));
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
    window.localStorage.setItem("kumo:recovery:board", JSON.stringify({ boardId: "board", savedAt: Date.now(), baseRevision: 1, backgroundColor: "#000", shapes: [shape("recovered")] }));
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "recovery" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore snapshot" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith([expect.objectContaining({ id: "recovered" })]);
    expect(window.localStorage.getItem("kumo:recovery:board")).toBeNull();
  });

  it("governs semantic library releases through approval, rollback, and deprecation", async () => {
    mocks.libraryVersions.mockResolvedValue({ versions: [{ library_id: "library", version: 3, semantic_version: "2.0.0", release_status: "review", description: "Breaking update", assets: [], created_by: "owner", created_at: "" }] });
    render(<Provider store={makeStore()}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
    fireEvent.click(screen.getByRole("tab", { name: "libraries" }));
    fireEvent.click(screen.getByRole("button", { name: "Releases" }));
    expect(await screen.findByText("v2.0.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.govern).toHaveBeenCalledWith("approve-library-release", "library", 3));
    fireEvent.click(screen.getByRole("button", { name: "Make current" }));
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
    window.localStorage.setItem("kumo:recovery:board", JSON.stringify({ boardId: "board", savedAt: Date.now(), baseRevision: 1, backgroundColor: "#000", shapes: [shape("recovered")] }));
    const store = makeStore();
    render(<Provider store={store}><ProductPanel /></Provider>);
    await screen.findAllByText("Roadmap");
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
});
