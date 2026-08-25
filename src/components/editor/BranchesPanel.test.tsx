import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import BranchesPanel from "./BranchesPanel";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), create: vi.fn(), merge: vi.fn(), archive: vi.fn(), diff: vi.fn(), review: vi.fn(),
  rename: vi.fn(), restore: vi.fn(), requestReview: vi.fn(), updateFromMain: vi.fn(), clipboard: vi.fn(),
}));

vi.mock("../../services/branchRepository", () => ({
  listDesignBranches: mocks.list,
  createDesignBranch: mocks.create,
  mergeDesignBranch: mocks.merge,
  archiveDesignBranch: mocks.archive,
  diffDesignBranch: mocks.diff,
  reviewDesignBranch: mocks.review,
  renameDesignBranch: mocks.rename,
  restoreDesignBranch: mocks.restore,
  requestBranchReview: mocks.requestReview,
  updateBranchFromMain: mocks.updateFromMain,
}));

const openBranch = {
  id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", created_by: "owner",
  status: "open" as const, base_checksum: "base", created_at: "2026-08-24", updated_at: "2026-08-24", merged_at: null,
  branch_reviews: [{ reviewer_id: "reviewer", status: "requested" as const, note: "Please review", reviewed_checksum: null, updated_at: "2026-08-24" }],
};
const archivedBranch = { ...openBranch, id: "archived", name: "Archived idea", room_id: "branch:archived", status: "archived" as const };

const renderPanel = () => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({ id: "board", roomId: "board:board", baseRoomId: "board:board", role: "owner", title: "Board", revision: 3, shapes: [] }));
  render(<Provider store={store}><BranchesPanel /></Provider>);
  return store;
};

describe("BranchesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/?board=board");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
    mocks.clipboard.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue([openBranch, archivedBranch]);
    mocks.create.mockResolvedValue({ ...openBranch, id: "created", name: "New idea", room_id: "branch:created" });
    mocks.merge.mockResolvedValue({ merged: true, checkpointId: "checkpoint", revision: 9 });
    mocks.archive.mockResolvedValue({ archived: true });
    mocks.diff.mockResolvedValue({ diff: [{ shapeId: "shape", status: "changed", name: "Card", before: { x1: 0, y1: 0, width: 20, height: 20 }, after: { x1: 10, y1: 10, width: 20, height: 20 } }] });
    mocks.review.mockResolvedValue({ reviewed: true, status: "approved" });
    mocks.rename.mockResolvedValue({ ...openBranch, name: "Renamed" });
    mocks.restore.mockResolvedValue({ restored: true });
    mocks.requestReview.mockResolvedValue({ requested: ["reviewer"] });
    mocks.updateFromMain.mockResolvedValue({ updated: true, branchId: "branch", diff: [] });
  });

  it("opens, exits, copies, renames, updates, archives, and restores branches", async () => {
    const store = renderPanel();
    expect(await screen.findByText("Exploration")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(store.getState().whiteBoard).toEqual(expect.objectContaining({ roomId: "branch:branch", activeBranchId: "branch" }));
    fireEvent.click(screen.getByRole("button", { name: /Return to main/ }));
    expect(store.getState().whiteBoard).toEqual(expect.objectContaining({ roomId: "board:board", activeBranchId: null }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link to Exploration" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith(expect.stringContaining("branch=branch")));
    fireEvent.click(screen.getByRole("button", { name: "Rename Exploration" }));
    fireEvent.change(screen.getByLabelText("Branch name"), { target: { value: "Renamed" } });
    fireEvent.submit(screen.getByLabelText("Branch name").closest("form")!);
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith("board", "branch", "Renamed"));
    fireEvent.click(screen.getByRole("button", { name: "Update Exploration from main" }));
    await waitFor(() => expect(mocks.updateFromMain).toHaveBeenCalledWith("board", "branch", {}));
    fireEvent.click(screen.getByRole("button", { name: "Archive Exploration" }));
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("board", "branch"));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith("board", "archived"));
  });

  it("creates, compares, requests review, decides, and merges a branch", async () => {
    renderPanel();
    await screen.findByText("Exploration");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New idea" } });
    fireEvent.click(screen.getByRole("button", { name: /Create from main/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("board", "New idea"));
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[1]!);
    expect(await screen.findByRole("img", { name: "overlay branch comparison" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));
    expect(screen.getByRole("img", { name: "side-by-side branch comparison" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Reviewer emails or IDs"), { target: { value: "reviewer@example.com" } });
    fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "Please review" } });
    fireEvent.click(screen.getByRole("button", { name: "Request review" }));
    await waitFor(() => expect(mocks.requestReview).toHaveBeenCalledWith("board", "branch", ["reviewer@example.com"], "Please review"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith("board", "branch", "approved", "Please review"));
    fireEvent.click(screen.getByRole("button", { name: "Merge Exploration" }));
    fireEvent.change(screen.getByLabelText("Merge description"), { target: { value: "Ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(mocks.merge).toHaveBeenCalledWith("board", "branch", "Ready"));
  });

  it("closes the panel and reports loading failures", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Offline"));
    const store = renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Close branches" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
  });
});
