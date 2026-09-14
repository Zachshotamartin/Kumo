import { act, render, screen } from "@testing-library/react";
import MarketingCanvasPreview from "./MarketingCanvasPreview";

vi.mock("../brand/KumoLogo", () => ({ default: ({ label }: { label: string }) => <div aria-label={label} /> }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("paints the responsive marketing document while the editor loads", () => {
  let resize!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
  vi.stubGlobal("innerWidth", 1350);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 878, height: 940 } as DOMRect);
  const preview = render(<MarketingCanvasPreview logoContext="idle" logoStatus="Ready" />);
  const heading = screen.getByRole("heading", { name: "Every board can lead somewhere." });
  expect(heading).toHaveStyle({ left: "52.68px", top: "699.36px" });
  expect(screen.getByText("Ready")).toBeVisible();
  expect(screen.getByLabelText("Animated Kumo mascot")).toBeVisible();
  vi.stubGlobal("innerWidth", 390);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 390, height: 620 } as DOMRect);
  act(() => resize());
  expect(heading).toHaveStyle({ left: "24px", top: "390px", width: "342px" });
  preview.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

it("uses initial document dimensions before layout is available without ResizeObserver", () => {
  vi.stubGlobal("ResizeObserver", undefined);
  render(<MarketingCanvasPreview logoContext="loading" logoStatus="Checking session" />);
  expect(screen.getByRole("heading")).toHaveStyle({ left: "60px", top: "744px" });
  expect(screen.getByText("Checking session")).toBeVisible();
});
