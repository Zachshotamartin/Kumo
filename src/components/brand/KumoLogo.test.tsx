import { render, waitFor } from "@testing-library/react";
import KumoLogo from "./KumoLogo";
import { KUMO_LOGO_CONFIG } from "./KumoLogoConfig";

class MockKumoLogoElement extends HTMLElement {
  configure = vi.fn(() => this);
  playAnimation: ReturnType<typeof vi.fn> | undefined = vi.fn().mockResolvedValue(undefined);
  playBreak = vi.fn(() => true);
  resumeIdle = vi.fn(() => this);
  setContext = vi.fn(() => true);
}

if (!customElements.get("kumo-logo")) {
  customElements.define("kumo-logo", MockKumoLogoElement);
}

describe("KumoLogo", () => {
  it("keeps every product logo on the approved design and drives runtime contexts", async () => {
    const { container, rerender } = render(
      <KumoLogo label="Animated Kumo mascot" startupAnimation="swirl" />
    );
    const logo = container.querySelector("kumo-logo") as MockKumoLogoElement;

    expect(logo).toHaveAttribute("aria-label", "Animated Kumo mascot");
    expect(JSON.parse(logo.getAttribute("config") ?? "{}")).toEqual(KUMO_LOGO_CONFIG);
    await waitFor(() => expect(logo.configure).toHaveBeenCalledWith(KUMO_LOGO_CONFIG));
    expect(logo.playAnimation).toHaveBeenCalledWith("swirl");
    expect(logo.resumeIdle).toHaveBeenCalled();

    rerender(<KumoLogo context="loading" decorative />);
    await waitFor(() => expect(logo.setContext).toHaveBeenCalledWith("loading"));
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).not.toHaveAttribute("aria-label");
  });

  it("falls back to a supported leg gesture until startup animations ship", async () => {
    const { container, rerender } = render(<KumoLogo />);
    const logo = container.querySelector("kumo-logo") as MockKumoLogoElement;
    logo.playAnimation = undefined;

    rerender(<KumoLogo startupAnimation="intro" />);
    await waitFor(() => expect(logo.playBreak).toHaveBeenCalledWith("scuttle"));
  });
});
