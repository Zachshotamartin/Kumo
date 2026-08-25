import { act, renderHook, waitFor } from "@testing-library/react";
import { listBoardCollaborators, type BoardCollaborator } from "../services/collaboratorRepository";
import { useBoardCollaborators } from "./useBoardCollaborators";

vi.mock("../services/collaboratorRepository", () => ({ listBoardCollaborators: vi.fn() }));

const person = (id: string): BoardCollaborator => ({
  id,
  email: `${id}@example.com`,
  name: id,
  avatar: "",
  role: "editor",
});

describe("useBoardCollaborators", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not load collaborators before a board is selected", () => {
    const { result } = renderHook(() => useBoardCollaborators(null));
    expect(result.current).toEqual({ collaborators: [], error: null });
    expect(listBoardCollaborators).not.toHaveBeenCalled();
  });

  it("clears stale people and ignores an earlier board request", async () => {
    let resolveFirst: (people: BoardCollaborator[]) => void = () => undefined;
    let resolveSecond: (people: BoardCollaborator[]) => void = () => undefined;
    vi.mocked(listBoardCollaborators).mockImplementation((boardId) => new Promise((resolve) => {
      if (boardId === "first") resolveFirst = resolve;
      else resolveSecond = resolve;
    }));
    const { result, rerender } = renderHook(({ boardId }) => useBoardCollaborators(boardId), { initialProps: { boardId: "first" as string | null } });
    rerender({ boardId: "second" });
    expect(result.current.collaborators).toEqual([]);
    act(() => resolveFirst([person("stale")]));
    await Promise.resolve();
    expect(result.current.collaborators).toEqual([]);
    act(() => resolveSecond([person("fresh")]));
    await waitFor(() => expect(result.current.collaborators).toEqual([person("fresh")]));
  });

  it("clears an error after a later request succeeds", async () => {
    vi.mocked(listBoardCollaborators)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce([person("fresh")]);
    const { result, rerender } = renderHook(({ boardId }) => useBoardCollaborators(boardId), { initialProps: { boardId: "first" as string | null } });
    await waitFor(() => expect(result.current.error).toBe("Offline"));
    rerender({ boardId: "second" });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.collaborators).toEqual([person("fresh")]);
  });

  it("uses a safe fallback for non-error failures and ignores stale failures", async () => {
    let rejectFirst: (reason: unknown) => void = () => undefined;
    vi.mocked(listBoardCollaborators)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockRejectedValueOnce("offline");
    const { result, rerender } = renderHook(({ boardId }) => useBoardCollaborators(boardId), {
      initialProps: { boardId: "first" as string | null },
    });
    rerender({ boardId: "second" });
    act(() => rejectFirst(new Error("stale")));
    await waitFor(() => expect(result.current.error).toBe("Collaborators could not be loaded."));
  });
});
