import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store";
import { setRightPanel } from "../features/editor/editorSlice";
import { updateBoardSettings } from "../services/boardRepository";
import { hydrateQueuedMutations, hydrateRecoverySnapshot, replayQueuedMutations, saveRecoverySnapshot } from "./offlineRecovery";
import { recordSyncEvent } from "./offlineJournal";

export const OfflineRecoveryBridge = ({ connectionStatus }: { connectionStatus: string }) => {
  const board = useSelector((state: RootState) => state.whiteBoard);
  const dispatch = useDispatch<AppDispatch>();
  const wasOffline = useRef(false);
  const connectedBase = useRef({ boardId: board.id, revision: board.revision, backgroundColor: board.backGroundColor, shapes: board.shapes });

  useEffect(() => {
    if (!board.id) return;
    void Promise.all([hydrateRecoverySnapshot(board.id), hydrateQueuedMutations()]).then(([snapshot]) => {
      if (snapshot) dispatch(setRightPanel("platform"));
    });
  }, [board.id, dispatch]);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    connectedBase.current = { boardId: board.id, revision: board.revision, backgroundColor: board.backGroundColor, shapes: board.shapes };
  }, [board.backGroundColor, board.id, board.revision, board.shapes, connectionStatus]);

  useEffect(() => {
    if (!board.id || (connectionStatus !== "disconnected" && connectionStatus !== "reconnecting")) return;
    wasOffline.current = true;
    void recordSyncEvent({ boardId: board.id, status: "offline", at: Date.now() });
    saveRecoverySnapshot({
      boardId: board.id,
      savedAt: Date.now(),
      baseRevision: board.revision,
      baseBackgroundColor: connectedBase.current.boardId === board.id ? connectedBase.current.backgroundColor : board.backGroundColor,
      baseShapes: connectedBase.current.boardId === board.id ? connectedBase.current.shapes : board.shapes,
      backgroundColor: board.backGroundColor,
      shapes: board.shapes,
    });
  }, [board.backGroundColor, board.id, board.revision, board.shapes, connectionStatus]);

  useEffect(() => {
    if (!board.id || connectionStatus !== "connected") return;
    void recordSyncEvent({ boardId: board.id, status: "replaying", at: Date.now() });
    void replayQueuedMutations(async (mutation) => {
      await updateBoardSettings(mutation.boardId, mutation.payload);
    }).then((failures) => {
      if (wasOffline.current && failures.length === 0) {
        void recordSyncEvent({ boardId: board.id!, status: "synced", at: Date.now() });
        dispatch(setRightPanel("platform"));
        wasOffline.current = false;
      }
      if (failures.length) void recordSyncEvent({ boardId: board.id!, status: "failed", at: Date.now(), detail: `${failures.length} queued mutations remain` });
    });
  }, [board.id, connectionStatus, dispatch]);

  return null;
};
