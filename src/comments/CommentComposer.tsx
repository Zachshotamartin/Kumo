import type { CommentAttachment, CommentLocalAttachment } from "@liveblocks/client";
import { Paperclip, X } from "@phosphor-icons/react";
import { useRoom } from "@liveblocks/react/suspense";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardCollaborator } from "../services/collaboratorRepository";
import { insertMention, mentionQuery } from "./commentBody";
import styles from "./Comments.module.css";

interface CommentComposerProps {
  collaborators: BoardCollaborator[];
  initialValue?: string;
  submitLabel?: string;
  focusOnMount?: boolean;
  onSubmit: (value: string, attachments: CommentAttachment[]) => void | Promise<void>;
  onCancel?: () => void;
}

export const CommentComposer = ({
  collaborators,
  initialValue = "",
  submitLabel = "Post",
  focusOnMount = false,
  onSubmit,
  onCancel,
}: CommentComposerProps) => {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const room = useRoom();
  const query = mentionQuery(value, cursor);
  const suggestions = useMemo(() => {
    if (query === null) return [];
    return collaborators
      .filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query))
      .slice(0, 5);
  }, [collaborators, query]);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const submit = async () => {
    const clean = value.trim();
    if ((!clean && !files.length) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attachments = files.length ? await Promise.all(files.map((file) => {
        const attachment: CommentLocalAttachment = {
          type: "localAttachment",
          status: "idle",
          id: `at_${crypto.randomUUID().replaceAll("-", "")}`,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          file,
        };
        return room.uploadAttachment(attachment);
      })) : [];
      await onSubmit(clean, attachments);
      setValue("");
      setFiles([]);
      setCursor(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The attachment could not be uploaded.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.composer}>
      <textarea
        ref={inputRef}
        aria-label="Comment"
        placeholder="Leave feedback. Type @ to mention someone."
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setCursor(event.currentTarget.selectionStart);
        }}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape" && onCancel) onCancel();
        }}
      />
      {suggestions.length > 0 && (
        <div className={styles.mentionMenu} role="listbox" aria-label="Mention collaborators">
          {suggestions.map((person) => (
            <button
              key={person.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                const next = insertMention(value, person, cursor);
                setValue(next.value);
                setCursor(next.cursor);
                window.requestAnimationFrame(() => {
                  inputRef.current?.focus();
                  inputRef.current?.setSelectionRange(next.cursor, next.cursor);
                });
              }}
            >
              <span>{person.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{person.name}</strong><small>{person.email}</small></span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        className={styles.fileInput}
        type="file"
        multiple
        aria-label="Attach files"
        onChange={(event) => {
          const next = Array.from(event.currentTarget.files ?? []).filter((file) => file.size <= 10 * 1024 * 1024);
          setFiles((current) => [...current, ...next].slice(0, 5));
          event.currentTarget.value = "";
        }}
      />
      {files.length > 0 && <div className={styles.pendingAttachments}>{files.map((file, index) => <span key={`${file.name}:${file.size}:${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X aria-hidden="true" /></button></span>)}</div>}
      {error && <p className={styles.composerError} role="alert">{error}</p>}
      <div className={styles.composerActions}>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        <button type="button" className={styles.attachAction} aria-label="Attach files" onClick={() => fileRef.current?.click()}><Paperclip aria-hidden="true" /></button>
        <span>Up to 5 files · 10 MB each</span>
        <button type="button" className={styles.primaryAction} disabled={(!value.trim() && !files.length) || submitting} onClick={() => void submit()}>
          {submitting ? "Uploading…" : submitLabel}
        </button>
      </div>
    </div>
  );
};
