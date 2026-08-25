import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { ApiError } from "../../services/apiClient";
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

const renderPanel = (board: Record<string, unknown> = {}) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({ id: "board", roomId: "board:board", baseRoomId: "board:board", role: "owner", title: "Board", revision: 3, shapes: [], ...board }));
  const view = render(<Provider store={store}><BranchesPanel /></Provider>);
  return Object.assign(store, { view });
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

  it("renders review variants, malformed diff geometry, and inactive branch history", async () => {
    const reviewBranches = [{
      ...openBranch,
      updated_from_main_at: "2026-08-24",
      branch_reviews: [
        { reviewer_id: "approved", status: "approved", note: "", reviewed_checksum: null, updated_at: "2026-08-24" },
        { reviewer_id: "changes", status: "changes-requested", note: "Fix spacing", reviewed_checksum: null, updated_at: "2026-08-24" },
      ],
    }, {
      ...openBranch,
      id: "no-reviews",
      name: "No reviews",
      room_id: "branch:no-reviews",
      branch_reviews: undefined,
    }, {
      ...archivedBranch,
      status: "merged",
      merge_description: "Shipped",
    }, {
      ...archivedBranch,
      id: "closed",
      name: "Closed idea",
      status: "closed",
      merge_description: null,
      branch_reviews: undefined,
    }];
    mocks.list.mockResolvedValue(reviewBranches);
    mocks.diff.mockResolvedValue({ diff: [
      { shapeId: "removed", status: "removed", name: "Removed", before: { x1: "bad", y1: null, width: 0, height: 1 }, after: null },
      { shapeId: "added", status: "added", name: "Added", before: null, after: { x1: 20, y1: 30, width: Number.NaN, height: undefined } },
      { shapeId: "empty", status: "changed", name: "Empty", before: null, after: null },
    ] });
    renderPanel({ baseRoomId: null });
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Changes requested · Fix spacing")).toBeInTheDocument();
    expect(screen.getByText("merged · Shipped")).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "Restore" })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);
    expect(screen.getByRole("button", { name: /Return to main/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Return to main/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]!);
    expect(await screen.findByRole("img", { name: "overlay branch comparison" })).toBeInTheDocument();
    expect(screen.getByText("3 document changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));
    fireEvent.click(screen.getByRole("button", { name: "Overlay" }));
  });

  it("resolves update conflicts before retrying", async () => {
    mocks.updateFromMain.mockRejectedValueOnce(new ApiError("Choose versions", 409, {
      code: "BRANCH_CONFLICTS",
      conflicts: [{ shapeId: "shape", main: {}, branch: {} }],
    }));
    renderPanel();
    await screen.findByText("Exploration");
    fireEvent.click(screen.getByRole("button", { name: "Update Exploration from main" }));
    expect(await screen.findByRole("group", { name: "Branch conflict resolution" })).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Apply resolutions" });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Keep main" }));
    expect(apply).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: "Keep branch" }));
    fireEvent.click(apply);
    await waitFor(() => expect(mocks.updateFromMain).toHaveBeenLastCalledWith("board", "branch", { shape: "branch" }));
    expect(await screen.findByText("Branch updated from main.")).toBeInTheDocument();
  });

  it("reports fallback errors for every branch mutation", async () => {
    mocks.clipboard.mockRejectedValueOnce("denied");
    mocks.rename.mockRejectedValueOnce("rename");
    mocks.updateFromMain.mockRejectedValueOnce("update");
    mocks.archive.mockRejectedValueOnce("archive");
    mocks.diff.mockRejectedValueOnce("diff");
    mocks.restore.mockRejectedValueOnce("restore");
    renderPanel();
    await screen.findByText("Exploration");

    fireEvent.click(screen.getByRole("button", { name: "Copy link to Exploration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Branch link could not be copied.");
    fireEvent.click(screen.getByRole("button", { name: "Rename Exploration" }));
    fireEvent.submit(screen.getByLabelText("Branch name").closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Rename failed."));
    fireEvent.click(screen.getByRole("button", { name: "Update Exploration from main" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Branch update failed."));
    fireEvent.click(screen.getByRole("button", { name: "Archive Exploration" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Archive failed."));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Diff failed."));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Restore failed."));
  });

  it("reports create, merge, review-request, and review-decision failures", async () => {
    mocks.create.mockRejectedValueOnce("create");
    mocks.merge.mockRejectedValueOnce("merge");
    mocks.requestReview.mockRejectedValueOnce("request");
    mocks.review.mockRejectedValueOnce("review").mockRejectedValueOnce("changes");
    renderPanel();
    await screen.findByText("Exploration");
    fireEvent.click(screen.getByRole("button", { name: /Create from main/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Branch creation failed."));

    fireEvent.click(screen.getByRole("button", { name: "Merge Exploration" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Merge failed."));

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByRole("img", { name: "overlay branch comparison" });
    expect(screen.getByRole("button", { name: "Request review" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reviewer emails or IDs"), { target: { value: "one@example.com, two@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Request review" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Review request failed."));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Review failed."));
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(mocks.review).toHaveBeenLastCalledWith("board", "branch", "changes-requested", ""));
  });

  it("handles missing boards, viewer restrictions, empty results, and stale loads", async () => {
    const withoutBoard = renderPanel({ id: null, roomId: null, baseRoomId: null, role: "viewer" });
    expect(screen.getByRole("button", { name: /Create from main/ })).toBeDisabled();
    expect(mocks.list).not.toHaveBeenCalled();
    withoutBoard.view.unmount();

    mocks.list.mockResolvedValueOnce([]);
    renderPanel({ role: "viewer" });
    expect(await screen.findByText("No open branches.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create from main/ })).toBeDisabled();
  });

  it("ignores list completion after unmount for both resolve and reject", async () => {
    let finish: (value: typeof openBranch[]) => void = () => undefined;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = renderPanel();
    first.view.unmount();
    finish([openBranch]);
    await Promise.resolve();

    let fail: (reason: unknown) => void = () => undefined;
    mocks.list.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const second = renderPanel();
    second.view.unmount();
    fail(new Error("late"));
    await Promise.resolve();
  });

  it("guards retained branch actions when the board closes and covers room fallbacks", async () => {
    const store = renderPanel({ baseRoomId: null, activeBranchId: "branch", activeBranchName: "Exploration" });
    await screen.findByText("Exploration");
    fireEvent.click(screen.getByRole("button", { name: /Return to main/ }));
    expect(store.getState().whiteBoard.roomId).toBe("board:board");

    act(() => store.dispatch(setWhiteboardData({ id: null, baseRoomId: null })));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(store.getState().whiteBoard.roomId).toBe("branch:branch");
    fireEvent.click(screen.getByRole("button", { name: /Return to main/ }));
    expect(store.getState().whiteBoard.roomId).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Update Exploration from main" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename Exploration" }));
    fireEvent.submit(screen.getByLabelText("Branch name").closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Merge Exploration" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy link to Exploration" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive Exploration" }));
    expect(mocks.diff).not.toHaveBeenCalled();
    expect(mocks.updateFromMain).not.toHaveBeenCalled();
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it("stops a reload when the board closes and reports reload failures", async () => {
    let finishArchive: () => void = () => undefined;
    mocks.archive.mockImplementationOnce(() => new Promise((resolve) => { finishArchive = () => resolve({ archived: true }); }));
    const store = renderPanel();
    await screen.findByText("Exploration");
    fireEvent.click(screen.getByRole("button", { name: "Archive Exploration" }));
    act(() => store.dispatch(setWhiteboardData({ id: null })));
    await act(async () => {
      finishArchive();
      await Promise.resolve();
    });
    expect(mocks.list).toHaveBeenCalledTimes(2);
    store.view.unmount();

    const second = renderPanel();
    await screen.findByText("Exploration");
    mocks.list.mockRejectedValueOnce("reload");
    fireEvent.click(screen.getByRole("button", { name: "Archive Exploration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Branches could not be loaded.");
    second.view.unmount();
  });

  it("completes a change-request review", async () => {
    renderPanel();
    await screen.findByText("Exploration");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByRole("img", { name: "overlay branch comparison" });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith("board", "branch", "changes-requested", ""));
    expect(await screen.findByText("Changes requested.")).toBeInTheDocument();
  });
});
