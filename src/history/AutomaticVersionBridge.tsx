import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store";
import { createBoardAutosave } from "../services/versionRepository";

export const AUTOSAVE_INTERVAL_MS = 30 * 60 * 1000;

export const AutomaticVersionBridge = () => {
  const boardId = useSelector((state: RootState) => state.whiteBoard.id);
  const branchId = useSelector((state: RootState) => state.whiteBoard.activeBranchId);
  const role = useSelector((state: RootState) => state.whiteBoard.role);
  const actorId = useSelector((state: RootState) => state.auth.uid);

  useEffect(() => {
    if (!boardId || !actorId || actorId.startsWith("guest:") || role === "viewer") return;
    const save = () => void createBoardAutosave(boardId, branchId).catch(() => undefined);
    const interval = window.setInterval(save, AUTOSAVE_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [actorId, boardId, branchId, role]);
  return null;
};
