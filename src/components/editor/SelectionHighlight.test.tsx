import { render, screen } from "@testing-library/react";
import { SelectionHighlight } from "./SelectionHighlight";

describe("SelectionHighlight", () => {
  it("announces interactive transform controls", () => {
    render(<SelectionHighlight style={{ left: 12 }}><button>Resize</button></SelectionHighlight>);
    const highlight = screen.getByRole("group", { name: "Selection transform controls" });
    expect(highlight).toHaveAttribute("data-selection-highlight", "true");
    expect(highlight).toHaveStyle({ left: "12px" });
    expect(screen.getByRole("button", { name: "Resize" })).toBeVisible();
  });

  it("hides decorative selections from assistive technology", () => {
    const { container } = render(<SelectionHighlight decorative style={{ inset: 0 }} />);
    expect(container.querySelector("[data-selection-highlight='true']"))
      .toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
