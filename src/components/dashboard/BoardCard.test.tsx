import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadBoardPreview, type BoardSummary } from "../../services/boardRepository";
import { BoardCard } from "./BoardCard";

vi.mock("../../services/boardRepository", () => ({ loadBoardPreview: vi.fn() }));

const preview = vi.mocked(loadBoardPreview);
const board = (thumbnailUrl: string | null = null): BoardSummary => ({
  id: "board",
  title: "Project map",
  ownerId: "owner",
  visibility: "public",
  roomId: "board:board",
  role: "owner",
  updatedAt: 1,
  thumbnailUrl,
});

describe("BoardCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", { ...URL, revokeObjectURL: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("falls back from a signed thumbnail to a generated preview", async () => {
    preview.mockResolvedValue("blob:generated");
    const onOpen = vi.fn();
    const view = render(<BoardCard board={board("https://signed.example/preview.svg")} actionLabel="Copy" onOpen={onOpen} />);
    expect(screen.getByText("Public board")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy Project map" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Project map from board details" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    fireEvent.error(view.container.querySelector("img")!);
    await waitFor(() => expect(preview).toHaveBeenCalledWith("board", expect.any(AbortSignal)));
    await waitFor(() => expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:generated"));
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).not.toBeInTheDocument();
  });

  it("revokes generated previews on cleanup and when they resolve after unmount", async () => {
    preview.mockResolvedValueOnce("blob:ready");
    const first = render(<BoardCard board={board()} onOpen={vi.fn()} />);
    await waitFor(() => expect(first.container.querySelector("img")).toHaveAttribute("src", "blob:ready"));
    first.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:ready");

    let resolvePreview!: (value: string) => void;
    preview.mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve; }));
    const second = render(<BoardCard board={{ ...board(), id: "late" }} onOpen={vi.fn()} />);
    second.unmount();
    await act(async () => resolvePreview("blob:late"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:late");
  });

  it("keeps a placeholder for aborted and failed generated previews", async () => {
    preview.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    const first = render(<BoardCard board={board()} onOpen={vi.fn()} />);
    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    first.unmount();
    preview.mockRejectedValueOnce("offline");
    render(<BoardCard board={{ ...board(), id: "failed", visibility: "private" }} actionLabel="View" onOpen={vi.fn()} />);
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Private board")).toBeInTheDocument();
  });

  it("dispatches every organization action and folder choice", () => {
    const onOrganize = vi.fn();
    const folders = [{ id: "folder", workspace_id: "workspace", parent_id: null, name: "Research", created_by: "owner", created_at: "", updated_at: "" }];
    const organization = { board_id: "board", workspace_id: "workspace", folder_id: "folder", favorite: true, archived_at: null, trashed_at: "now" };
    const view = render(<BoardCard board={board()} onOpen={vi.fn()} organization={organization} folders={folders} onOrganize={onOrganize} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Project map from favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore Project map" }));
    fireEvent.change(screen.getByLabelText("Folder for Project map"), { target: { value: "" } });
    expect(onOrganize).toHaveBeenCalledWith("favorite-board", { favorite: false });
    expect(onOrganize).toHaveBeenCalledWith("restore-board");
    expect(onOrganize).toHaveBeenCalledWith("move-board", { folderId: null });

    view.rerender(<BoardCard board={board()} onOpen={vi.fn()} organization={{ ...organization, folder_id: null, favorite: false, trashed_at: null }} folders={folders} onOrganize={onOrganize} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Project map to favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive Project map" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Project map to trash" }));
    fireEvent.change(screen.getByLabelText("Folder for Project map"), { target: { value: "folder" } });
    expect(onOrganize).toHaveBeenCalledWith("favorite-board", { favorite: true });
    expect(onOrganize).toHaveBeenCalledWith("archive-board");
    expect(onOrganize).toHaveBeenCalledWith("trash-board");
    expect(onOrganize).toHaveBeenCalledWith("move-board", { folderId: "folder" });
  });
});
