import { X } from "@phosphor-icons/react";
import ui from "../ui/Ui.module.css";
import styles from "./EditorWorkspace.module.css";

/**
 * The canvas's single notice area: save failures, rejected uploads and other workspace errors.
 * It sits at the top of the canvas, below the ruler, so it never covers the tools at the bottom.
 */
const CanvasNotice = ({ message, onDismiss }: { message: string | null; onDismiss: () => void }) => message ? (
  <div className={`${ui.notice} ${ui.noticeError} ${styles.canvasNotice}`} role="alert">
    <span>{message}</span>
    <button type="button" aria-label="Dismiss error" onClick={onDismiss}><X aria-hidden="true" /></button>
  </div>
) : null;

export default CanvasNotice;
