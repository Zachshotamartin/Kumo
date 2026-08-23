import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./TextEditor.module.css";

interface TextEditorProps {
  value: string;
  style: CSSProperties;
  verticalAlign: CSSProperties["alignItems"];
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}

export const TextEditor = ({ value, style, verticalAlign, onChange, onBlur }: TextEditorProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);

  const fitEditorToContent = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      textarea.parentElement?.clientHeight ?? textarea.scrollHeight
    )}px`;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    fitEditorToContent();
  }, [draft, fitEditorToContent, style]);

  return (
    <div className={styles.textEditorFrame} style={{ alignItems: verticalAlign }}>
      <textarea
        ref={ref}
        className={styles.textEditor}
        style={style}
        value={draft}
        rows={1}
        wrap="soft"
        spellCheck
        aria-label="Edit text"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
          fitEditorToContent();
        }}
        onBlur={(event) => onBlur(event.currentTarget.value)}
      />
    </div>
  );
};
