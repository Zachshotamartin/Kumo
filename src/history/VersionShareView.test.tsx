import { render, screen } from "@testing-library/react";
import { getSharedBoardVersion } from "../services/versionRepository";
import VersionShareView from "./VersionShareView";

vi.mock("../services/versionRepository", () => ({ getSharedBoardVersion: vi.fn() }));

describe("VersionShareView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an exact token-scoped snapshot without editor controls", async () => {
    vi.mocked(getSharedBoardVersion).mockResolvedValue({
      id: "version", board_id: "board", boardTitle: "Design review", name: "Launch", description: null,
      created_by: "owner", kind: "checkpoint", created_at: "2026-08-24T00:00:00.000Z",
      document: { backgroundColor: "#252629", nodes: {
        frame: { id: "frame", type: "rectangle", x1: 0, y1: 0, x2: 200, y2: 120, width: 200, height: 120, level: 0, zIndex: 1, backgroundColor: "#ffffff" },
        title: { id: "title", type: "text", x1: 20, y1: 20, x2: 180, y2: 50, width: 160, height: 30, level: 0, zIndex: 2, text: "Ship it", color: "#111111" },
      } },
    });
    const { container } = render(<VersionShareView versionId="version" token="secret" />);
    expect(await screen.findByRole("img", { name: "Snapshot of Design review" })).toBeVisible();
    expect(container.querySelector("text")).toHaveTextContent("Ship it");
    expect(screen.getByText("Read-only snapshot")).toBeVisible();
    expect(getSharedBoardVersion).toHaveBeenCalledWith("version", "secret");
  });

  it("reports expired or revoked links", async () => {
    vi.mocked(getSharedBoardVersion).mockRejectedValue(new Error("Version link is unavailable."));
    render(<VersionShareView versionId="version" token="expired" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Version link is unavailable");
  });
});
