import { useEffect, useRef } from "react";
import { useLostConnectionListener, useStatus } from "@liveblocks/react";
import { useSelector } from "react-redux";
import type { RootState } from "../store";
import {
  consumeCollaborationAuthAttempts,
  reportCollaborationTelemetry,
} from "./connectionTelemetry";

const safelyReport = (input: Parameters<typeof reportCollaborationTelemetry>[0]) => {
  void reportCollaborationTelemetry(input).catch((error: unknown) => {
    console.warn("Kumo could not record collaboration telemetry.", error);
  });
};

export const ConnectionTelemetryBridge = () => {
  const board = useSelector((state: RootState) => state.whiteBoard);
  const status = useStatus();
  const outageStartedAt = useRef<number | null>(null);
  const readyRoom = useRef<string | null>(null);
  const previousStatus = useRef(status);
  const trackedRoom = useRef(board.roomId);

  useEffect(() => {
    if (!board.id || !board.roomId || status !== "connected" || readyRoom.current === board.roomId) return;
    readyRoom.current = board.roomId;
    const timing = consumeCollaborationAuthAttempts(board.roomId);
    safelyReport({
      event: "ready",
      boardId: board.id,
      roomId: board.roomId,
      attempts: timing.attempts,
      durationMs: timing.durationMs,
      connectionStatus: status,
    });
  }, [board.id, board.roomId, status]);

  useEffect(() => {
    if (trackedRoom.current !== board.roomId) {
      trackedRoom.current = board.roomId;
      outageStartedAt.current = null;
      previousStatus.current = status;
      return;
    }
    const wasUnavailable = previousStatus.current === "reconnecting" || previousStatus.current === "disconnected";
    const isUnavailable = status === "reconnecting" || status === "disconnected";
    if (isUnavailable && outageStartedAt.current === null) outageStartedAt.current = Date.now();
    if (status === "connected" && wasUnavailable && outageStartedAt.current !== null && board.id && board.roomId) {
      const durationMs = Math.max(0, Date.now() - outageStartedAt.current);
      outageStartedAt.current = null;
      safelyReport({
        event: "restored",
        boardId: board.id,
        roomId: board.roomId,
        durationMs,
        connectionStatus: status,
      });
    }
    previousStatus.current = status;
  }, [board.id, board.roomId, status]);

  useLostConnectionListener((event) => {
    if (!board.id || !board.roomId) return;
    if (event === "lost") outageStartedAt.current = Date.now();
    if (event === "restored" && outageStartedAt.current === null) return;
    const durationMs = outageStartedAt.current === null
      ? 0
      : Math.max(0, Date.now() - outageStartedAt.current);
    safelyReport({
      event,
      boardId: board.id,
      roomId: board.roomId,
      durationMs,
      connectionStatus: status,
    });
    if (event === "restored") outageStartedAt.current = null;
  });

  return null;
};
