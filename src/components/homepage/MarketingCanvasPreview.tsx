import { useLayoutEffect, useRef, useState } from "react";
import KumoLogo from "../brand/KumoLogo";
import type { KumoLogoContext } from "../brand/KumoLogoConfig";
import { layoutMarketingShapes } from "./marketingCanvasModel";
import styles from "./MarketingCanvas.module.css";

// Paint the same document before the interactive editor module is available.
// Authentication controls can become usable without downloading the editor.
const MarketingCanvasPreview = ({ logoContext, logoStatus }: { logoContext: KumoLogoContext; logoStatus: string }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 1000, mobile: false });
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const resize = () => {
      const rect = root.getBoundingClientRect();
      setSize({ width: rect.width || 1000, height: rect.height || 1000, mobile: window.innerWidth <= 820 });
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const shapes = layoutMarketingShapes(logoStatus, size.width, size.height, size.mobile);
  return (
    <div ref={rootRef} className={styles.marketingCanvas} data-context={logoContext} aria-label="Loading interactive canvas">
      {shapes.filter((shape) => !shape.hidden).map((shape) => {
        const Tag = shape.id === "marketing-headline" ? "h1" : "div";
        return <Tag key={shape.id} style={{
          position: "absolute", left: shape.x1, top: shape.y1, width: shape.width,
          margin: 0, color: shape.color, fontFamily: shape.fontFamily, fontSize: shape.fontSize,
          fontWeight: shape.fontWeight, lineHeight: shape.lineHeight, letterSpacing: shape.letterSpacing,
          whiteSpace: "pre-wrap", overflowWrap: "break-word",
        }}>{shape.text}</Tag>;
      })}
      <div className={styles.heroVisual}>
        <KumoLogo className={styles.brandLogo} context={logoContext} label="Animated Kumo mascot" startupAnimation="startup" animationScope="app-startup" />
      </div>
    </div>
  );
};

export default MarketingCanvasPreview;
