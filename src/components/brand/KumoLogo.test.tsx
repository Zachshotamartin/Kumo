import { render, waitFor } from "@testing-library/react";
import KumoLogo from "./KumoLogo";
import { KUMO_LOGO_CONFIG } from "./KumoLogoConfig";

class MockKumoLogoElement extends HTMLElement {
  configure = vi.fn((_config: typeof KUMO_LOGO_CONFIG) => this);
  playAnimation: ReturnType<typeof vi.fn> | undefined = vi.fn().mockResolvedValue(undefined);
  playBreak = vi.fn(() => true);
  resumeIdle = vi.fn(() => this);
  setContext = vi.fn(() => true);

  set config(value: typeof KUMO_LOGO_CONFIG) {
    this.configure(value);
  }
}

if (!customElements.get("kumo-logo")) {
  customElements.define("kumo-logo", MockKumoLogoElement);
}

describe("KumoLogo", () => {
  it("installs the approved articulated design without replaying runtime contexts", async () => {
    const { container, rerender } = render(
      <KumoLogo label="Animated Kumo mascot" startupAnimation="startup" />
    );
    const logo = container.querySelector("kumo-logo") as MockKumoLogoElement;

    expect(logo).toHaveAttribute("aria-label", "Animated Kumo mascot");
    await waitFor(() => expect(logo.configure).toHaveBeenCalledWith(KUMO_LOGO_CONFIG));
    expect(logo.playAnimation).toHaveBeenCalledWith("startup");
    expect(logo.configure.mock.invocationCallOrder[0]).toBeLessThan(
      logo.playAnimation!.mock.invocationCallOrder[0]!
    );
    expect(logo.setContext).not.toHaveBeenCalled();
    expect(logo.resumeIdle).not.toHaveBeenCalled();

    rerender(<KumoLogo context="loading" decorative />);
    expect(logo).toHaveAttribute("context", "loading");
    expect(logo.setContext).not.toHaveBeenCalled();
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

  it("plays a scoped startup animation only once across sequential loading mounts", async () => {
    const first = render(
      <KumoLogo startupAnimation="startup" animationScope="test-app-startup" />
    );
    const firstLogo = first.container.querySelector("kumo-logo") as MockKumoLogoElement;
    await waitFor(() => expect(firstLogo.playAnimation).toHaveBeenCalledOnce());
    first.unmount();

    const second = render(
      <KumoLogo startupAnimation="startup" animationScope="test-app-startup" />
    );
    const secondLogo = second.container.querySelector("kumo-logo") as MockKumoLogoElement;
    await waitFor(() => expect(secondLogo).toBeInTheDocument());
    expect(secondLogo.playAnimation).not.toHaveBeenCalled();
  });
});
