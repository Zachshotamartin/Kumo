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
  style?: CSSProperties;
}

const serializedConfig = JSON.stringify(KUMO_LOGO_CONFIG);

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

/**
 * Shared host for the locally bundled Kumo Logo Studio web component loaded in index.html.
 * Keeping configuration here prevents visual drift between product surfaces.
 */
const KumoLogo = ({
  className,
  context = "idle",
  decorative = false,
  label = "Kumo",
  startupAnimation,
  style,
}: KumoLogoProps) => {
  const [element, setElement] = useState<KumoLogoElement | null>(null);
  const latestContext = useRef(context);

  useEffect(() => {
    latestContext.current = context;
    let active = true;
    void whenLogoIsDefined().then(() => {
      const logo = element;
      if (!active || !logo) return;
      logo.configure(KUMO_LOGO_CONFIG);
      if (context === "idle") logo.resumeIdle();
      else logo.setContext(context);
    });
    return () => { active = false; };
  }, [context, element]);

  useEffect(() => {
    if (!startupAnimation) return;
    let active = true;
    void whenLogoIsDefined().then(async () => {
      const logo = element;
      if (!active || !logo) return;
      if (logo.playAnimation) await logo.playAnimation(startupAnimation);
      else logo.playBreak(startupAnimation === "intro" ? "scuttle" : "stretch");
      if (!active) return;
      const currentContext = latestContext.current;
      if (currentContext === "idle") logo.resumeIdle();
      else logo.setContext(currentContext);
    });
    return () => { active = false; };
  }, [element, startupAnimation]);

  return createElement("kumo-logo", {
    "aria-hidden": decorative ? "true" : undefined,
    "aria-label": decorative ? undefined : label,
    className,
    config: serializedConfig,
    context,
    ref: setElement,
    style,
  });
};

export default KumoLogo;
