import { ChatCenteredText } from "@phosphor-icons/react";
import { useCreateThread, useThreads } from "@liveblocks/react/suspense";
import { useDispatch, useSelector } from "react-redux";
import { shapeBounds, worldToScreen } from "../editor/geometry";
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
  const { collaborators } = useBoardCollaborators(board.id);

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

  return (
    <div className={styles.pinLayer} aria-label="Canvas comments">
      {threads.map((thread, index) => {
        const position = worldToScreen(worldPosition(thread.metadata), editor.viewport);
        return (
          <button
            type="button"
            key={thread.id}
            className={`${styles.commentPin} ${thread.resolved ? styles.resolvedPin : ""} ${editor.selectedThreadId === thread.id ? styles.activePin : ""}`}
            style={{ left: position.x, top: position.y }}
            aria-label={`Open comment ${index + 1}${thread.resolved ? " (resolved)" : ""}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
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
              onSubmit={(value) => {
                const thread = createThread({
                  body: createCommentBody(value, collaborators),
                  metadata: editor.commentDraftAnchor!,
                  commentMetadata: { source: "canvas" },
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
