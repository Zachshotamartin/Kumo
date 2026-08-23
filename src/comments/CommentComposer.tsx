import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardCollaborator } from "../services/collaboratorRepository";
import { insertMention, mentionQuery } from "./commentBody";
import styles from "./Comments.module.css";

interface CommentComposerProps {
  collaborators: BoardCollaborator[];
  initialValue?: string;
  submitLabel?: string;
  focusOnMount?: boolean;
  onSubmit: (value: string) => void;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const submit = () => {
    const clean = value.trim();
    if (!clean) return;
    onSubmit(clean);
    setValue("");
    setCursor(0);
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
      <div className={styles.composerActions}>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        <span>⌘ Enter</span>
        <button type="button" className={styles.primaryAction} disabled={!value.trim()} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
};
