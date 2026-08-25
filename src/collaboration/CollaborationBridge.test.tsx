import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer, { setLocalPreviewActive } from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { replaceShapes, setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import type { Shape } from "../classes/shape";
import CollaborationBridge from "./CollaborationBridge";

const collaboration = vi.hoisted(() => ({
  nodes: {} as Record<string, Record<string, unknown>>,
  textCharacters: {} as Record<string, Record<string, unknown>>,
  backgroundColor: "#252629",
  others: [] as Array<Record<string, unknown>>,
  resolveAssetUrl: vi.fn<(assetId: string) => Promise<string>>(),
  eventListener: undefined as undefined | ((payload: { event: Liveblocks["RoomEvent"] }) => void),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useStorage: (selector: (root: typeof collaboration) => unknown) => selector(collaboration),
  useOthers: () => collaboration.others,
}));
vi.mock("@liveblocks/react", () => ({
  useEventListener: (listener: (payload: { event: Liveblocks["RoomEvent"] }) => void) => { collaboration.eventListener = listener; },
  useMutation: () => vi.fn(),
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
    collaboration.nodes = {};
    collaboration.textCharacters = {};
    collaboration.others = [];
    collaboration.resolveAssetUrl.mockReset();
    collaboration.eventListener = undefined;
  });

  it("reads the JSON projection returned for a LiveMap", async () => {
    collaboration.nodes.second = {
      ...shape("second"),
      id: "second",
      zIndex: 2,
    } as unknown as Record<string, unknown>;
    collaboration.nodes.first = {
      ...shape("first"),
      id: "first",
      zIndex: 1,
    } as unknown as Record<string, unknown>;
    const store = makeStore();

    render(<Provider store={store}><CollaborationBridge /></Provider>);

    await waitFor(() => {
      expect(store.getState().whiteBoard.shapes.map(({ id }) => id)).toEqual(["first", "second"]);
    });
  });

  it("projects remote activity and cursor chat into the board presence model", async () => {
    collaboration.others = [{
      id: "ada",
      info: { name: "Ada", email: "ada@example.com", avatar: "" },
      presence: {
        cursor: { x: 24, y: 36 },
        selectionIds: ["shape"],
        viewport: { x: 10, y: 20, zoom: 1.25 },
        spotlight: false,
        activeShapeIds: ["shape"],
        activity: "moving",
        cursorChat: "I’m aligning this",
      },
    }];
    const store = makeStore();

    render(<Provider store={store}><CollaborationBridge /></Provider>);

    await waitFor(() => {
      expect(store.getState().whiteBoard.currentUsers).toEqual([{
        uid: "ada",
        label: "Ada",
        cursorX: 24,
        cursorY: 36,
        selectionIds: ["shape"],
        viewport: { x: 10, y: 20, zoom: 1.25 },
        spotlight: false,
        activeShapeIds: ["shape"],
        activity: "moving",
        cursorChat: "I’m aligning this",
      }]);
    });
  });

  it("does not overwrite an active local preview and catches up afterward", async () => {
    collaboration.nodes.shape = shape("remote") as unknown as Record<string, unknown>;
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
    collaboration.nodes.shape = shape("", "asset-old") as unknown as Record<string, unknown>;
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

  it("remounts the room at the server revision after a document restore", () => {
    const store = makeStore();
    store.dispatch(setWhiteboardData({ revision: 4 }));
    render(<Provider store={store}><CollaborationBridge /></Provider>);
    act(() => collaboration.eventListener?.({ event: { type: "DOCUMENT_RESTORED", actorId: "other", revision: 1234 } }));
    expect(store.getState().whiteBoard.revision).toBe(1234);
  });
});
