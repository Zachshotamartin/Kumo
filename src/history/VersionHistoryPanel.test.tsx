import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import {
  createBoardCheckpoint,
  compareBoardVersion,
  duplicateBoardVersion,
  getBoardVersion,
  listBoardVersions,
  renameBoardVersion,
  restoreBoardVersion,
  restoreBoardVersionLayers,
  shareBoardVersion,
  type BoardVersion,
  type BoardVersionDetail,
} from "../services/versionRepository";
import { SnapshotPreview, VersionHistoryPanel } from "./VersionHistoryPanel";

vi.mock("../services/versionRepository", () => ({
  createBoardCheckpoint: vi.fn(), getBoardVersion: vi.fn(), listBoardVersions: vi.fn(), restoreBoardVersion: vi.fn(),
  restoreBoardVersionLayers: vi.fn(), compareBoardVersion: vi.fn(), duplicateBoardVersion: vi.fn(), renameBoardVersion: vi.fn(), shareBoardVersion: vi.fn(),
}));

const version: BoardVersion = {
  id: "version", board_id: "board", name: "Ready for review", description: "", created_by: "user",
  creatorName: "Ada", kind: "checkpoint", created_at: "2026-08-23T00:00:00.000Z",
};
const detail: BoardVersionDetail = {
  ...version,
  document: {
    backgroundColor: "#111111",
    nodes: {
      rectangle: { id: "rectangle", type: "rectangle", x1: 10, y1: 20, x2: 110, y2: 70, width: 100, height: 50, level: 0, zIndex: 1, backgroundColor: "#b87a2e" },
      text: { id: "text", type: "text", x1: 20, y1: 30, x2: 80, y2: 50, width: 60, height: 20, level: 0, zIndex: 2, text: "Note" },
    },
  },
};

const makeStore = (role: "owner" | "editor" | "viewer" = "owner", activeBranchId: string | null = null, board: Record<string, unknown> = {}) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({ id: "board", role, revision: 4, activeBranchId, shapes: [], ...board }));
  return store;
};

describe("version history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBoardVersions).mockResolvedValue([version]);
    vi.mocked(getBoardVersion).mockResolvedValue(detail);
    vi.mocked(createBoardCheckpoint).mockResolvedValue({ ...version, id: "created" });
    vi.mocked(restoreBoardVersion).mockResolvedValue({ restored: true, versionId: version.id, beforeRestoreId: "recovery", revision: 99 });
    vi.mocked(restoreBoardVersionLayers).mockResolvedValue({ restored: true, versionId: version.id, beforeRestoreId: "recovery", revision: 100, restoredShapeIds: ["shape"] });
    vi.mocked(compareBoardVersion).mockResolvedValue({ diff: [{ shapeId: "shape", status: "changed", name: "Card", before: null, after: null }] });
    vi.mocked(duplicateBoardVersion).mockResolvedValue({ boardId: "duplicate" });
    vi.mocked(renameBoardVersion).mockResolvedValue({ ...version, name: "Renamed" });
    vi.mocked(shareBoardVersion).mockResolvedValue({ token: "version-token", url: "https://kumo.example/version" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("previews snapshots, creates named checkpoints, and restores safely", async () => {
    const store = makeStore("owner", "branch");
    render(<Provider store={store}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByText("Ready for review")).toBeVisible();
    await waitFor(() => expect(getBoardVersion).toHaveBeenCalledWith("board", "version", "branch"));
    fireEvent.change(screen.getByPlaceholderText("Ready for review"), { target: { value: "Milestone" } });
    fireEvent.change(screen.getByPlaceholderText("What changed?"), { target: { value: "Components added" } });
    fireEvent.click(screen.getByRole("button", { name: /Save checkpoint/ }));
    await waitFor(() => expect(createBoardCheckpoint).toHaveBeenCalledWith("board", "Milestone", "Components added", "branch"));
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(restoreBoardVersion).toHaveBeenCalledWith("board", "created", "branch"));
    expect(store.getState().whiteBoard.revision).toBe(99);
    fireEvent.click(screen.getByRole("button", { name: "Close version history" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
  });

  it("keeps checkpoint and restore controls away from viewers", async () => {
    render(<Provider store={makeStore("viewer")}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByText("Ready for review")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Save checkpoint/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restore this version/ })).not.toBeInTheDocument();
  });

  it("reports loading failures and renders empty snapshot states", async () => {
    vi.mocked(listBoardVersions).mockRejectedValueOnce(new Error("Offline"));
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    const { container, rerender } = render(<SnapshotPreview version={null} />);
    expect(within(container).getByText("Select a version to preview it")).toBeVisible();
    rerender(<SnapshotPreview version={{ ...detail, document: { nodes: {} } }} />);
    expect(within(container).getByText("Empty board")).toBeVisible();
  });

  it("renders every snapshot primitive and fallback style", () => {
    const rich: BoardVersionDetail = {
      ...detail,
      document: {
        backgroundColor: undefined,
        nodes: {
          ellipse: { id: "ellipse", type: "ellipse", x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0, level: 0, zIndex: 1, backgroundColor: undefined, rotation: undefined },
          frame: { id: "frame", type: "frame", x1: 20, y1: 10, x2: 100, y2: 70, width: 80, height: 60, level: 0, zIndex: 2, backgroundColor: "#ffffff", borderRadius: 20, rotation: 15 },
          text: { id: "text", type: "text", x1: 5, y1: 5, x2: 20, y2: 15, width: 15, height: 10, level: 0, zIndex: 3 },
        },
      },
    };
    const { container } = render(<SnapshotPreview version={rich} />);
    const marks = container.querySelectorAll("span");
    expect(marks).toHaveLength(3);
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: "#252629" });
    expect([...marks].some((mark) => (mark as HTMLElement).style.borderRadius === "50%")).toBe(true);
    expect([...marks].some((mark) => (mark as HTMLElement).style.border.includes("solid"))).toBe(true);
  });

  it("compares, shares, duplicates, and renames selected versions", async () => {
    const unnamed = { ...version, name: null, description: null, creatorName: null };
    vi.mocked(listBoardVersions).mockResolvedValue([unnamed]);
    const store = makeStore("editor", null, { title: null });
    render(<Provider store={store}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByText("Named checkpoint")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Compare selected version" }));
    expect(await screen.findByLabelText("Version comparison")).toHaveTextContent("changed Card");
    fireEvent.click(screen.getByRole("button", { name: "Copy selected version link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://kumo.example/version"));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate selected version" }));
    await waitFor(() => expect(duplicateBoardVersion).toHaveBeenCalledWith("board", "version", "Board copy", null));

    fireEvent.click(screen.getByRole("button", { name: "Rename selected version" }));
    expect(screen.getByLabelText("Version name")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "Renamed version" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Updated details" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(renameBoardVersion).toHaveBeenCalledWith("board", "version", "Renamed version", "Updated details", null));
    expect(await screen.findByText("Version details updated.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rename selected version" }));
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(renameBoardVersion).toHaveBeenLastCalledWith("board", "version", "Named version", "", null));
  });

  it("selects comparison rows and selectively restores layers", async () => {
    const store = makeStore("editor", "branch");
    render(<Provider store={store}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected version" }));
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Restore selected layers" })).toBeDisabled();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Restore selected layers" }));
    await waitFor(() => expect(restoreBoardVersionLayers).toHaveBeenCalledWith("board", "version", ["shape"], "branch"));
    expect(store.getState().whiteBoard.revision).toBe(100);
    expect(screen.getByRole("status")).toHaveTextContent("Restored 1 selected layers");
    await act(async () => { await Promise.resolve(); });
  });

  it("re-enables selective restore after a failed layer restore", async () => {
    vi.mocked(restoreBoardVersionLayers).mockRejectedValueOnce(new Error("Layer restore unavailable"));
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected version" }));
    const restore = await screen.findByRole("button", { name: "Restore selected layers" });
    fireEvent.click(restore);
    expect(await screen.findByRole("alert")).toHaveTextContent("Layer restore unavailable");
    await waitFor(() => expect(restore).toBeEnabled());
  });

  it("uses the selected version name when blank metadata is saved", async () => {
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    fireEvent.click(screen.getByRole("button", { name: "Rename selected version" }));
    fireEvent.change(screen.getByLabelText("Version name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(renameBoardVersion).toHaveBeenCalledWith("board", "version", "Ready for review", "", null));
  });

  it("selects the first checkpoint returned by refresh and preserves an empty refresh", async () => {
    vi.mocked(listBoardVersions)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([version]);
    const first = render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("No saved versions yet.");
    fireEvent.change(screen.getByPlaceholderText("Ready for review"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: /Save checkpoint/ }));
    await waitFor(() => expect(getBoardVersion).toHaveBeenCalledWith("board", "created", null));
    first.unmount();

    vi.mocked(listBoardVersions).mockResolvedValue([]);
    vi.mocked(createBoardCheckpoint).mockResolvedValue({ ...version, id: "created-empty" });
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("No saved versions yet.");
    fireEvent.change(screen.getByPlaceholderText("Ready for review"), { target: { value: "Only" } });
    fireEvent.click(screen.getByRole("button", { name: /Save checkpoint/ }));
    await waitFor(() => expect(getBoardVersion).toHaveBeenCalledWith("board", "created-empty", null));
  });

  it("labels recovery/autosave creators and switches preview selection", async () => {
    const recovery = { ...version, id: "recovery", name: null, creatorName: null, created_by: "user", kind: "before_restore" as const };
    const autosave = { ...version, id: "autosave", name: null, creatorName: null, created_by: null, kind: "autosave" as const };
    vi.mocked(listBoardVersions).mockResolvedValue([recovery, autosave]);
    vi.mocked(getBoardVersion).mockImplementation(async (_board, id) => ({ ...detail, id, name: null }));
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByText("Recovery point")).toBeInTheDocument();
    expect(screen.getByText("Autosave")).toBeInTheDocument();
    expect(screen.getByText("Collaborator")).toBeInTheDocument();
    expect(screen.getByText("Automatic")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Autosave/ }));
    await waitFor(() => expect(getBoardVersion).toHaveBeenCalledWith("board", "autosave", null));
  });

  it("cancels restore confirmation and reports mutation fallbacks", async () => {
    vi.mocked(createBoardCheckpoint).mockRejectedValueOnce("create failed");
    const view = render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    fireEvent.change(screen.getByPlaceholderText("Ready for review"), { target: { value: "Broken" } });
    fireEvent.click(screen.getByRole("button", { name: /Save checkpoint/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The checkpoint could not be created.");
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Restore this version" })).toBeInTheDocument();
    view.unmount();

    vi.mocked(restoreBoardVersion).mockRejectedValueOnce(new Error("Restore blocked"));
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Restore blocked");
  });

  it("reports preview/action errors and supports empty boards", async () => {
    vi.mocked(getBoardVersion).mockRejectedValueOnce("preview failed");
    const first = render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Version preview could not be loaded.");
    first.unmount();

    vi.mocked(compareBoardVersion).mockRejectedValueOnce("compare failed");
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    fireEvent.click(screen.getByRole("button", { name: "Compare selected version" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The version action failed.");
    cleanup();

    vi.mocked(listBoardVersions).mockResolvedValueOnce([]);
    render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    expect(await screen.findByText("No saved versions yet.")).toBeInTheDocument();
    expect(screen.getByText("Select a version to preview it")).toBeInTheDocument();
  });

  it("does not load without a board and ignores stale list and preview responses", async () => {
    const missing = render(<Provider store={makeStore("owner", null, { id: null })}><VersionHistoryPanel /></Provider>);
    expect(listBoardVersions).not.toHaveBeenCalled();
    missing.unmount();

    let finishList: (value: BoardVersion[]) => void = () => undefined;
    vi.mocked(listBoardVersions).mockImplementationOnce(() => new Promise((resolve) => { finishList = resolve; }));
    const staleList = render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    staleList.unmount();
    await act(async () => { finishList([version]); await Promise.resolve(); });

    let finishPreview: (value: BoardVersionDetail) => void = () => undefined;
    vi.mocked(getBoardVersion).mockImplementationOnce(() => new Promise((resolve) => { finishPreview = resolve; }));
    const stalePreview = render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    await screen.findByText("Ready for review");
    stalePreview.unmount();
    await act(async () => { finishPreview(detail); await Promise.resolve(); });

    let rejectList: (reason: unknown) => void = () => undefined;
    vi.mocked(listBoardVersions).mockImplementationOnce(() => new Promise((_, reject) => { rejectList = reject; }));
    const staleFailure = render(<Provider store={makeStore()}><VersionHistoryPanel /></Provider>);
    staleFailure.unmount();
    await act(async () => { rejectList(new Error("late")); await Promise.resolve(); });
  });
});
