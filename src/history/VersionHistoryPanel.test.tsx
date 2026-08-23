import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import {
  createBoardCheckpoint,
  getBoardVersion,
  listBoardVersions,
  restoreBoardVersion,
  type BoardVersion,
  type BoardVersionDetail,
} from "../services/versionRepository";
import { SnapshotPreview, VersionHistoryPanel } from "./VersionHistoryPanel";

vi.mock("../services/versionRepository", () => ({
  createBoardCheckpoint: vi.fn(), getBoardVersion: vi.fn(), listBoardVersions: vi.fn(), restoreBoardVersion: vi.fn(),
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

const makeStore = (role: "owner" | "viewer" = "owner", activeBranchId: string | null = null) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({ id: "board", role, revision: 4, activeBranchId, shapes: [] }));
  return store;
};

describe("version history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBoardVersions).mockResolvedValue([version]);
    vi.mocked(getBoardVersion).mockResolvedValue(detail);
    vi.mocked(createBoardCheckpoint).mockResolvedValue({ ...version, id: "created" });
    vi.mocked(restoreBoardVersion).mockResolvedValue({ restored: true, versionId: version.id, beforeRestoreId: "recovery", revision: 99 });
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
});
