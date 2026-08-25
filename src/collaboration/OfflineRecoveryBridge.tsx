import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../store";
import { updateBoardSettings } from "../services/boardRepository";
import {
  clearRecoverySnapshot,
  replayQueuedMutations,
  saveRecoverySnapshot,
} from "./offlineRecovery";

export const OfflineRecoveryBridge = ({ connectionStatus }: { connectionStatus: string }) => {
  const board = useSelector((state: RootState) => state.whiteBoard);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!board.id || (connectionStatus !== "disconnected" && connectionStatus !== "reconnecting")) return;
    wasOffline.current = true;
    saveRecoverySnapshot({
      boardId: board.id,
      savedAt: Date.now(),
      baseRevision: board.revision,
      backgroundColor: board.backGroundColor,
      shapes: board.shapes,
    });
  }, [board.backGroundColor, board.id, board.revision, board.shapes, connectionStatus]);

  useEffect(() => {
    if (!board.id || connectionStatus !== "connected") return;
    void replayQueuedMutations(async (mutation) => {
      await updateBoardSettings(mutation.boardId, mutation.payload);
    }).then((failures) => {
      if (wasOffline.current && failures.length === 0) {
        window.setTimeout(() => clearRecoverySnapshot(board.id!), 1_500);
        wasOffline.current = false;
      }
    });
  }, [board.id, connectionStatus]);

  return null;
};
