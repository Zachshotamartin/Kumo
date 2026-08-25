import { useRef, useState } from "react";
import { ChatCenteredText } from "@phosphor-icons/react";
import { useCreateThread, useEditThreadMetadata, useThreads } from "@liveblocks/react/suspense";
import { useDispatch, useSelector } from "react-redux";
import { hitTest, screenToWorld, shapeBounds, worldToScreen } from "../editor/geometry";
import {
  setCommentDraftAnchor,
  setRightPanel,
  setSelectedThreadId,
} from "../features/editor/editorSlice";
import { setSelectedTool } from "../features/selected/selectedSlice";
import type { AppDispatch, RootState } from "../store";
import { createCommentBody } from "./commentBody";
import { CommentComposer } from "./CommentComposer";
import { useBoardCollaborators } from "./useBoardCollaborators";
import styles from "./Comments.module.css";

export const CommentPins = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const editor = useSelector((state: RootState) => state.editor);
  const { threads } = useThreads();
  const createThread = useCreateThread();
  const editThreadMetadata = useEditThreadMetadata();
  const { collaborators } = useBoardCollaborators(board.id);
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    threadId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    metadata: Liveblocks["ThreadMetadata"];
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const [previewMetadata, setPreviewMetadata] = useState<Record<string, Liveblocks["ThreadMetadata"]>>({});

  const worldPosition = (metadata: Liveblocks["ThreadMetadata"]) => {
    const shape = metadata.shapeId
      ? board.shapes.find((candidate) => candidate.id === metadata.shapeId)
      : undefined;
    const bounds = shape ? shapeBounds(shape) : null;
    return {
      x: metadata.x + (bounds?.x ?? 0),
      y: metadata.y + (bounds?.y ?? 0),
    };
  };

  const metadataAtPointer = (clientX: number, clientY: number) => {
    const rect = layerRef.current!.getBoundingClientRect();
    const world = screenToWorld({ x: clientX, y: clientY }, rect, editor.viewport);
    const shape = hitTest(board.shapes, world);
    const bounds = shape ? shapeBounds(shape) : null;
    return {
      x: world.x - (bounds?.x ?? 0),
      y: world.y - (bounds?.y ?? 0),
      shapeId: shape?.id ?? "",
    };
  };

  return (
    <div ref={layerRef} className={styles.pinLayer} aria-label="Canvas comments">
      {threads.map((thread, index) => {
        const metadata = previewMetadata[thread.id] ?? thread.metadata;
        const position = worldToScreen(worldPosition(metadata), editor.viewport);
        return (
          <button
            type="button"
            key={thread.id}
            className={`${styles.commentPin} ${thread.resolved ? styles.resolvedPin : ""} ${editor.selectedThreadId === thread.id ? styles.activePin : ""}`}
            style={{ left: position.x, top: position.y }}
            aria-label={`Open comment ${index + 1}${thread.resolved ? " (resolved)" : ""}`}
            title="Drag to move comment"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {
                threadId: thread.id,
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                moved: false,
                metadata: thread.metadata,
              };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.threadId !== thread.id || drag.pointerId !== event.pointerId) return;
              if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= 3) drag.moved = true;
              if (!drag.moved) return;
              const next = metadataAtPointer(event.clientX, event.clientY);
              drag.metadata = next;
              setPreviewMetadata((current) => ({ ...current, [thread.id]: next }));
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.threadId !== thread.id || drag.pointerId !== event.pointerId) return;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              dragRef.current = null;
              if (!drag.moved) return;
              suppressClickRef.current = thread.id;
              editThreadMetadata({ threadId: thread.id, metadata: drag.metadata });
              setPreviewMetadata((current) => {
                const next = { ...current };
                delete next[thread.id];
                return next;
              });
            }}
            onPointerCancel={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.threadId !== thread.id) return;
              dragRef.current = null;
              setPreviewMetadata((current) => {
                const next = { ...current };
                delete next[thread.id];
                return next;
              });
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onClick={() => {
              if (suppressClickRef.current === thread.id) {
                suppressClickRef.current = null;
                return;
              }
              dispatch(setSelectedThreadId(thread.id));
              dispatch(setRightPanel("comments"));
            }}
          >
            <ChatCenteredText aria-hidden="true" weight="fill" />
            <span>{index + 1}</span>
          </button>
        );
      })}
      {editor.commentDraftAnchor && (() => {
        const position = worldToScreen(worldPosition(editor.commentDraftAnchor), editor.viewport);
        return (
          <div
            className={styles.canvasComposer}
            style={{ left: position.x, top: position.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <CommentComposer
              collaborators={collaborators}
              focusOnMount
              onCancel={() => dispatch(setCommentDraftAnchor(null))}
              onSubmit={(value, attachments) => {
                const thread = createThread({
                  body: createCommentBody(value, collaborators),
                  metadata: editor.commentDraftAnchor!,
                  commentMetadata: { source: "canvas" },
                  attachments,
                });
                dispatch(setSelectedThreadId(thread.id));
                dispatch(setCommentDraftAnchor(null));
                dispatch(setSelectedTool("pointer"));
              }}
            />
          </div>
        );
      })()}
    </div>
  );
};
