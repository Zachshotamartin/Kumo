import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("../../services/assetRepository", () => ({
  uploadBoardImage: mocks.upload,
  deleteBoardAsset: mocks.remove,
}));

vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => ({
    canEdit: true,
    commitShapes: mocks.commitShapes,
  }),
}));

describe("EditorToolbar image uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
      width: 100,
      height: 80,
      close: vi.fn(),
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the canvas tools with the shared vector icon system", () => {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        whiteBoard: whiteBoardReducer,
        actions: actionsReducer,
        selected: selectedReducer,
        editor: editorReducer,
      },
    });
    store.dispatch(setWhiteboardData({ id: "board-a", role: "owner", shapes: [] }));
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
    const store = configureStore({
      reducer: {
        auth: authReducer,
        whiteBoard: whiteBoardReducer,
        actions: actionsReducer,
        selected: selectedReducer,
        editor: editorReducer,
      },
    });
    store.dispatch(setWhiteboardData({ id: "board-a", role: "owner", shapes: [] }));
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
});
