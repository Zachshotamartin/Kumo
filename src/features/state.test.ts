import type { Shape } from "../classes/shape";
import editorReducer, {
  commitEditorSnapshot,
  initializeEditor,
  redoEditor,
  setClipboard,
  setEditingShapeId,
  setGridSize,
  setHoveredShapeId,
  setLocalPreviewActive,
  setSaveStatus,
  setSelectedThreadId,
  setSnapToGrid,
  setViewport,
  undoEditor,
} from "./editor/editorSlice";
import selectedReducer, {
  addSelectedShape,
  clearHover,
  clearSelectedShapes,
  setBorderEndX,
  setBorderEndY,
  setBorderStartX,
  setBorderStartY,
  setHighlightEnd,
  setHighlightStart,
  setHoverEndX,
  setHoverEndY,
  setHoverStartX,
  setHoverStartY,
  setSelectedShapes,
  setSelectedTool,
  setSelectionRotation,
} from "./selected/selectedSlice";
import whiteBoardReducer, {
  hydrateShapeAssets,
  removeShare,
  replaceCollaborativeShapes,
  replaceShapes,
  setCurrentUsers,
  setLastChangedBy,
  setWhiteboardData,
  share,
  updateBackgroundColor,
  updateTitle,
  updateVisibility,
} from "./whiteBoard/whiteBoardSlice";
import actionsReducer, { setGrid } from "./actions/actionsSlice";
import authReducer, { login, logout, setAuthenticatedProfile, setAuthInitialized } from "./auth/authSlice";

const shape = (id: string, assetId?: string, backgroundImage?: string): Shape => ({
  id,
  type: "image",
  x1: 0,
  y1: 0,
  x2: 20,
  y2: 20,
  width: 20,
  height: 20,
  level: 0,
  zIndex: 1,
  assetId,
  backgroundImage,
});

describe("editor state invariants", () => {
  it("scopes clipboard content to its source board", () => {
    const state = editorReducer(undefined, setClipboard({
      shapes: [shape("one", "asset")],
      boardId: "board-a",
    }));
    expect(state.clipboardBoardId).toBe("board-a");
    expect(state.clipboard).toEqual([expect.objectContaining({ id: "one" })]);
  });

  it("tracks previews and resets them when the editor changes boards", () => {
    let state = editorReducer(undefined, setLocalPreviewActive(true));
    state = editorReducer(state, setSaveStatus({ status: "error", error: "failed" }));
    state = editorReducer(state, initializeEditor({
      boardId: "board-b",
      shapes: [],
      backgroundColor: "#000",
    }));
    expect(state.localPreviewActive).toBe(false);
    expect(state.saveError).toBeNull();
    expect(editorReducer(state, setGridSize(0)).gridSize).toBe(1);
  });

  it("updates editor view, interaction, and history state", () => {
    expect(editorReducer(undefined, undoEditor()).history).toBeNull();
    expect(editorReducer(undefined, redoEditor()).history).toBeNull();
    let state = editorReducer(undefined, setViewport({ x: 1, y: 2, zoom: 3 }));
    state = editorReducer(state, setHoveredShapeId("a"));
    state = editorReducer(state, setEditingShapeId("a"));
    state = editorReducer(state, setSnapToGrid(true));
    state = editorReducer(state, commitEditorSnapshot({ boardId: "board", shapes: [], backgroundColor: "#fff" }));
    state = editorReducer(state, undoEditor());
    state = editorReducer(state, redoEditor());
    expect(state).toMatchObject({
      viewport: { x: 1, y: 2, zoom: 3 }, hoveredShapeId: "a", editingShapeId: "a", snapToGrid: true,
    });
    expect(state.history).not.toBeNull();
    state = editorReducer(state, setSelectedThreadId("thread"));
    expect(state).toMatchObject({ selectedThreadId: "thread", rightPanel: "comments" });
    state = editorReducer(state, setSelectedThreadId(null));
    expect(state.selectedThreadId).toBeNull();
  });

  it("retains multi-selection rotation only while the same selection remains", () => {
    let state = selectedReducer(undefined, setSelectedShapes(["a", "b"]));
    state = selectedReducer(state, setSelectionRotation(35));
    state = selectedReducer(state, setSelectedShapes(["b", "a", "a"]));
    expect(state.selectionRotation).toBe(35);
    state = selectedReducer(state, setSelectedShapes(["a"]));
    expect(state.selectionRotation).toBe(0);
    expect(selectedReducer(state, clearSelectedShapes()).selectionRotation).toBe(0);
  });

  it("updates every selection gesture field", () => {
    let state = selectedReducer(undefined, setSelectedTool("rectangle"));
    state = selectedReducer(state, addSelectedShape("a"));
    state = selectedReducer(state, addSelectedShape("a"));
    state = selectedReducer(state, setHighlightStart([1, 2]));
    state = selectedReducer(state, setHighlightEnd([3, 4]));
    state = selectedReducer(state, setBorderStartX(1));
    state = selectedReducer(state, setBorderStartY(2));
    state = selectedReducer(state, setBorderEndX(3));
    state = selectedReducer(state, setBorderEndY(4));
    state = selectedReducer(state, setHoverStartX(5));
    state = selectedReducer(state, setHoverStartY(6));
    state = selectedReducer(state, setHoverEndX(7));
    state = selectedReducer(state, setHoverEndY(8));
    state = selectedReducer(state, clearHover());
    expect(state.selectedShapes).toEqual(["a"]);
    expect(state.highlightEnd).toEqual([3, 4]);
    expect(state.hoverStartX).toBe(-100000);
  });

  it("updates authentication and canvas preferences", () => {
    let auth = authReducer(undefined, setAuthInitialized());
    auth = authReducer(auth, login({ uid: "user", email: "user@example.com" }));
    auth = authReducer(auth, setAuthenticatedProfile({ displayName: "User", username: "user", avatarUrl: "https://example.com/avatar.png" }));
    expect(auth.isAuthenticated).toBe(true);
    expect(auth).toMatchObject({ displayName: "User", username: "user", avatarUrl: "https://example.com/avatar.png" });
    auth = authReducer(auth, login({ uid: "user", email: "updated@example.com" }));
    expect(auth).toMatchObject({ displayName: "User", username: "user", avatarUrl: "https://example.com/avatar.png", email: "updated@example.com" });
    auth = authReducer(auth, login({ uid: "other", email: "other@example.com" }));
    expect(auth).toMatchObject({ displayName: null, username: null, avatarUrl: null });
    expect(authReducer(auth, logout()).isAuthenticated).toBe(false);
    expect(actionsReducer(undefined, setGrid(false)).grid).toBe(false);
  });
});

describe("collaborative document state", () => {
  it("preserves a hydrated URL while replacing the collaborative document", () => {
    let state = whiteBoardReducer(undefined, replaceShapes([
      shape("one", "asset-a", "signed-url"),
    ]));
    state = whiteBoardReducer(state, replaceCollaborativeShapes([
      shape("one", "asset-a"),
    ]));
    expect(state.shapes[0]!.backgroundImage).toBe("signed-url");
  });

  it("hydrates only a shape still referencing the requested asset", () => {
    let state = whiteBoardReducer(undefined, replaceShapes([
      shape("one", "asset-new"),
      shape("two", "asset-two"),
    ]));
    state = whiteBoardReducer(state, hydrateShapeAssets([
      { id: "one", assetId: "asset-old", url: "stale" },
      { id: "two", assetId: "asset-two", url: "fresh" },
    ]));
    expect(state.shapes[0]!.backgroundImage).toBeUndefined();
    expect(state.shapes[1]!.backgroundImage).toBe("fresh");
  });

  it("updates board metadata, access, and presence", () => {
    let state = whiteBoardReducer(undefined, setWhiteboardData({ id: "board", title: "Board" }));
    state = whiteBoardReducer(state, share({ uid: "member", role: "editor" }));
    state = whiteBoardReducer(state, share({ uid: "member", role: "viewer" }));
    state = whiteBoardReducer(state, updateBackgroundColor("#fff"));
    state = whiteBoardReducer(state, updateTitle("Updated"));
    state = whiteBoardReducer(state, updateVisibility("public"));
    state = whiteBoardReducer(state, setLastChangedBy("member"));
    state = whiteBoardReducer(state, setCurrentUsers([{ uid: "member", cursorX: 0, cursorY: 0 }]));
    state = whiteBoardReducer(state, removeShare("member"));
    expect(state).toMatchObject({
      id: "board", title: "Updated", type: "public", backGroundColor: "#fff", lastChangedBy: "member",
    });
    expect(state.currentUsers).toHaveLength(1);
    expect(state.sharedWith).toEqual([]);
  });
});
