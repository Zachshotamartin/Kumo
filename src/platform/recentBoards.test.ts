import { recentBoardVisits, recordBoardVisit } from "./recentBoards";

describe("recent board visits", () => {
  beforeEach(() => localStorage.clear());

  it("records actual opens per user, moves reopened boards to the front, and caps history", () => {
    for (let index = 1; index <= 35; index += 1) recordBoardVisit("user-a", `board-${index}`, index);
    expect(recentBoardVisits("user-a")).toHaveLength(32);
    expect(recentBoardVisits("user-a").slice(0, 2)).toEqual([
      { boardId: "board-35", openedAt: 35 },
      { boardId: "board-34", openedAt: 34 },
    ]);

    recordBoardVisit("user-a", "board-10", 50);
    expect(recentBoardVisits("user-a")[0]).toEqual({ boardId: "board-10", openedAt: 50 });
    expect(recentBoardVisits("user-a").filter((visit) => visit.boardId === "board-10")).toHaveLength(1);
    expect(recentBoardVisits("user-b")).toEqual([]);
  });

  it("discards malformed, duplicate, and invalid persisted visits", () => {
    localStorage.setItem("kumo:recent-boards:user-a", JSON.stringify([
      { boardId: "same", openedAt: 2 },
      { boardId: "same", openedAt: 1 },
      { boardId: "", openedAt: 3 },
      { boardId: "nan", openedAt: "later" },
      null,
    ]));
    expect(recentBoardVisits("user-a")).toEqual([{ boardId: "same", openedAt: 2 }]);
    localStorage.setItem("kumo:recent-boards:user-a", "not-json");
    expect(recentBoardVisits("user-a")).toEqual([]);
    localStorage.setItem("kumo:recent-boards:user-a", "{}");
    expect(recentBoardVisits("user-a")).toEqual([]);
  });

  it("does not persist incomplete or non-finite visits", () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    expect(recordBoardVisit("", "board", 1, storage)).toEqual([]);
    expect(recordBoardVisit("user", "", 1, storage)).toEqual([]);
    expect(recordBoardVisit("user", "board", Number.NaN, storage)).toEqual([]);
    expect(recordBoardVisit("user", "board", 0, storage)).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
