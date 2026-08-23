import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { signOut } from "firebase/auth";
import KumoLogo from "../brand/KumoLogo";
import { auth } from "../../config/firebase";
import { logout } from "../../features/auth/authSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  BoardSummary,
  createBoard,
  duplicateBoard,
  getBoard,
  listBoards,
  searchPublicBoards,
} from "../../services/boardRepository";
import { AppDispatch, RootState } from "../../store";
import styles from "./BoardDashboard.module.css";

const BoardCard = ({
  board,
  onOpen,
  actionLabel = "Open",
}: {
  board: BoardSummary;
  onOpen: () => void;
  actionLabel?: string;
}) => (
  <article className={styles.boardCard}>
    <button type="button" className={styles.boardPreview} onClick={onOpen} aria-label={`${actionLabel} ${board.title}`}>
      <span className={styles.previewGrid} aria-hidden="true" />
      <span className={styles.previewGlyph} aria-hidden="true">{board.title.slice(0, 1).toUpperCase()}</span>
    </button>
    <div className={styles.boardMeta}>
      <div>
        <h3>{board.title}</h3>
        <p>{board.visibility === "public" ? "Public board" : "Private board"}</p>
      </div>
      <button type="button" onClick={onOpen}>{actionLabel}</button>
    </div>
  </article>
);

const BoardDashboard = () => {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [publicBoards, setPublicBoards] = useState<BoardSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user.uid) return;
    let active = true;
    void listBoards()
      .then((nextBoards) => {
        if (!active) return;
        setBoards(nextBoards);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("We couldn't load your boards.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [user.uid]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      void searchPublicBoards(normalized)
        .then((results) => active && setPublicBoards(results))
        .catch(() => active && setPublicBoards([]));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const myBoards = boards.filter((board) => board.ownerId === user.uid);
  const sharedBoards = boards.filter((board) => board.ownerId !== user.uid);
  const publicResults = publicBoards;

  const openBoard = async (boardId: string) => {
    setError(null);
    try {
      const board = await getBoard(boardId);
      dispatch(clearSelectedShapes());
      dispatch(setWhiteboardData(board));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't open this board.");
    }
  };

  const handleCreate = async () => {
    if (!user.uid || creating) return;
    setCreating(true);
    setError(null);
    try {
      const boardId = await createBoard("Untitled board");
      await openBoard(boardId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't create a board.");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (boardId: string) => {
    if (!user.uid) return;
    setError(null);
    try {
      const copyId = await duplicateBoard(boardId);
      await openBoard(copyId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't copy this board.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    dispatch(logout());
  };

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <a className={styles.brand} href="#main-content" aria-label="Kumo boards">
          <KumoLogo className={styles.brandLogo} decorative />
          <span className={styles.brandName}>Kumo</span>
        </a>
        <label className={styles.search}>
          <span className="sr-only">Search public boards</span>
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search public boards" />
        </label>
        <div className={styles.account}>
          <span>{user.email}</span>
          <button type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Your workspace</p>
            <h1>Make the next thing clear.</h1>
            <p>Open a board or start with an empty canvas.</p>
          </div>
          <button type="button" className={styles.createButton} onClick={handleCreate} disabled={creating}>
            <span aria-hidden="true">＋</span>
            {creating ? "Creating" : "New board"}
          </button>
        </section>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {query.trim() ? (
          <section className={styles.boardSection}>
            <div className={styles.sectionHeading}>
              <h2>Public results</h2>
              <span>{publicResults.length}</span>
            </div>
            {publicResults.length > 0 ? (
              <div className={styles.boardGrid}>
                {publicResults.map((board) => (
                  <BoardCard key={board.id} board={board} actionLabel={board.ownerId === user.uid ? "Open" : "Copy"} onOpen={() => board.ownerId === user.uid ? openBoard(board.id) : handleCopy(board.id)} />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}><p>No public boards match “{query}”.</p><span>Try a shorter title or create your own.</span></div>
            )}
          </section>
        ) : (
          <>
            <section className={styles.boardSection}>
              <div className={styles.sectionHeading}>
                <h2>My boards</h2>
                <span>{myBoards.length}</span>
              </div>
              {loading ? (
                <div className={styles.skeletonGrid} aria-label="Loading boards">{[0, 1, 2].map((value) => <span key={value} />)}</div>
              ) : myBoards.length > 0 ? (
                <div className={styles.boardGrid}>{myBoards.map((board) => <BoardCard key={board.id} board={board} onOpen={() => openBoard(board.id)} />)}</div>
              ) : (
                <div className={styles.emptyState}><p>No boards yet.</p><span>Your first board starts as a clean, private canvas.</span><button type="button" onClick={handleCreate}>Create a board</button></div>
              )}
            </section>
            {sharedBoards.length > 0 && (
              <section className={styles.boardSection}>
                <div className={styles.sectionHeading}><h2>Shared with me</h2><span>{sharedBoards.length}</span></div>
                <div className={styles.boardGrid}>{sharedBoards.map((board) => <BoardCard key={board.id} board={board} onOpen={() => openBoard(board.id)} />)}</div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default BoardDashboard;
