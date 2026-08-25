import { fireEvent, render, screen } from "@testing-library/react";
import { downloadBlob } from "../../editor/export";
import type { OperationsOverview } from "../../services/platformRepository";
import { ActivityLog } from "./ActivityLog";
import { csvCell } from "./activityCsv";

vi.mock("../../editor/export", () => ({ downloadBlob: vi.fn() }));

const operations: OperationsOverview = {
  telemetry: { counts: { ready: 1, lost: 0, failed: 0, restored: 0 }, eventCount: 1, retryCount: 0, recoveryRate: 1, averageRecoveryMs: 0, healthy: true },
  events: [
    { id: 1, board_id: "board-alpha", actor_id: "ada", event_type: "board.shared", payload: { role: "editor" }, created_at: new Date().toISOString() },
    { id: 2, board_id: null, actor_id: "lin", event_type: "account.updated", payload: {}, created_at: "2020-01-01T00:00:00.000Z" },
  ],
};

describe("activity log", () => {
  it("neutralizes spreadsheet formulas in exported cells", () => {
    expect(csvCell("=HYPERLINK(\"https://evil.test\")")).toBe('"\'=HYPERLINK(""https://evil.test"")"');
    expect(csvCell("ordinary")).toBe('"ordinary"');
    expect(csvCell(null)).toBe('""');
  });

  it("filters by text, event type, and retention window", () => {
    render(<ActivityLog operations={operations} />);
    expect(screen.getByRole("list", { name: "1 activity events" })).toHaveTextContent("board shared");
    fireEvent.change(screen.getByLabelText("Activity date range"), { target: { value: "all" } });
    expect(screen.getByRole("list", { name: "2 activity events" })).toHaveTextContent("account updated");
    fireEvent.change(screen.getByPlaceholderText("Search activity"), { target: { value: "ada" } });
    expect(screen.getByRole("list", { name: "1 activity events" })).toHaveTextContent("board shared");
    fireEvent.change(screen.getByLabelText("Activity type"), { target: { value: "account.updated" } });
    expect(screen.getByText("No activity matches these filters.")).toBeVisible();
  });

  it("renders events whose legacy payload is absent without crashing", () => {
    render(<ActivityLog operations={{
      ...operations,
      events: [{ ...operations.events[0]!, payload: null as unknown as Record<string, unknown> }],
    }} />);
    expect(screen.getByText("No details")).toBeVisible();
  });

  it("exports the currently visible, quoted CSV data", async () => {
    render(<ActivityLog operations={operations} />);
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^kumo-activity-\d{4}-\d{2}-\d{2}\.csv$/));
    const blob = vi.mocked(downloadBlob).mock.calls[0]?.[0];
    expect(await blob?.text()).toContain('"board.shared","ada","board-alpha"');
  });
});
