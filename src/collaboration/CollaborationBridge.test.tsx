import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer, { setLocalPreviewActive } from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { replaceShapes } from "../features/whiteBoard/whiteBoardSlice";
import type { Shape } from "../classes/shape";
import CollaborationBridge from "./CollaborationBridge";

const collaboration = vi.hoisted(() => ({
  nodes: new Map<string, Record<string, unknown>>(),
  backgroundColor: "#252629",
  others: [] as Array<Record<string, unknown>>,
  resolveAssetUrl: vi.fn<(assetId: string) => Promise<string>>(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useStorage: (selector: (root: typeof collaboration) => unknown) => selector(collaboration),
  useOthers: () => collaboration.others,
}));

vi.mock("../services/assetRepository", () => ({
  resolveAssetUrl: collaboration.resolveAssetUrl,
}));

const shape = (text: string, assetId?: string): Shape => ({
  id: "shape",
  type: assetId ? "image" : "text",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 40,
  width: 100,
  height: 40,
  level: 0,
  zIndex: 1,
  text,
  assetId,
});

const makeStore = () => configureStore({
  reducer: {
    auth: authReducer,
    whiteBoard: whiteBoardReducer,
    actions: actionsReducer,
    selected: selectedReducer,
    editor: editorReducer,
  },
});

describe("CollaborationBridge", () => {
  beforeEach(() => {
    collaboration.nodes = new Map();
    collaboration.others = [];
    collaboration.resolveAssetUrl.mockReset();
  });

  it("does not overwrite an active local preview and catches up afterward", async () => {
    collaboration.nodes.set("shape", shape("remote") as unknown as Record<string, unknown>);
    const store = makeStore();
    store.dispatch(replaceShapes([shape("local draft")]));
    store.dispatch(setLocalPreviewActive(true));
    render(<Provider store={store}><CollaborationBridge /></Provider>);
    expect(store.getState().whiteBoard.shapes[0]!.text).toBe("local draft");

    act(() => { store.dispatch(setLocalPreviewActive(false)); });
    await waitFor(() => {
      expect(store.getState().whiteBoard.shapes[0]!.text).toBe("remote");
    });
  });

  it("hydrates only the asset that is still attached when the request resolves", async () => {
    let resolveUrl: (url: string) => void = () => undefined;
    collaboration.resolveAssetUrl.mockImplementation(() => new Promise((resolve) => {
      resolveUrl = resolve;
    }));
    collaboration.nodes.set("shape", shape("", "asset-old") as unknown as Record<string, unknown>);
    const store = makeStore();
    render(<Provider store={store}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(collaboration.resolveAssetUrl).toHaveBeenCalledWith("asset-old"));
    act(() => {
      store.dispatch(replaceShapes([shape("", "asset-new")]));
      resolveUrl("signed-old");
    });
    await Promise.resolve();
    expect(store.getState().whiteBoard.shapes[0]!.assetId).toBe("asset-new");
    expect(store.getState().whiteBoard.shapes[0]!.backgroundImage).toBeUndefined();
  });
});
