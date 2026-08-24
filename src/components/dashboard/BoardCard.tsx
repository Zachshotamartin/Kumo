import { ArrowUpRight, Copy, Graph } from "@phosphor-icons/react";
import type { BoardSummary } from "../../services/boardRepository";
import styles from "./BoardDashboard.module.css";

export const BoardCard = ({
  board,
  onOpen,
  actionLabel = "Open",
}: {
  board: BoardSummary;
  onOpen: () => void;
  actionLabel?: "Open" | "Copy" | "View";
}) => (
  <article className={styles.boardCard}>
    <button type="button" className={styles.boardPreview} onClick={onOpen} aria-label={`${actionLabel} ${board.title}`}>
      {board.thumbnailUrl ? (
        <img className={styles.previewImage} src={board.thumbnailUrl} alt="" />
      ) : (
        <span className={styles.previewPlaceholder} aria-hidden="true">
          <Graph weight="duotone" />
        </span>
      )}
    </button>
    <div className={styles.boardMeta}>
      <div>
        <h3>{board.title}</h3>
        <p>{board.visibility === "public" ? "Public board" : "Private board"}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${actionLabel} ${board.title} from board details`}
        title={actionLabel}
      >
        {actionLabel === "Copy" ? <Copy aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
      </button>
    </div>
  </article>
);
