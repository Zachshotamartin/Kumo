import { ArrowLeft, ArrowRight, CaretRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { BoardTrailEntry } from "../../editor/advancedFeatures";
import { pushBoardTrail } from "../../editor/advancedFeatures";
import { clearSelectedShapes, setSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { getBoard } from "../../services/boardRepository";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const STORAGE_KEY = "kumo:board-navigation:v1";

interface NavigationState {
  entries: BoardTrailEntry[];
  index: number;
}

const readState = (): NavigationState => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<NavigationState>;
    const entries = Array.isArray(parsed.entries) ? parsed.entries.filter((entry) => entry && typeof entry.boardId === "string") : [];
    const index = Number.isInteger(parsed.index) ? Math.min(entries.length - 1, Math.max(0, parsed.index!)) : Math.max(0, entries.length - 1);
    return { entries, index };
  } catch {
    return { entries: [], index: 0 };
  }
};

const writeState = (state: NavigationState) => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Navigation remains functional without persistence. */ }
};

export const BoardNavigation = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const [navigation, setNavigation] = useState(readState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!board.id) return;
    const timer = window.setTimeout(() => {
      setNavigation((current) => {
        const active = current.entries[current.index];
        if (active?.boardId === board.id) return current;
        const entries = pushBoardTrail(current.entries.slice(0, current.index + 1), { boardId: board.id!, title: board.title ?? "Untitled board" });
        const next = { entries, index: entries.length - 1 };
        writeState(next);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [board.id, board.title]);

  useEffect(() => {
    const linked = (event: Event) => {
      const detail = (event as CustomEvent<BoardTrailEntry>).detail;
      if (!detail?.boardId) return;
      setNavigation((current) => {
        const base = current.entries.slice(0, current.index + 1);
        if (base[current.index] && detail.sourceShapeId) {
          base[current.index] = { ...base[current.index]!, sourceShapeId: detail.sourceShapeId };
        }
        const entries = pushBoardTrail(base, { ...detail, sourceShapeId: undefined });
        const next = { entries, index: entries.length - 1 };
        writeState(next);
        return next;
      });
    };
    window.addEventListener("kumo:board-navigate", linked);
    return () => window.removeEventListener("kumo:board-navigate", linked);
  }, []);

  const openAt = useCallback(async (index: number) => {
    const target = navigation.entries[index]!;
    setBusy(true);
    setError(null);
    try {
      const nextBoard = await getBoard(target.boardId);
      const url = new URL(window.location.href);
      url.searchParams.set("board", target.boardId);
      if (target.sourceShapeId) url.searchParams.set("selection", target.sourceShapeId);
      else url.searchParams.delete("selection");
      window.history.replaceState({}, "", url);
      dispatch(clearSelectedShapes());
      dispatch(setWhiteboardData(nextBoard));
      if (target.sourceShapeId) dispatch(setSelectedShapes([target.sourceShapeId]));
      const next = { ...navigation, index };
      writeState(next);
      setNavigation(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't open this board.");
    } finally {
      setBusy(false);
    }
  }, [dispatch, navigation]);

  const visible = navigation.entries.slice(Math.max(0, navigation.index - 2), navigation.index + 1);
  return <nav className={styles.boardNavigation} aria-label="Connected board history">
    <button type="button" aria-label="Previous connected board" disabled={busy || navigation.index <= 0} onClick={() => void openAt(navigation.index - 1)}><ArrowLeft aria-hidden="true" /></button>
    <button type="button" aria-label="Next connected board" disabled={busy || navigation.index >= navigation.entries.length - 1} onClick={() => void openAt(navigation.index + 1)}><ArrowRight aria-hidden="true" /></button>
    <span className={styles.boardTrail}>
      {visible.map((entry, offset) => <span key={`${entry.boardId}:${offset}`}>{offset > 0 && <CaretRight aria-hidden="true" />}<button type="button" disabled={busy} onClick={() => void openAt(Math.max(0, navigation.index - visible.length + 1 + offset))}>{entry.title}</button></span>)}
    </span>
    {error && <span className={styles.navigationError} role="alert">{error}</span>}
  </nav>;
};
