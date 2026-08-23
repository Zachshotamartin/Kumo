import { createElement, type CSSProperties, useEffect, useRef, useState } from "react";
import { KUMO_LOGO_CONFIG, type KumoLogoContext } from "./KumoLogoConfig";

export type KumoAnimation =
  | "startup"
  | "intro"
  | "swirl"
  | "thinking"
  | "wink"
  | "wide"
  | "alert"
  | "notify"
  | "exclaim"
  | "sleep"
  | "egg"
  | "hexagon"
  | "play"
  | "orbit"
  | "burst"
  | "comet";

interface KumoLogoProps {
  className?: string;
  context?: KumoLogoContext;
  decorative?: boolean;
  label?: string;
  startupAnimation?: KumoAnimation;
  animationScope?: string;
  style?: CSSProperties;
}

interface KumoLogoElement extends HTMLElement {
  configure: (config: typeof KUMO_LOGO_CONFIG) => KumoLogoElement;
  playAnimation?: (name: KumoAnimation) => Promise<unknown>;
  playBreak: (name: "stretch" | "scuttle" | "curl") => boolean;
  resumeIdle: () => KumoLogoElement;
  setContext: (context: Exclude<KumoLogoContext, "idle">) => boolean;
}

const whenLogoIsDefined = () => {
  if (typeof window === "undefined" || !window.customElements) return Promise.resolve();
  return window.customElements.whenDefined("kumo-logo");
};

const playedAnimationScopes = new Set<string>();

/** Shared host for the locally bundled Kumo Logo Studio web component. */
const KumoLogo = ({
  className,
  context = "idle",
  decorative = false,
  label = "Kumo",
  startupAnimation,
  animationScope,
  style,
}: KumoLogoProps) => {
  const [element, setElement] = useState<KumoLogoElement | null>(null);
  const playedAnimation = useRef(false);

  useEffect(() => {
    if (!element) return;
    let active = true;
    void whenLogoIsDefined().then(async () => {
      const logo = element;
      if (!active || !logo) return;
      // React assigns known custom-element properties instead of retaining their
      // attributes. Configure imperatively so the authored paddle-leg rig is
      // installed before any animation samples its geometry.
      logo.configure(KUMO_LOGO_CONFIG);
      if (!startupAnimation || playedAnimation.current) return;
      if (animationScope && playedAnimationScopes.has(animationScope)) return;
      playedAnimation.current = true;
      if (animationScope) playedAnimationScopes.add(animationScope);
      if (logo.playAnimation) await logo.playAnimation(startupAnimation);
      else logo.playBreak(startupAnimation === "intro" ? "scuttle" : "stretch");
    });
    return () => { active = false; };
  }, [animationScope, element, startupAnimation]);

  return createElement("kumo-logo", {
    "aria-hidden": decorative ? "true" : undefined,
    "aria-label": decorative ? undefined : label,
    className,
    config: KUMO_LOGO_CONFIG,
    context,
    ref: setElement,
    style,
  });
};

export default KumoLogo;
