import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, Graph } from "@phosphor-icons/react";
import { loadBoardPreview, type BoardSummary } from "../../services/boardRepository";
import styles from "./BoardDashboard.module.css";
import ui from "../ui/Ui.module.css";

const BoardPreview = ({ board }: { board: BoardSummary }) => {
  const [source, setSource] = useState(board.thumbnailUrl ?? null);
  const [loadGenerated, setLoadGenerated] = useState(!board.thumbnailUrl);

  useEffect(() => {
    if (!loadGenerated) return;
    let active = true;
    let generatedUrl: string | null = null;
    void loadBoardPreview(board.id)
      .then((url) => {
        generatedUrl = url;
        if (active) setSource(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => active && setSource(null));
    return () => {
      active = false;
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [board.id, loadGenerated]);

  if (!source) {
    return <span className={styles.previewPlaceholder} aria-hidden="true"><Graph weight="duotone" /></span>;
  }
  return (
    <img
      className={styles.previewImage}
      src={source}
      alt=""
      onError={() => {
        if (source === board.thumbnailUrl) setLoadGenerated(true);
        setSource(null);
      }}
    />
  );
};

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
      <BoardPreview key={`${board.id}:${board.thumbnailUrl ?? ""}`} board={board} />
    </button>
    <div className={styles.boardMeta}>
      <div>
        <h3>{board.title}</h3>
        <p>{board.visibility === "public" ? "Public board" : "Private board"}</p>
      </div>
      <button
        type="button"
        className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${ui.iconButton}`}
        onClick={onOpen}
        aria-label={`${actionLabel} ${board.title} from board details`}
        title={actionLabel}
      >
        {actionLabel === "Copy" ? <Copy aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
      </button>
    </div>
  </article>
);
