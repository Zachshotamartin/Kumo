import { fireEvent, render, screen } from "@testing-library/react";
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

  it("uses a safe error for non-error failures", async () => {
    vi.mocked(getSharedBoardVersion).mockRejectedValue("offline");
    render(<VersionShareView versionId="version" token="failed" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Version could not be opened.");
  });

  it("renders sparse empty snapshots and every supported primitive", async () => {
    vi.mocked(getSharedBoardVersion).mockResolvedValue({
      id: "version", board_id: "board", boardTitle: "Legacy", name: null, description: null,
      created_by: null, kind: "checkpoint", created_at: "2026-08-24T00:00:00.000Z",
      document: { nodes: {
        ellipse: { id: "ellipse", type: "ellipse", x1: 0, y1: 0, x2: 40, y2: 20, width: 40, height: 20, level: 0, zIndex: 1 },
        rect: { id: "rect", type: "rectangle", x1: 50, y1: 0, x2: 90, y2: 20, width: 40, height: 20, level: 0, zIndex: 2 },
        text: { id: "text", type: "text", x1: 0, y1: 30, x2: 90, y2: 50, width: 90, height: 20, level: 0, zIndex: 3, text: "Fallback text" },
        hidden: { id: "hidden", type: "rectangle", x1: 0, y1: 0, x2: 10, y2: 10, width: 10, height: 10, level: 0, zIndex: 4, hidden: true },
      } },
    });
    const { container } = render(<VersionShareView versionId="version" token="legacy" />);
    await screen.findByRole("img", { name: "Snapshot of Legacy" });
    expect(screen.getByText(/Historical version/)).toBeVisible();
    expect(container.querySelectorAll("ellipse")).toHaveLength(1);
    expect(container.querySelectorAll("rect")).toHaveLength(1);
    expect(container.querySelector("text")).toHaveAttribute("fill", "#17181a");
    fireEvent.click(screen.getByRole("button", { name: /Back to Kumo/ }));
  });

  it("does not update state after an in-flight request is unmounted", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getSharedBoardVersion>>) => void;
    vi.mocked(getSharedBoardVersion).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = render(<VersionShareView versionId="version" token="slow" />);
    view.unmount();
    resolve({ id: "v", board_id: "b", boardTitle: "Late", name: null, description: null, created_by: null, kind: "checkpoint", created_at: "now", document: {} });
    await Promise.resolve();

    let reject!: (reason: unknown) => void;
    vi.mocked(getSharedBoardVersion).mockReturnValueOnce(new Promise((_done, fail) => { reject = fail; }));
    const failed = render(<VersionShareView versionId="version" token="slow-failure" />);
    failed.unmount();
    reject(new Error("late"));
    await Promise.resolve();
  });
});
