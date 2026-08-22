import { useDispatch, useSelector } from "react-redux";
import { EditorTool } from "../../editor/types";
import { useEditorActions } from "../../editor/useEditorActions";
import { setSelectedTool } from "../../features/selected/selectedSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const tools: Array<{ id: EditorTool; label: string; shortcut: string; icon: string }> = [
  { id: "pointer", label: "Select", shortcut: "V", icon: "↖" },
  { id: "hand", label: "Hand", shortcut: "H", icon: "✋" },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: "□" },
  { id: "ellipse", label: "Ellipse", shortcut: "O", icon: "○" },
  { id: "text", label: "Text", shortcut: "T", icon: "T" },
  { id: "image", label: "Image", shortcut: "I", icon: "▧" },
];

const EditorToolbar = () => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedTool = useSelector((state: RootState) => state.selected.selectedTool);
  const history = useSelector((state: RootState) => state.editor.history);
  const actions = useEditorActions();

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Editor tools">
      <div className={styles.toolGroup}>
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={selectedTool === tool.id ? styles.activeTool : undefined}
            aria-label={`${tool.label} tool (${tool.shortcut})`}
            aria-pressed={selectedTool === tool.id}
            title={`${tool.label} · ${tool.shortcut}`}
            onClick={() => dispatch(setSelectedTool(tool.id))}
          >
            <span aria-hidden="true">{tool.icon}</span>
          </button>
        ))}
      </div>
      <span className={styles.toolbarDivider} aria-hidden="true" />
      <div className={styles.toolGroup}>
        <button
          type="button"
          aria-label="Undo"
          title="Undo · ⌘Z"
          disabled={!history?.past.length}
          onClick={actions.undo}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo · ⇧⌘Z"
          disabled={!history?.future.length}
          onClick={actions.redo}
        >
          ↷
        </button>
        <button
          type="button"
          aria-label="Delete selected shapes"
          title="Delete"
          onClick={actions.removeSelected}
        >
          ⌫
        </button>
      </div>
    </div>
  );
};

export default EditorToolbar;
