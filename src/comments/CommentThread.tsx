import { useState } from "react";
import type { CommentAttachment, CommentBody, CommentData, ThreadData } from "@liveblocks/client";
import {
  Check,
  Eye,
  Heart,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import {
  useAddReaction,
  useCreateComment,
  useDeleteComment,
  useDeleteThread,
  useEditComment,
  useEditThreadMetadata,
  useAttachmentUrl,
  useMarkThreadAsResolved,
  useMarkThreadAsUnresolved,
  useRemoveReaction,
} from "@liveblocks/react/suspense";
import type { BoardCollaborator } from "../services/collaboratorRepository";
import { commentBodyParts, commentBodyText, createCommentBody } from "./commentBody";
import { CommentComposer } from "./CommentComposer";
import styles from "./Comments.module.css";

const reactionOptions = [
  { value: "heart", label: "Appreciate", Icon: Heart },
  { value: "check", label: "Approved", Icon: Check },
  { value: "watch", label: "Reviewing", Icon: Eye },
] as const;

const formatTime = (date: Date) => new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(date);

const CommentBodyView = ({ body, collaborators }: {
  body: CommentBody;
  collaborators: BoardCollaborator[];
}) => (
  <div className={styles.commentBody}>
    {commentBodyParts(body, collaborators).map((paragraph, paragraphIndex) => (
      <p key={paragraphIndex}>
        {paragraph.map((part, partIndex) => part.mentionId
          ? <strong className={styles.mention} key={partIndex}>{part.text}</strong>
          : <span key={partIndex}>{part.text}</span>)}
      </p>
    ))}
  </div>
);

const CommentAttachmentView = ({ attachment }: { attachment: CommentAttachment }) => {
  const result = useAttachmentUrl(attachment.id);
  if (result.isLoading) return <span className={styles.attachment}>Loading {attachment.name}…</span>;
  if (result.error) return <span className={styles.attachmentError}>{attachment.name} unavailable</span>;
  return <a className={styles.attachment} href={result.url} target="_blank" rel="noreferrer" download={attachment.name}>{attachment.mimeType.startsWith("image/") && <img src={result.url} alt="" />}<span>{attachment.name}<small>{Math.max(1, Math.round(attachment.size / 1024))} KB</small></span></a>;
};

const CommentItem = ({ comment, collaborators, currentUserId }: {
  comment: CommentData;
  collaborators: BoardCollaborator[];
  currentUserId: string | null;
}) => {
  const [editing, setEditing] = useState(false);
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const author = collaborators.find((person) => person.id === comment.userId);
  const canManage = currentUserId === comment.userId;
  const body = comment.body;
  if (!body) return <div className={styles.deletedComment}>Comment removed</div>;

  return (
    <article className={styles.commentItem}>
      <header>
        <span className={styles.avatar}>{(author?.name || author?.email || "C").slice(0, 1).toUpperCase()}</span>
        <span><strong>{author?.name || author?.email || "Collaborator"}</strong><time>{formatTime(comment.createdAt)}</time></span>
        {canManage && (
          <span className={styles.commentTools}>
            <button type="button" aria-label="Edit comment" onClick={() => setEditing(true)}><PencilSimple aria-hidden="true" /></button>
            <button type="button" aria-label="Delete comment" onClick={() => deleteComment({ threadId: comment.threadId, commentId: comment.id })}><Trash aria-hidden="true" /></button>
          </span>
        )}
      </header>
      {editing ? (
        <CommentComposer
          collaborators={collaborators}
          initialValue={commentBodyText(body, collaborators)}
          submitLabel="Save"
          focusOnMount
          onCancel={() => setEditing(false)}
          onSubmit={(value, attachments) => {
            editComment({
              threadId: comment.threadId,
              commentId: comment.id,
              body: createCommentBody(value, collaborators),
              attachments: [...comment.attachments, ...attachments],
            });
            setEditing(false);
          }}
        />
      ) : <CommentBodyView body={body} collaborators={collaborators} />}
      {comment.attachments.length > 0 && <div className={styles.attachments}>{comment.attachments.map((attachment) => <CommentAttachmentView key={attachment.id} attachment={attachment} />)}</div>}
      <div className={styles.reactions}>
        {reactionOptions.map(({ value, label, Icon }) => {
          const reaction = comment.reactions.find((item) => item.emoji === value);
          const mine = Boolean(reaction?.users.some((person) => person.id === currentUserId));
          return (
            <button
              type="button"
              key={value}
              aria-label={`${mine ? "Remove" : "Add"} ${label} reaction`}
              aria-pressed={mine}
              onClick={() => mine
                ? removeReaction({ threadId: comment.threadId, commentId: comment.id, emoji: value })
                : addReaction({ threadId: comment.threadId, commentId: comment.id, emoji: value })}
            >
              <Icon aria-hidden="true" weight={mine ? "fill" : "regular"} />
              {reaction?.users.length ? <span>{reaction.users.length}</span> : null}
            </button>
          );
        })}
      </div>
    </article>
  );
};

export const CommentThread = ({ thread, collaborators, currentUserId, selected = false, onFocus }: {
  thread: ThreadData;
  collaborators: BoardCollaborator[];
  currentUserId: string | null;
  selected?: boolean;
  onFocus?: () => void;
}) => {
  const [replying, setReplying] = useState(false);
  const createComment = useCreateComment();
  const deleteThread = useDeleteThread();
  const resolveThread = useMarkThreadAsResolved();
  const reopenThread = useMarkThreadAsUnresolved();
  const editThreadMetadata = useEditThreadMetadata();
  const firstAuthor = thread.comments[0]?.userId;

  return (
    <section className={`${styles.thread} ${selected ? styles.selectedThread : ""}`} data-thread-id={thread.id}>
      <div className={styles.threadActions}>
        <span>{thread.resolved ? "Resolved" : `${thread.comments.length} ${thread.comments.length === 1 ? "comment" : "comments"}`}</span>
        {onFocus && <button type="button" onClick={onFocus}>Show</button>}
        <button type="button" onClick={() => thread.resolved ? reopenThread(thread.id) : resolveThread(thread.id)}>
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
        {firstAuthor === currentUserId && (
          <button type="button" aria-label="Delete thread" onClick={() => deleteThread(thread.id)}><Trash aria-hidden="true" /></button>
        )}
      </div>
      <div className={styles.threadMetadata}>
        <label>Assignee<select aria-label="Comment assignee" value={thread.metadata.assigneeId ?? ""} onChange={(event) => editThreadMetadata({ threadId: thread.id, metadata: { assigneeId: event.currentTarget.value || undefined } })}><option value="">Unassigned</option>{collaborators.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label>Priority<select aria-label="Comment priority" value={thread.metadata.priority ?? "normal"} onChange={(event) => editThreadMetadata({ threadId: thread.id, metadata: { priority: event.currentTarget.value as "low" | "normal" | "high" } })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
        <label>Due<input aria-label="Comment due date" type="date" value={thread.metadata.dueAt?.slice(0, 10) ?? ""} onChange={(event) => editThreadMetadata({ threadId: thread.id, metadata: { dueAt: event.currentTarget.value || undefined } })} /></label>
      </div>
      {thread.comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} collaborators={collaborators} currentUserId={currentUserId} />
      ))}
      {replying ? (
        <CommentComposer
          collaborators={collaborators}
          focusOnMount
          submitLabel="Reply"
          onCancel={() => setReplying(false)}
          onSubmit={(value, attachments) => {
            createComment({
              threadId: thread.id,
              body: createCommentBody(value, collaborators),
              metadata: { source: "canvas" },
              attachments,
            });
            setReplying(false);
          }}
        />
      ) : <button type="button" className={styles.replyButton} onClick={() => setReplying(true)}>Reply</button>}
    </section>
  );
};
