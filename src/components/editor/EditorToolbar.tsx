import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ShapeFunctions } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";
import { EditorTool } from "../../editor/types";
import { useEditorActions } from "../../editor/useEditorActions";
import { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import { uploadBoardImage } from "../../services/assetRepository";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const tools: Array<{ id: EditorTool; label: string; shortcut: string; icon: string }> = [
  { id: "pointer", label: "Select", shortcut: "V", icon: "↖" },
  { id: "hand", label: "Hand", shortcut: "H", icon: "✋" },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: "□" },
  { id: "ellipse", label: "Ellipse", shortcut: "O", icon: "○" },
  { id: "text", label: "Text", shortcut: "T", icon: "T" },
  { id: "image", label: "Image", shortcut: "I", icon: "▧" },
  { id: "board", label: "Linked board", shortcut: "B", icon: "↗" },
];

const EditorToolbar = () => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedTool = useSelector((state: RootState) => state.selected.selectedTool);
  const board = useSelector((state: RootState) => state.whiteBoard);
  const viewport = useSelector((state: RootState) => state.editor.viewport);
  const actions = useEditorActions();
  const imageInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImage = async (file: File) => {
    if (!board.id || !actions.canEdit) return;
    setUploading(true);
    setUploadError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const asset = await uploadBoardImage(board.id, file, {
        width: bitmap.width,
        height: bitmap.height,
      });
      bitmap.close();
      const scale = Math.min(1, 480 / Math.max(asset.width ?? 1, asset.height ?? 1));
      const width = Math.max(40, (asset.width ?? 240) * scale);
      const height = Math.max(40, (asset.height ?? 180) * scale);
      const draft = ShapeFunctions.createShape("image", viewport.x + 72, viewport.y + 72, board.shapes);
      const shape = normalizeShape({
        ...draft,
        name: file.name,
        x2: draft.x1 + width,
        y2: draft.y1 + height,
        width,
        height,
        assetId: asset.id,
        backgroundImage: asset.url,
        backgroundColor: "transparent",
      });
      actions.commitShapes([...board.shapes, shape]);
      dispatch(setSelectedShapes([shape.id]));
      dispatch(setSelectedTool("pointer"));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "We couldn't upload this image.");
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

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
            disabled={tool.id === "image" && (uploading || !actions.canEdit)}
            onClick={() => tool.id === "image"
              ? imageInput.current?.click()
              : dispatch(setSelectedTool(tool.id))}
          >
            <span aria-hidden="true">{tool.icon}</span>
          </button>
        ))}
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadImage(file);
        }}
      />
      {uploadError && <span className={styles.toolbarError} role="alert">{uploadError}</span>}
      <span className={styles.toolbarDivider} aria-hidden="true" />
      <div className={styles.toolGroup}>
        <button
          type="button"
          aria-label="Undo"
          title="Undo · ⌘Z"
          disabled={!actions.canUndo}
          onClick={actions.undo}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo · ⇧⌘Z"
          disabled={!actions.canRedo}
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
