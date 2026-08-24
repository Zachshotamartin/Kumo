import { useEffect, useMemo, useState } from "react";
import { CheckCircle, ChatCenteredText, Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useMarkThreadAsRead, useThreads } from "@liveblocks/react/suspense";
import { useDispatch, useSelector } from "react-redux";
import { setRightPanel, setSelectedThreadId, setViewport } from "../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../store";
import { useBoardCollaborators } from "./useBoardCollaborators";
import { CommentThread } from "./CommentThread";
import { commentBodyText } from "./commentBody";
import ui from "../components/ui/Ui.module.css";
import styles from "./Comments.module.css";

type ThreadFilter = "open" | "resolved" | "all";

export const CommentsPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const editor = useSelector((state: RootState) => state.editor);
  const currentUserId = useSelector((state: RootState) => state.auth.uid);
  const { threads } = useThreads();
  const markThreadAsRead = useMarkThreadAsRead();
  const { collaborators, error } = useBoardCollaborators(board.id);
  const [filter, setFilter] = useState<ThreadFilter>("open");
  const [query, setQuery] = useState("");
  const [assigneeId, setAssigneeId] = useState("all");

  const visibleThreads = useMemo(() => threads
    .filter((thread) => filter === "all" || thread.resolved === (filter === "resolved"))
    .filter((thread) => assigneeId === "all" || (assigneeId === "unassigned" ? !thread.metadata.assigneeId : thread.metadata.assigneeId === assigneeId))
    .filter((thread) => !query.trim() || thread.comments.some((comment) => comment.body && commentBodyText(comment.body, collaborators).toLowerCase().includes(query.trim().toLowerCase())))
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()), [assigneeId, collaborators, filter, query, threads]);

  useEffect(() => {
    if (editor.selectedThreadId) markThreadAsRead(editor.selectedThreadId);
  }, [editor.selectedThreadId, markThreadAsRead]);

  const focusThread = (threadId: string) => {
    const thread = threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;
    dispatch(setSelectedThreadId(thread.id));
    const shape = thread.metadata.shapeId
      ? board.shapes.find((candidate) => candidate.id === thread.metadata.shapeId)
      : undefined;
    const x = thread.metadata.x + (shape ? Math.min(shape.x1, shape.x2) : 0);
    const y = thread.metadata.y + (shape ? Math.min(shape.y1, shape.y2) : 0);
    dispatch(setViewport({
      ...editor.viewport,
      x: x - 160 / editor.viewport.zoom,
      y: y - 140 / editor.viewport.zoom,
    }));
  };

  return (
    <aside className={`${ui.panel} ${styles.panel}`} aria-label="Comments">
      <header className={`${ui.panelHeader} ${styles.panelHeader}`}>
        <span className={ui.panelTitle}><ChatCenteredText aria-hidden="true" /> Comments</span>
        <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${ui.iconButton}`} aria-label="Close comments" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button>
      </header>
      <div className={styles.filters} role="group" aria-label="Filter comments">
        <Funnel aria-hidden="true" />
        {(["open", "resolved", "all"] as const).map((value) => (
          <button className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className={styles.commentSearch}>
        <label><MagnifyingGlass aria-hidden="true" /><input type="search" aria-label="Search comments" value={query} placeholder="Search feedback" onChange={(event) => setQuery(event.currentTarget.value)} /></label>
        <select aria-label="Filter comments by assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.currentTarget.value)}><option value="all">All assignees</option><option value="unassigned">Unassigned</option>{collaborators.map((person) => <option key={person.id} value={person.id}>{person.id === currentUserId ? "Assigned to me" : person.name}</option>)}</select>
      </div>
      {error && <p className={`${ui.notice} ${ui.noticeError} ${styles.panelError}`} role="alert">{error}</p>}
      <div className={styles.threadList}>
        {visibleThreads.length === 0 ? (
          <div className={`${ui.emptyState} ${styles.emptyComments}`}>
            <CheckCircle aria-hidden="true" />
            <strong>{filter === "open" ? "No open feedback" : "No comments here"}</strong>
            <span>Select the comment tool and click the canvas to start a thread.</span>
          </div>
        ) : visibleThreads.map((thread) => (
          <CommentThread
            key={thread.id}
            thread={thread}
            collaborators={collaborators}
            currentUserId={currentUserId}
            selected={thread.id === editor.selectedThreadId}
            onFocus={() => focusThread(thread.id)}
          />
        ))}
      </div>
    </aside>
  );
};
