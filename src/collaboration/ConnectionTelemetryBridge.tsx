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

  useLostConnectionListener((event) => {
    if (!board.id || !board.roomId) return;
    if (event === "lost") outageStartedAt.current = Date.now();
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

