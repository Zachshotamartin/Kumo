import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Trash,
} from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { ShapeFunctions } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";
import { EDITOR_TOOL_DEFINITIONS } from "../../editor/toolDefinitions";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import { deleteBoardAsset, uploadBoardImage } from "../../services/assetRepository";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const mediaDimensions = async (file: File) => {
  if (file.type.startsWith("video/")) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve({ width: video.videoWidth || 640, height: video.videoHeight || 360 });
        video.onerror = () => reject(new Error("This video could not be read."));
        video.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
};

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
    try {
      const dimensions = await mediaDimensions(file);
      const asset = await uploadBoardImage(uploadBoardId, file, {
        width: dimensions.width,
        height: dimensions.height,
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
        mediaType: file.type.startsWith("video/") ? "video" : file.type === "image/gif" ? "gif" : "image",
        mediaMuted: file.type.startsWith("video/") ? true : undefined,
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
      if (activeRef.current) setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Editor tools">
      <div className={styles.toolGroup}>
        {EDITOR_TOOL_DEFINITIONS.map((tool) => {
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
                ? imageInput.current!.click()
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
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm"
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
