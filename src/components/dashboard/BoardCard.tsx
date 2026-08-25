import { useEffect, useState } from "react";
import { Archive, ArrowCounterClockwise, ArrowUpRight, Copy, Graph, Star, Trash } from "@phosphor-icons/react";
import { loadBoardPreview, type BoardSummary } from "../../services/boardRepository";
import styles from "./BoardDashboard.module.css";
import ui from "../ui/Ui.module.css";
import type { BoardOrganization, WorkspaceFolder } from "../../services/productRepository";

const BoardPreview = ({ board }: { board: BoardSummary }) => {
  const [source, setSource] = useState(board.thumbnailUrl ?? null);
  const [loadGenerated, setLoadGenerated] = useState(!board.thumbnailUrl);

  useEffect(() => {
    if (!loadGenerated) return;
    let active = true;
    let generatedUrl: string | null = null;
    const controller = new AbortController();
    void loadBoardPreview(board.id, controller.signal)
      .then((url) => {
        generatedUrl = url;
        if (active) setSource(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        // The placeholder is already visible while generated previews load.
      });
    return () => {
      active = false;
      controller.abort();
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
  organization,
  folders = [],
  onOrganize,
}: {
  board: BoardSummary;
  onOpen: () => void;
  actionLabel?: "Open" | "Copy" | "View";
  organization?: BoardOrganization;
  folders?: WorkspaceFolder[];
  onOrganize?: (action: "move-board" | "favorite-board" | "archive-board" | "trash-board" | "restore-board", payload?: Record<string, unknown>) => void;
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
    {onOrganize && <div className={styles.boardOrganization}>
      <button type="button" aria-label={organization?.favorite ? `Remove ${board.title} from favorites` : `Add ${board.title} to favorites`} aria-pressed={Boolean(organization?.favorite)} onClick={() => onOrganize("favorite-board", { favorite: !organization?.favorite })}><Star aria-hidden="true" weight={organization?.favorite ? "fill" : "regular"} /></button>
      {organization?.trashed_at ? <button type="button" aria-label={`Restore ${board.title}`} onClick={() => onOrganize("restore-board")}><ArrowCounterClockwise aria-hidden="true" /></button> : <><button type="button" aria-label={`Archive ${board.title}`} onClick={() => onOrganize("archive-board")}><Archive aria-hidden="true" /></button><button type="button" aria-label={`Move ${board.title} to trash`} onClick={() => onOrganize("trash-board")}><Trash aria-hidden="true" /></button></>}
      <select aria-label={`Folder for ${board.title}`} value={organization?.folder_id ?? ""} onChange={(event) => onOrganize("move-board", { folderId: event.target.value || null })}><option value="">No folder</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select>
    </div>}
  </article>
);
