const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../../api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));

import { linkedBoardSharePlan, membershipBoardIds } from "../../api/_boardSharing";
import { linkedBoardsForActor } from "../../api/_boards";

describe("linked board access algorithms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("walks a cyclic board graph once and preserves minimum depth", async () => {
    const links: Record<string, string[]> = {
      source: ["alpha", "beta"],
      alpha: ["source", "gamma"],
      beta: ["gamma"],
      gamma: [],
    };
    const rows = [
      { id: "source", title: "Source", visibility: "private", owner_id: "owner" },
      { id: "alpha", title: "Alpha", visibility: "private", owner_id: "owner" },
      { id: "beta", title: "Beta", visibility: "public", owner_id: "other" },
      { id: "gamma", title: "Gamma", visibility: "private", owner_id: "other" },
    ];
    mocks.from.mockImplementation((table: string) => {
      if (table === "board_links") return {
        select: () => ({
          in: vi.fn(async (_column: string, frontier: string[]) => ({
            data: frontier.flatMap((source) => (links[source] ?? []).map((target) => ({
              source_board_id: source,
              target_board_id: target,
            }))),
            error: null,
          })),
        }),
      };
      return {
        select: () => ({
          in: (_column: string, ids: string[]) => ({
            is: vi.fn().mockResolvedValue({
              data: rows.filter((row) => ids.includes(row.id)),
              error: null,
            }),
          }),
        }),
      };
    });

    const plan = await linkedBoardSharePlan("source", "owner");
    expect(plan.truncated).toBe(false);
    expect(plan.boards).toEqual([
      expect.objectContaining({ id: "source", depth: 0, manageable: true }),
      expect.objectContaining({ id: "alpha", depth: 1, manageable: true }),
      expect.objectContaining({ id: "beta", depth: 1, manageable: false }),
      expect.objectContaining({ id: "gamma", depth: 2, manageable: false }),
    ]);
  });

  it("does not traverse the private graph of a board owned by someone else", async () => {
    const links: Record<string, string[]> = {
      source: ["foreign"],
      foreign: ["hidden"],
    };
    const rows = [
      { id: "source", title: "Source", visibility: "private", owner_id: "owner" },
      { id: "foreign", title: "Foreign", visibility: "private", owner_id: "other" },
      { id: "hidden", title: "Hidden", visibility: "private", owner_id: "other" },
    ];
    mocks.from.mockImplementation((table: string) => {
      if (table === "board_links") return {
        select: () => ({
          in: vi.fn(async (_column: string, frontier: string[]) => ({
            data: frontier.flatMap((source) => (links[source] ?? []).map((target) => ({
              source_board_id: source,
              target_board_id: target,
            }))),
            error: null,
          })),
        }),
      };
      return {
        select: () => ({
          in: (_column: string, ids: string[]) => ({
            is: vi.fn().mockResolvedValue({
              data: rows.filter((row) => ids.includes(row.id)),
              error: null,
            }),
          }),
        }),
      };
    });

    const plan = await linkedBoardSharePlan("source", "owner");
    expect(plan.boards.map((board) => board.id)).toEqual(["source", "foreign"]);
    expect(plan.boards.some((board) => board.id === "hidden")).toBe(false);
    expect(plan.boards.find((board) => board.id === "foreign")?.title)
      .toBe("Private linked board");
  });

  it("resolves existing membership without treating public visibility as a grant", async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({ in: vi.fn().mockResolvedValue({ data: [{ board_id: "one" }], error: null }) }),
      }),
    });
    await expect(membershipBoardIds("user", ["one", "two"]))
      .resolves.toEqual(new Set(["one"]));
  });

  it("returns access-aware summaries for direct board links", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "board_links") return {
        select: () => ({ eq: vi.fn().mockResolvedValue({
        data: [
          { target_board_id: "private" },
          { target_board_id: "blocked" },
          { target_board_id: "public" },
        ], error: null,
        }) }),
      };
      if (table === "boards") return {
        select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({
          data: [
            { id: "private", title: "Private", visibility: "private" },
            { id: "blocked", title: "Secret launch", visibility: "private" },
            { id: "public", title: "Public", visibility: "public" },
          ],
          error: null,
        }) }) }),
      };
      return {
        select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({
          data: [{ board_id: "private", role: "editor" }], error: null,
        }) }) }),
      };
    });
    await expect(linkedBoardsForActor("source", "user")).resolves.toEqual({
      private: expect.objectContaining({ accessible: true, role: "editor" }),
      blocked: expect.objectContaining({ accessible: false, role: null, title: "Private board" }),
      public: expect.objectContaining({ accessible: true, role: "viewer" }),
    });
  });
});
