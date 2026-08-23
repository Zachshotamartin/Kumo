import { render, screen } from "@testing-library/react";
import MiddlePage from "./middlePage/middlePage";
import WorkSpace from "./workSpace/workSpace";

vi.mock("./dashboard/BoardDashboard", () => ({ default: () => <div>Dashboard route</div> }));
vi.mock("../collaboration/BoardRoom", () => ({ default: () => <div>Board route</div> }));

it("routes the legacy component entry points to the current dashboard and board room", () => {
  const { rerender } = render(<MiddlePage />);
  expect(screen.getByText("Dashboard route")).toBeInTheDocument();
  rerender(<WorkSpace />);
  expect(screen.getByText("Board route")).toBeInTheDocument();
});
