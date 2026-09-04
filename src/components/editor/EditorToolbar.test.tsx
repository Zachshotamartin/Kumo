import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorToolbar from "./EditorToolbar";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  commitShapes: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  removeSelected: vi.fn(),
  canEdit: true,
  canUndo: true,
  canRedo: true,
}));

vi.mock("../../services/assetRepository", () => ({
  uploadBoardImage: mocks.upload,
  deleteBoardAsset: mocks.remove,
}));

vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => ({
    canEdit: mocks.canEdit,
    canUndo: mocks.canUndo,
    canRedo: mocks.canRedo,
    commitShapes: mocks.commitShapes,
    undo: mocks.undo,
    redo: mocks.redo,
    removeSelected: mocks.removeSelected,
  }),
}));

const makeStore = (board: Record<string, unknown> = {}) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(setWhiteboardData({ id: "board-a", role: "owner", shapes: [], ...board }));
  return store;
};

describe("EditorToolbar image uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canEdit = true;
    mocks.canUndo = true;
    mocks.canRedo = true;
    mocks.remove.mockResolvedValue(undefined);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
      width: 100,
      height: 80,
      close: vi.fn(),
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the canvas tools with the shared vector icon system", () => {
    const store = makeStore();
    const view = render(<Provider store={store}><EditorToolbar /></Provider>);
    expect(screen.getByRole("button", { name: "Rectangle tool (R)" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Linked board tool (B)" }).querySelector("svg")).toBeInTheDocument();
    expect(view.container.querySelectorAll("[role='toolbar'] svg").length).toBeGreaterThanOrEqual(10);
  });

  it("removes an uploaded asset if its board unmounts before completion", async () => {
    let finishUpload: (asset: Record<string, unknown>) => void = () => undefined;
    mocks.upload.mockImplementation(() => new Promise((resolve) => {
      finishUpload = resolve;
    }));
    const store = makeStore();
    const view = render(<Provider store={store}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "image.png", { type: "image/png" })] } });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    view.unmount();
    finishUpload({
      id: "asset",
      board_id: "board-a",
      storage_key: "board-a/asset.png",
      mime_type: "image/png",
      byte_size: 5,
      width: 100,
      height: 80,
      url: "signed",
    });
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("asset"));
    expect(mocks.commitShapes).not.toHaveBeenCalled();
  });

  it("selects tools, opens the image picker, and runs history actions", () => {
    const store = makeStore();
    const view = render(<Provider store={store}><EditorToolbar /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle tool (R)" }));
    expect(store.getState().selected.selectedTool).toBe("rectangle");
    expect(screen.getByRole("button", { name: "Rectangle tool (R)" })).toHaveAttribute("aria-pressed", "true");
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    const picker = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Image tool (I)" }));
    expect(picker).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected shapes" }));
    expect(mocks.undo).toHaveBeenCalled();
    expect(mocks.redo).toHaveBeenCalled();
    expect(mocks.removeSelected).toHaveBeenCalled();
  });

  it("disables unavailable actions and ignores uploads without an active board", () => {
    mocks.canEdit = false;
    mocks.canUndo = false;
    mocks.canRedo = false;
    const view = render(<Provider store={makeStore({ id: null })}><EditorToolbar /></Provider>);
    expect(screen.getByRole("button", { name: "Image tool (I)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "ignored.png", { type: "image/png" })] } });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("creates scaled image and GIF layers and clears the file input", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockResolvedValueOnce({ width: 1000, height: 500, close })
      .mockResolvedValueOnce({ width: 20, height: 10, close }));
    mocks.upload
      .mockResolvedValueOnce({ id: "large", width: 1000, height: 500, url: "large-url" })
      .mockResolvedValueOnce({ id: "gif", width: 0, height: 0, url: "gif-url" });
    const store = makeStore({ shapes: [{ id: "existing", type: "rectangle", x1: 0, y1: 0, x2: 10, y2: 10, width: 10, height: 10, level: 0, zIndex: 1 }] });
    const view = render(<Provider store={store}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "large.png", { type: "image/png" })] } });
    await waitFor(() => expect(mocks.commitShapes).toHaveBeenCalledTimes(1));
    expect(mocks.commitShapes).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ assetId: "large", width: 480, height: 240, mediaType: "image" })]));
    expect(store.getState().selected.selectedTool).toBe("pointer");
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { files: [new File(["gif"], "tiny.gif", { type: "image/gif" })] } });
    await waitFor(() => expect(mocks.commitShapes).toHaveBeenCalledTimes(2));
    expect(mocks.commitShapes).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ assetId: "gif", width: 40, height: 40, mediaType: "gif" })]));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("uses asset dimension defaults when metadata is absent", async () => {
    mocks.upload.mockResolvedValueOnce({ id: "fallback", width: null, height: null, url: "fallback-url" });
    const view = render(<Provider store={makeStore()}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "fallback.webp", { type: "image/webp" })] } });
    await waitFor(() => expect(mocks.commitShapes).toHaveBeenCalled());
    expect(mocks.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ width: 240, height: 180 })]));
  });

  it("reads video metadata, applies video defaults, and revokes the object URL", async () => {
    const createUrl = vi.fn(() => "blob:video");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const originalCreate = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const element = originalCreate(tag, options);
      if (tag !== "video") return element;
      Object.defineProperties(element, { videoWidth: { value: 0 }, videoHeight: { value: 0 } });
      Object.defineProperty(element, "src", { set: () => queueMicrotask(() => (element as HTMLVideoElement).onloadedmetadata?.(new Event("loadedmetadata"))) });
      return element;
    }) as typeof document.createElement);
    mocks.upload.mockResolvedValueOnce({ id: "video", width: 640, height: 360, url: "video-url" });
    const view = render(<Provider store={makeStore()}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["video"], "clip.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect(mocks.commitShapes).toHaveBeenCalled());
    expect(mocks.upload).toHaveBeenCalledWith("board-a", expect.any(File), { width: 640, height: 360 });
    expect(mocks.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ mediaType: "video", mediaMuted: true })]));
    expect(revokeUrl).toHaveBeenCalledWith("blob:video");
    createElement.mockRestore();
  });

  it("reports video, image, and unstructured upload errors", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:bad"), revokeObjectURL: vi.fn() }));
    const originalCreate = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const element = originalCreate(tag, options);
      if (tag === "video") Object.defineProperty(element, "src", { set: () => queueMicrotask(() => (element as HTMLVideoElement).onerror?.(new Event("error"))) });
      return element;
    }) as typeof document.createElement);
    const view = render(<Provider store={makeStore()}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["video"], "bad.webm", { type: "video/webm" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("This video could not be read.");
    createElement.mockRestore();

    vi.mocked(createImageBitmap).mockRejectedValueOnce("decode failed").mockRejectedValueOnce(new Error("Broken image"));
    fireEvent.change(input, { target: { files: [new File(["image"], "bad.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't upload this image.");
    fireEvent.change(input, { target: { files: [new File(["image"], "broken.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Broken image");
  });

  it("rejects a file whose type is outside the accepted media list", async () => {
    const view = render(<Provider store={makeStore()}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    expect(input.accept).toBe("image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm");
    fireEvent.change(input, { target: { files: [new File(["payload"], "payload.html", { type: "text/html" })] } });
    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Kumo accepts PNG, JPEG, WebP, GIF and SVG images, and MP4 or WebM video.");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("removes a completed upload after switching boards and tolerates cleanup failure", async () => {
    let finishUpload: (asset: Record<string, unknown>) => void = () => undefined;
    mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finishUpload = resolve; }));
    mocks.remove.mockRejectedValueOnce(new Error("cleanup unavailable"));
    const store = makeStore();
    const view = render(<Provider store={store}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "old.png", { type: "image/png" })] } });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    act(() => store.dispatch(setWhiteboardData({ id: "board-b" })));
    finishUpload({ id: "old-asset", width: 100, height: 80, url: "old-url" });
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("old-asset"));
    expect(mocks.commitShapes).not.toHaveBeenCalled();
  });

  it("suppresses decode errors after the toolbar unmounts", async () => {
    let rejectDecode: (reason: unknown) => void = () => undefined;
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((_, reject) => { rejectDecode = reject; })));
    const view = render(<Provider store={makeStore()}><EditorToolbar /></Provider>);
    const input = view.container.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "late.png", { type: "image/png" })] } });
    view.unmount();
    await act(async () => {
      rejectDecode(new Error("late decode"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
