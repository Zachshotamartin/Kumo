import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  DotsThreeOutline,
  Trash,
} from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { ShapeFunctions } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";
import {
  ACCEPTED_MEDIA_TYPES,
  acceptedMediaType,
  isAcceptedVideoType,
  unsupportedMediaMessage,
  type AcceptedVideoType,
} from "../../editor/mediaTypes";
import { EDITOR_TOOL_DEFINITIONS, type EditorToolDefinition } from "../../editor/toolDefinitions";
import { fitToolCount, toolbarAvailableWidth } from "../../editor/toolbarFit";
import type { EditorTool } from "../../editor/types";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { showCanvasNotice } from "../../features/editor/editorSlice";
import { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import { deleteBoardAsset, uploadBoardImage } from "../../services/assetRepository";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const videoDimensions = async (file: File, mediaType: AcceptedVideoType) => {
  const url = URL.createObjectURL(new Blob([file], { type: mediaType }));
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
};

const mediaDimensions = async (file: File) => {
  const mediaType = acceptedMediaType(file);
  if (!mediaType) throw new Error(unsupportedMediaMessage);
  if (isAcceptedVideoType(mediaType)) return videoDimensions(file, mediaType);
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
};

/** Select and Hand stay on the toolbar however narrow the canvas gets. */
const MINIMUM_VISIBLE_TOOLS = 2;

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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolGroupRef = useRef<HTMLDivElement>(null);
  const moreToolsRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(EDITOR_TOOL_DEFINITIONS.length);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    boardIdRef.current = board.id;
  }, [board.id]);

  useEffect(() => () => {
    activeRef.current = false;
  }, []);

  // Fit the toolbar to the canvas it sits in; tools that don't fit move into "More tools".
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current!;
    const group = toolGroupRef.current!;
    const measure = () => {
      const available = toolbarAvailableWidth(toolbar);
      const button = group.querySelector("button")!;
      if (available <= 0 || !button.offsetWidth) return;
      const gap = Number.parseFloat(getComputedStyle(group).columnGap) || 0;
      setVisibleCount(fitToolCount({
        available,
        chrome: toolbar.offsetWidth - group.offsetWidth,
        step: button.offsetWidth + gap,
        gap,
        total: EDITOR_TOOL_DEFINITIONS.length,
        minimum: MINIMUM_VISIBLE_TOOLS,
      }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar.parentElement!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!moreToolsRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const chooseTool = (tool: EditorTool) => {
    if (tool === "image") imageInput.current!.click();
    else dispatch(setSelectedTool(tool));
  };

  const uploadImage = async (file: File) => {
    if (!board.id || !actions.canEdit) return;
    const uploadBoardId = board.id;
    setUploading(true);
    dispatch(showCanvasNotice(null));
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
        dispatch(showCanvasNotice(error instanceof Error ? error.message : "We couldn't upload this image."));
      }
    } finally {
      if (activeRef.current) setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

  const toolDisabled = (tool: EditorToolDefinition) => tool.id === "image" && (uploading || !actions.canEdit);
  const shownTools = EDITOR_TOOL_DEFINITIONS.slice(0, visibleCount);
  const moreTools = EDITOR_TOOL_DEFINITIONS.slice(visibleCount);
  const selectedMoreTool = moreTools.find((tool) => tool.id === selectedTool);
  const MoreIcon = selectedMoreTool?.Icon ?? DotsThreeOutline;

  return (
    <div ref={toolbarRef} className={styles.toolbar} role="toolbar" aria-label="Editor tools">
      <div ref={toolGroupRef} className={styles.toolGroup}>
        {shownTools.map((tool) => {
          const ToolIcon = tool.Icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={selectedTool === tool.id ? styles.activeTool : undefined}
              aria-label={`${tool.label} tool (${tool.shortcut})`}
              aria-pressed={selectedTool === tool.id}
              title={`${tool.label} - ${tool.shortcut}`}
              disabled={toolDisabled(tool)}
              onClick={() => chooseTool(tool.id)}
            >
              <ToolIcon aria-hidden="true" weight={selectedTool === tool.id ? "fill" : "regular"} />
            </button>
          );
        })}
        {moreTools.length > 0 && (
          <div ref={moreToolsRef} className={styles.moreTools}>
            <button
              type="button"
              className={selectedMoreTool ? styles.activeTool : undefined}
              aria-label={selectedMoreTool ? `More tools (${selectedMoreTool.label} selected)` : "More tools"}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="More tools"
              onClick={() => setMoreOpen((open) => !open)}
            >
              <MoreIcon aria-hidden="true" weight={selectedMoreTool ? "fill" : "regular"} />
            </button>
            {moreOpen && (
              <div className={styles.moreToolsMenu} role="menu" aria-label="More tools" data-columns={moreTools.length > 8 ? 2 : 1}>
                {moreTools.map((tool) => {
                  const ToolIcon = tool.Icon;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitemradio"
                      aria-label={`${tool.label} tool (${tool.shortcut})`}
                      aria-checked={selectedTool === tool.id}
                      title={`${tool.label} - ${tool.shortcut}`}
                      disabled={toolDisabled(tool)}
                      onClick={() => { setMoreOpen(false); chooseTool(tool.id); }}
                    >
                      <ToolIcon aria-hidden="true" weight={selectedTool === tool.id ? "fill" : "regular"} />
                      <span>{tool.label}</span>
                      <kbd>{tool.shortcut}</kbd>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <input
        ref={imageInput}
        type="file"
        accept={ACCEPTED_MEDIA_TYPES.join(",")}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadImage(file);
        }}
      />
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
