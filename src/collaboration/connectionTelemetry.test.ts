import {
  consumeCollaborationAuthAttempts,
  recordCollaborationAuthAttempt,
  reportCollaborationTelemetry,
} from "./connectionTelemetry";

const mocks = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock("../services/apiClient", () => ({ authenticatedFetch: mocks.authenticatedFetch }));

describe("collaboration connection telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("counts authentication retries and measures time to a ready room", () => {
    recordCollaborationAuthAttempt("board:one", 100);
    recordCollaborationAuthAttempt("board:one", 120);
    expect(consumeCollaborationAuthAttempts("board:one", 250)).toEqual({
      attempts: 2,
      durationMs: 150,
    });
    expect(consumeCollaborationAuthAttempts("board:one", 300)).toEqual({
      attempts: 0,
      durationMs: 0,
    });
  });

  it("reports authenticated, online-aware telemetry", async () => {
    mocks.authenticatedFetch.mockResolvedValue({ accepted: true });
    await reportCollaborationTelemetry({
      event: "restored",
      boardId: "board",
      roomId: "board:board",
      durationMs: 2400,
      connectionStatus: "connected",
    });
    expect(mocks.authenticatedFetch).toHaveBeenCalledWith("/api/telemetry", {
      method: "POST",
      body: expect.stringContaining('"event":"restored"'),
    });
    expect(JSON.parse(mocks.authenticatedFetch.mock.calls[0]![1].body)).toMatchObject({
      boardId: "board",
      roomId: "board:board",
      durationMs: 2400,
      online: true,
    });
  });

  it("retains offline events and flushes them before the restored event", async () => {
    mocks.authenticatedFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(reportCollaborationTelemetry({
      event: "lost", boardId: "board", roomId: "board:board",
    })).rejects.toThrow("offline");
    expect(window.localStorage.getItem("kumo:collaboration-telemetry")).toContain('"event":"lost"');

    mocks.authenticatedFetch.mockResolvedValue({ accepted: true });
    await reportCollaborationTelemetry({
      event: "restored", boardId: "board", roomId: "board:board",
    });
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(mocks.authenticatedFetch.mock.calls[1]![1].body)).toMatchObject({ event: "lost" });
    expect(JSON.parse(mocks.authenticatedFetch.mock.calls[2]![1].body)).toMatchObject({ event: "restored" });
    expect(window.localStorage.getItem("kumo:collaboration-telemetry")).toBeNull();
  });
});
