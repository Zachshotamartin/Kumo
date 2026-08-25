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
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
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
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    mocks.authenticatedFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(reportCollaborationTelemetry({
      event: "lost", boardId: "board", roomId: "board:board",
    })).rejects.toThrow("offline");
    expect(window.localStorage.getItem("kumo:collaboration-telemetry")).toContain('"event":"lost"');

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.authenticatedFetch.mockResolvedValue({ accepted: true });
    await reportCollaborationTelemetry({
      event: "restored", boardId: "board", roomId: "board:board",
    });
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(mocks.authenticatedFetch.mock.calls[1]![1].body)).toMatchObject({ event: "lost" });
    expect(JSON.parse(mocks.authenticatedFetch.mock.calls[2]![1].body)).toMatchObject({ event: "restored" });
    expect(window.localStorage.getItem("kumo:collaboration-telemetry")).toBeNull();
  });

  it("retries transient online delivery before leaving telemetry queued", async () => {
    mocks.authenticatedFetch.mockRejectedValueOnce(new Error("temporary contention")).mockResolvedValue({ accepted: true });
    await reportCollaborationTelemetry({ event: "ready", boardId: "board", roomId: "board:board" });
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("kumo:collaboration-telemetry")).toBeNull();
  });

  it("ignores malformed queues and operates without browser globals during SSR", async () => {
    window.localStorage.setItem("kumo:collaboration-telemetry", "not-json");
    mocks.authenticatedFetch.mockResolvedValue({ accepted: true });
    await reportCollaborationTelemetry({ event: "ready", boardId: "board", roomId: "room" });
    expect(window.localStorage.getItem("kumo:collaboration-telemetry")).toBeNull();
    window.localStorage.setItem("kumo:collaboration-telemetry", JSON.stringify({ event: "invalid" }));
    await reportCollaborationTelemetry({ event: "ready", boardId: "board", roomId: "room" });
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);
    await reportCollaborationTelemetry({ event: "ready", boardId: "board", roomId: "room" });
    vi.unstubAllGlobals();
  });
});
