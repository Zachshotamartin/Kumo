import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer, { setFollowingUserId, setLocalPreviewActive } from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { replaceShapes, setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import type { Shape } from "../classes/shape";
import CollaborationBridge from "./CollaborationBridge";

const collaboration = vi.hoisted(() => ({
  nodes: {} as Record<string, Record<string, unknown>>,
  textCharacters: {} as Record<string, Record<string, unknown>> | undefined,
  backgroundColor: "#252629",
  others: [] as Array<Record<string, unknown>>,
  resolveAssetUrl: vi.fn<(assetId: string) => Promise<string>>(),
  eventListener: undefined as undefined | ((payload: { event: Liveblocks["RoomEvent"] }) => void),
  reconciled: [] as Array<{ id: string; text: string }>,
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useStorage: (selector: (root: typeof collaboration) => unknown) => selector(collaboration),
  useOthers: () => collaboration.others,
}));
vi.mock("@liveblocks/react", () => ({
  useEventListener: (listener: (payload: { event: Liveblocks["RoomEvent"] }) => void) => { collaboration.eventListener = listener; },
  useMutation: (mutation: (context: Record<string, unknown>, values: Array<{ id: string; text: string }>) => void) =>
    (values: Array<{ id: string; text: string }>) => mutation({
      storage: {
        get: () => ({
          get: (id: string) => {
            const node = collaboration.nodes[id];
            return node && {
              get: (key: string) => node[key],
              update: (value: { text: string }) => {
                Object.assign(node, value);
                collaboration.reconciled.push({ id, text: value.text });
              },
            };
          },
        }),
      },
    }, values),
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
    collaboration.reconciled = [];
  });

  it("reads the JSON projection returned for a LiveMap", async () => {
    collaboration.nodes.second = {
      ...shape("second"),
      id: "second",
      zIndex: 1,
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

  it("projects CRDT text, including a fully deleted value, and reconciles legacy node text", async () => {
    collaboration.nodes.live = { ...shape("legacy"), id: "live" } as unknown as Record<string, unknown>;
    collaboration.nodes.deleted = { ...shape("legacy deleted"), id: "deleted", zIndex: 2 } as unknown as Record<string, unknown>;
    collaboration.nodes.plain = { ...shape("plain"), id: "plain", zIndex: 3 } as unknown as Record<string, unknown>;
    collaboration.textCharacters = {
      first: { id: "first", shapeId: "live", leftId: null, position: 1, value: "H", deleted: false },
      second: { id: "second", shapeId: "live", leftId: "first", position: 2, value: "i", deleted: false },
      gone: { id: "gone", shapeId: "deleted", leftId: null, position: 1, value: "x", deleted: true },
    };
    const store = makeStore();

    render(<Provider store={store}><CollaborationBridge /></Provider>);

    await waitFor(() => {
      expect(store.getState().whiteBoard.shapes.map(({ id, text }) => ({ id, text }))).toEqual([
        { id: "live", text: "Hi" },
        { id: "deleted", text: "" },
        { id: "plain", text: "plain" },
      ]);
      expect(collaboration.reconciled).toEqual([
        { id: "live", text: "Hi" },
        { id: "deleted", text: "" },
      ]);
    });
  });

  it("accepts absent text storage and skips reconciliation when node text already matches or disappeared", async () => {
    collaboration.textCharacters = undefined;
    collaboration.nodes.same = { ...shape("same"), id: "same" } as unknown as Record<string, unknown>;
    const store = makeStore();
    const { unmount } = render(<Provider store={store}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(store.getState().whiteBoard.shapes[0]?.text).toBe("same"));
    expect(collaboration.reconciled).toEqual([]);
    unmount();

    collaboration.nodes.same = { ...shape("x"), id: "same" } as unknown as Record<string, unknown>;
    collaboration.textCharacters = {
      same: { id: "same-character", shapeId: "same", leftId: null, position: 1, value: "x", deleted: false },
    };
    const matching = render(<Provider store={makeStore()}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(collaboration.reconciled).toEqual([]));
    matching.unmount();

    collaboration.nodes = {};
    collaboration.textCharacters = {
      orphan: { id: "orphan", shapeId: "missing", leftId: null, position: 1, value: "x", deleted: false },
    };
    render(<Provider store={makeStore()}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(collaboration.reconciled).toEqual([]));
  });

  it("hydrates current assets, ignores hydration failures, and cancels hydration after unmount", async () => {
    collaboration.nodes.shape = shape("", "asset") as unknown as Record<string, unknown>;
    collaboration.resolveAssetUrl.mockResolvedValueOnce("signed");
    const store = makeStore();
    const first = render(<Provider store={store}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(store.getState().whiteBoard.shapes[0]?.backgroundImage).toBe("signed"));
    first.unmount();

    collaboration.resolveAssetUrl.mockRejectedValueOnce(new Error("expired"));
    const second = render(<Provider store={makeStore()}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(collaboration.resolveAssetUrl).toHaveBeenCalledTimes(2));
    second.unmount();

    let finish: (url: string) => void = () => undefined;
    collaboration.resolveAssetUrl.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const cancelledStore = makeStore();
    const third = render(<Provider store={cancelledStore}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(collaboration.resolveAssetUrl).toHaveBeenCalledTimes(3));
    third.unmount();
    act(() => finish("too-late"));
    await Promise.resolve();
    expect(cancelledStore.getState().whiteBoard.shapes[0]?.backgroundImage).toBeUndefined();
  });

  it("handles spotlight lifecycle and follows only collaborators still in the room", async () => {
    collaboration.others = [{
      id: "ada",
      info: { name: "", email: "ada@example.com", avatar: "" },
      presence: {
        cursor: null,
        selectionIds: [],
        viewport: { x: 70, y: 80, zoom: 2 },
        spotlight: true,
        activeShapeIds: [],
        activity: null,
        cursorChat: null,
        textSelection: { shapeId: "shape", anchor: 1, focus: 2 },
      },
    }];
    const store = makeStore();
    render(<Provider store={store}><CollaborationBridge /></Provider>);

    act(() => collaboration.eventListener?.({ event: { type: "SPOTLIGHT_START", presenterId: "ada" } }));
    await waitFor(() => {
      expect(store.getState().editor.followingUserId).toBe("ada");
      expect(store.getState().editor.viewport).toEqual({ x: 70, y: 80, zoom: 2 });
      expect(store.getState().whiteBoard.currentUsers[0]).toMatchObject({
        label: "ada@example.com",
        cursorX: null,
        cursorY: null,
        textSelection: { shapeId: "shape", anchor: 1, focus: 2 },
      });
    });

    act(() => collaboration.eventListener?.({ event: { type: "SPOTLIGHT_STOP", presenterId: "ada" } }));
    expect(store.getState().editor.followingUserId).toBeNull();

    act(() => store.dispatch(setFollowingUserId("departed")));
    await waitFor(() => expect(store.getState().editor.followingUserId).toBeNull());
  });

  it("falls back to a generic collaborator label when identity is absent", async () => {
    collaboration.others = [{
      id: "anonymous",
      info: { name: "", email: "", avatar: "" },
      presence: {
        cursor: null,
        selectionIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        spotlight: false,
        activeShapeIds: [],
        activity: null,
        cursorChat: null,
      },
    }];
    const store = makeStore();
    render(<Provider store={store}><CollaborationBridge /></Provider>);
    await waitFor(() => expect(store.getState().whiteBoard.currentUsers[0]?.label).toBe("Collaborator"));
  });
});
