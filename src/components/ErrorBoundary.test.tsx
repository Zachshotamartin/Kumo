import { fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const Broken = () => { throw new Error("broken"); };

it("renders recovery UI and reloads after an unrecoverable render error", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  render(<ErrorBoundary><Broken /></ErrorBoundary>);
  expect(screen.getByText("Something interrupted this workspace.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload Kumo" }));
  expect(reload).toHaveBeenCalled();
});
