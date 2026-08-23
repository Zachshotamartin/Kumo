import type { CSSProperties, ReactNode } from "react";
import styles from "./SelectionHighlight.module.css";

interface SelectionHighlightProps {
  style: CSSProperties;
  children?: ReactNode;
  decorative?: boolean;
}

export const SelectionHighlight = ({
  style,
  children,
  decorative = false,
}: SelectionHighlightProps) => (
  <div
    className={styles.selectionHighlight}
    data-selection-highlight="true"
    style={style}
    role={decorative ? undefined : "group"}
    aria-label={decorative ? undefined : "Selection transform controls"}
    aria-hidden={decorative || undefined}
  >
    {children}
  </div>
);
