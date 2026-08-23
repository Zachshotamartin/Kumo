import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Circle,
  ChatCenteredText,
  CursorClick,
  FrameCorners,
  Hand,
  ImageSquare,
  LinkSimple,
  PenNib,
  Rectangle,
  TextT,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { ShapeFunctions } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";
import { EditorTool } from "../../editor/types";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import { deleteBoardAsset, uploadBoardImage } from "../../services/assetRepository";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const tools: Array<{ id: EditorTool; label: string; shortcut: string; Icon: Icon }> = [
  { id: "pointer", label: "Select", shortcut: "V", Icon: CursorClick },
  { id: "hand", label: "Hand", shortcut: "H", Icon: Hand },
  { id: "frame", label: "Frame", shortcut: "F", Icon: FrameCorners },
  { id: "rectangle", label: "Rectangle", shortcut: "R", Icon: Rectangle },
  { id: "ellipse", label: "Ellipse", shortcut: "O", Icon: Circle },
  { id: "pen", label: "Pen", shortcut: "P", Icon: PenNib },
  { id: "text", label: "Text", shortcut: "T", Icon: TextT },
  { id: "image", label: "Image", shortcut: "I", Icon: ImageSquare },
  { id: "board", label: "Linked board", shortcut: "B", Icon: LinkSimple },
  { id: "comment", label: "Comment", shortcut: "C", Icon: ChatCenteredText },
];

export const EditorToolbarView = ({ actions }: { actions: EditorActions }) => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedTool = useSelector((state: RootState) => state.selected.selectedTool);
  const board = useSelector((state: RootState) => state.whiteBoard);
  const viewport = useSelector((state: RootState) => state.editor.viewport);
  const currentPageId = useSelector((state: RootState) => state.editor.currentPageId);
  const imageInput = useRef<HTMLInputElement>(null);
  const activeRef = useRef(true);
  const boardIdRef = useRef(board.id);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    boardIdRef.current = board.id;
  }, [board.id]);

  useEffect(() => () => {
    activeRef.current = false;
  }, []);

  const uploadImage = async (file: File) => {
    if (!board.id || !actions.canEdit) return;
    const uploadBoardId = board.id;
    setUploading(true);
    setUploadError(null);
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      const asset = await uploadBoardImage(uploadBoardId, file, {
        width: bitmap.width,
        height: bitmap.height,
      });
      if (!activeRef.current || boardIdRef.current !== uploadBoardId) {
        await deleteBoardAsset(asset.id).catch(() => undefined);
        return;
      }
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
        pageId: currentPageId,
      });
      actions.commitShapes([...board.shapes, shape]);
      dispatch(setSelectedShapes([shape.id]));
      dispatch(setSelectedTool("pointer"));
    } catch (error) {
      if (activeRef.current) {
        setUploadError(error instanceof Error ? error.message : "We couldn't upload this image.");
      }
    } finally {
      bitmap?.close();
      if (activeRef.current) setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Editor tools">
      <div className={styles.toolGroup}>
        {tools.map((tool) => {
          const ToolIcon = tool.Icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={selectedTool === tool.id ? styles.activeTool : undefined}
              aria-label={`${tool.label} tool (${tool.shortcut})`}
              aria-pressed={selectedTool === tool.id}
              title={`${tool.label} - ${tool.shortcut}`}
              disabled={tool.id === "image" && (uploading || !actions.canEdit)}
              onClick={() => tool.id === "image"
                ? imageInput.current?.click()
                : dispatch(setSelectedTool(tool.id))}
            >
              <ToolIcon aria-hidden="true" weight={selectedTool === tool.id ? "fill" : "regular"} />
            </button>
          );
        })}
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
          title="Undo - Command Z"
          disabled={!actions.canUndo}
          onClick={actions.undo}
        >
          <ArrowCounterClockwise aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo - Shift Command Z"
          disabled={!actions.canRedo}
          onClick={actions.redo}
        >
          <ArrowClockwise aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Delete selected shapes"
          title="Delete"
          onClick={actions.removeSelected}
        >
          <Trash aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

const EditorToolbar = () => <EditorToolbarView actions={useEditorActions()} />;

export default EditorToolbar;
