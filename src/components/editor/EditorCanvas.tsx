import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUpdateMyPresence } from "@liveblocks/react";
import { useDispatch, useSelector } from "react-redux";
import { Shape, ShapeFunctions } from "../../classes/shape";
import {
  hitTest,
  moveShapesFromBaseline,
  normalizeShape,
  panViewport,
  resizeSelectionFromPointer,
  resizeTransformForFrame,
  rotateShapesFromBaseline,
  screenToWorld,
  selectionBounds,
  selectionFrame,
  shapeBounds,
  shapesInMarquee,
  snapPointToGrid,
  worldToScreen,
  zoomAtPoint,
} from "../../editor/geometry";
import { EditorTool, Point, ResizeHandle, SelectionFrame, Viewport } from "../../editor/types";
import { useEditorActions } from "../../editor/useEditorActions";
import { initializeEditor, setEditingShapeId, setHoveredShapeId, setViewport } from "../../features/editor/editorSlice";
import { clearSelectedShapes, setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { AppDispatch, RootState } from "../../store";
import { getBoard } from "../../services/boardRepository";
import styles from "./EditorCanvas.module.css";

type InteractionMode = "draw" | "move" | "resize" | "rotate" | "marquee" | "pan";

interface Interaction {
  mode: InteractionMode;
  pointerId: number;
  startWorld: Point;
  startScreen: Point;
  baseline: Shape[];
  preview: Shape[];
  selectedIds: string[];
  startViewport: Viewport;
  shapeId?: string;
  handle?: ResizeHandle;
  selectionFrame?: SelectionFrame;
  additiveSelection?: string[];
}

interface ContextMenuState {
  x: number;
  y: number;
}

interface TextEditorProps {
  value: string;
  style: React.CSSProperties;
  onChange: (value: string) => void;
  onBlur: () => void;
}

const TextEditor = ({ value, style, onChange, onBlur }: TextEditorProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      className={styles.textEditor}
      style={style}
      value={value}
      aria-label="Edit text"
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  );
};

const cloneShapes = (shapes: Shape[]): Shape[] => JSON.parse(JSON.stringify(shapes));

const resizeHandles: Array<{
  handle: ResizeHandle;
  label: string;
  left: string;
  top: string;
  cursor: string;
}> = [
  { handle: "nw", label: "Resize from top left", left: "0%", top: "0%", cursor: "nwse-resize" },
  { handle: "n", label: "Resize from top", left: "50%", top: "0%", cursor: "ns-resize" },
  { handle: "ne", label: "Resize from top right", left: "100%", top: "0%", cursor: "nesw-resize" },
  { handle: "e", label: "Resize from right", left: "100%", top: "50%", cursor: "ew-resize" },
  { handle: "se", label: "Resize from bottom right", left: "100%", top: "100%", cursor: "nwse-resize" },
  { handle: "s", label: "Resize from bottom", left: "50%", top: "100%", cursor: "ns-resize" },
  { handle: "sw", label: "Resize from bottom left", left: "0%", top: "100%", cursor: "nesw-resize" },
  { handle: "w", label: "Resize from left", left: "0%", top: "50%", cursor: "ew-resize" },
];

const createDraftShape = (
  tool: Exclude<EditorTool, "pointer" | "hand">,
  point: Point,
  shapes: Shape[]
): Shape => {
  const shape = ShapeFunctions.createShape(tool, point.x, point.y, shapes);
  return normalizeShape({
    ...shape,
    text: tool === "text" ? "Type something" : shape.text,
    fontSize: tool === "text" ? 18 : shape.fontSize,
    name: tool === "board" ? "Linked board" : tool === "text" ? "Text" : tool === "image" ? "Image" : tool === "ellipse" ? "Ellipse" : "Rectangle",
    title: tool === "board" ? "Choose a destination" : shape.title,
    backgroundColor: tool === "text" || tool === "image" ? "transparent" : tool === "board" ? "#303640" : "#f4f2ed",
    color: "#f7f7f5",
    borderColor: "#17181a",
    borderWidth: tool === "text" ? 0 : 1,
  });
};

const draftAtPoint = (draft: Shape, start: Point, end: Point, square: boolean): Shape => {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }
  return normalizeShape({
    ...draft,
    x1: start.x,
    y1: start.y,
    x2: start.x + dx,
    y2: start.y + dy,
  });
};

const EditorCanvas = () => {
  const dispatch = useDispatch<AppDispatch>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const textBaselineRef = useRef<Shape[] | null>(null);
  const spacePressedRef = useRef(false);
  const cursorFrameRef = useRef<number | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState({ x: 1, y: 1 });

  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const selectedTool = useSelector((state: RootState) => state.selected.selectedTool);
  const editor = useSelector((state: RootState) => state.editor);
  const user = useSelector((state: RootState) => state.auth);
  const showGrid = useSelector((state: RootState) => state.actions.grid);
  const actions = useEditorActions();
  const updateMyPresence = useUpdateMyPresence();

  const selectedFrame = useMemo(
    () => selectionFrame(board.shapes, selectedIds),
    [board.shapes, selectedIds]
  );

  useEffect(() => {
    if (!board.id) return;
    dispatch(
      initializeEditor({
        boardId: board.id,
        shapes: board.shapes,
        backgroundColor: board.backGroundColor,
      })
    );
    dispatch(setViewport({ x: 0, y: 0, zoom: 1 }));
    // Board identity intentionally scopes the history reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, dispatch]);

  useEffect(() => {
    updateMyPresence({ selectionIds: selectedIds });
  }, [selectedIds, updateMyPresence]);

  const pointerWorld = useCallback(
    (event: Pick<React.PointerEvent<HTMLDivElement>, "clientX" | "clientY">): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToWorld({ x: event.clientX, y: event.clientY }, rect, editor.viewport);
    },
    [editor.viewport]
  );

  const pointerScreen = useCallback(
    (event: Pick<React.PointerEvent<HTMLDivElement>, "clientX" | "clientY">): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : { x: 0, y: 0 };
    },
    []
  );

  const selectHitTarget = useCallback(
    (shape: Shape): string[] => {
      if (!shape.groupId) return [shape.id];
      return board.shapes
        .filter((candidate) => candidate.groupId === shape.groupId)
        .map((candidate) => candidate.id);
    },
    [board.shapes]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) return;
    setContextMenu(null);
    const startWorld = pointerWorld(event);
    const startScreen = pointerScreen(event);
    const baseline = cloneShapes(board.shapes);
    const startViewport = editor.viewport;
    const handle = (event.target as HTMLElement).dataset.resizeHandle as ResizeHandle | undefined;
    const wantsRotate = (event.target as HTMLElement).dataset.rotationHandle === "true";
    const wantsPan = event.button === 1 || selectedTool === "hand" || spacePressedRef.current;

    event.currentTarget.setPointerCapture(event.pointerId);
    if (wantsPan) {
      interactionRef.current = {
        mode: "pan",
        pointerId: event.pointerId,
        startWorld,
        startScreen,
        baseline,
        preview: baseline,
        selectedIds,
        startViewport,
      };
      return;
    }

    if (!actions.canEdit) {
      const hit = hitTest(board.shapes, startWorld);
      dispatch(setSelectedShapes(hit ? selectHitTarget(hit) : []));
      return;
    }

    if (wantsRotate && selectedFrame) {
      interactionRef.current = {
        mode: "rotate",
        pointerId: event.pointerId,
        startWorld,
        startScreen,
        baseline,
        preview: baseline,
        selectedIds,
        startViewport,
        selectionFrame: selectedFrame,
      };
      return;
    }

    if (handle && selectedFrame) {
      setResizeDirection({ x: 1, y: 1 });
      interactionRef.current = {
        mode: "resize",
        pointerId: event.pointerId,
        startWorld,
        startScreen,
        baseline,
        preview: baseline,
        selectedIds,
        startViewport,
        handle,
        selectionFrame: selectedFrame,
      };
      return;
    }

    if (selectedTool !== "pointer") {
      const drawStart = editor.snapToGrid
        ? snapPointToGrid(startWorld, editor.gridSize)
        : startWorld;
      const draft = createDraftShape(selectedTool, drawStart, board.shapes);
      const preview = [...baseline, draft];
      dispatch(setSelectedShapes([draft.id]));
      actions.previewShapes(preview);
      interactionRef.current = {
        mode: "draw",
        pointerId: event.pointerId,
        startWorld: drawStart,
        startScreen,
        baseline,
        preview,
        selectedIds: [draft.id],
        startViewport,
        shapeId: draft.id,
      };
      return;
    }

    const hit = hitTest(board.shapes, startWorld);
    if (hit) {
      const hitIds = selectHitTarget(hit);
      let nextSelection = selectedIds;
      if (event.shiftKey) {
        const selected = new Set(selectedIds);
        const removing = hitIds.every((id) => selected.has(id));
        hitIds.forEach((id) => (removing ? selected.delete(id) : selected.add(id)));
        nextSelection = [...selected];
      } else if (!selectedIds.includes(hit.id)) {
        nextSelection = hitIds;
      }
      dispatch(setSelectedShapes(nextSelection));
      if (nextSelection.length > 0) {
        interactionRef.current = {
          mode: "move",
          pointerId: event.pointerId,
          startWorld,
          startScreen,
          baseline,
          preview: baseline,
          selectedIds: nextSelection,
          startViewport,
        };
      }
      return;
    }

    const additiveSelection = event.shiftKey ? selectedIds : [];
    if (!event.shiftKey) dispatch(clearSelectedShapes());
    setMarquee({ start: startWorld, end: startWorld });
    interactionRef.current = {
      mode: "marquee",
      pointerId: event.pointerId,
      startWorld,
      startScreen,
      baseline,
      preview: baseline,
      selectedIds: additiveSelection,
      additiveSelection,
      startViewport,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const world = pointerWorld(event);
    if (cursorFrameRef.current === null) {
      cursorFrameRef.current = window.requestAnimationFrame(() => {
        cursorFrameRef.current = null;
        updateMyPresence({ cursor: world });
      });
    }

    const hit = !interactionRef.current ? hitTest(board.shapes, world) : undefined;
    dispatch(setHoveredShapeId(hit?.id ?? null));

    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    if (interaction.mode === "pan") {
      const currentScreen = pointerScreen(event);
      dispatch(
        setViewport(
          panViewport(interaction.startViewport, {
            x: currentScreen.x - interaction.startScreen.x,
            y: currentScreen.y - interaction.startScreen.y,
          })
        )
      );
      return;
    }

    if (interaction.mode === "draw" && interaction.shapeId) {
      const draft = interaction.baseline.length < interaction.preview.length
        ? interaction.preview.find((shape) => shape.id === interaction.shapeId)
        : undefined;
      if (!draft) return;
      const drawEnd = editor.snapToGrid
        ? snapPointToGrid(world, editor.gridSize)
        : world;
      const nextDraft = draftAtPoint(
        draft,
        interaction.startWorld,
        drawEnd,
        event.shiftKey
      );
      interaction.preview = [...interaction.baseline, nextDraft];
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "move") {
      interaction.preview = moveShapesFromBaseline(
        interaction.baseline,
        interaction.selectedIds,
        { x: world.x - interaction.startWorld.x, y: world.y - interaction.startWorld.y },
        editor.snapToGrid ? editor.gridSize : 0
      );
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "resize" && interaction.handle && interaction.selectionFrame) {
      const options = {
        fromCenter: event.altKey,
        lockAspectRatio: event.shiftKey,
        minimumSize: 1,
        gridSize: editor.snapToGrid ? editor.gridSize : 0,
      };
      const transform = resizeTransformForFrame(
        interaction.selectionFrame,
        interaction.handle,
        world,
        options
      );
      const nextDirection = {
        x: transform.scaleX < 0 ? -1 : 1,
        y: transform.scaleY < 0 ? -1 : 1,
      };
      setResizeDirection((current) =>
        current.x === nextDirection.x && current.y === nextDirection.y
          ? current
          : nextDirection
      );
      interaction.preview = resizeSelectionFromPointer(
        interaction.baseline,
        interaction.selectedIds,
        interaction.selectionFrame,
        interaction.handle,
        world,
        options
      );
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "rotate" && interaction.selectionFrame) {
      interaction.preview = rotateShapesFromBaseline(
        interaction.baseline,
        interaction.selectedIds,
        interaction.selectionFrame.bounds,
        interaction.startWorld,
        world,
        event.shiftKey ? 15 : 0
      );
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "marquee") {
      setMarquee({ start: interaction.startWorld, end: world });
      const hits = shapesInMarquee(interaction.baseline, interaction.startWorld, world);
      dispatch(setSelectedShapes([...new Set([...(interaction.additiveSelection ?? []), ...hits])]));
    }
  };

  const finishInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setResizeDirection({ x: 1, y: 1 });
    setMarquee(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    let shouldCommit = false;
    if (interaction.mode === "draw" && interaction.shapeId) {
      const current = interaction.preview.find((shape) => shape.id === interaction.shapeId);
      if (current) {
        const bounds = shapeBounds(current);
        if (bounds.width < 3 || bounds.height < 3) {
          const defaults = current.type === "text"
            ? { width: 180, height: 40 }
            : { width: 120, height: 88 };
          const replacement = normalizeShape({
            ...current,
            x2: current.x1 + defaults.width,
            y2: current.y1 + defaults.height,
          });
          interaction.preview = [...interaction.baseline, replacement];
        }
      }
      shouldCommit = true;
      dispatch(setSelectedTool("pointer"));
    } else if (
      interaction.mode === "move" ||
      interaction.mode === "resize" ||
      interaction.mode === "rotate"
    ) {
      shouldCommit = true;
    }

    if (shouldCommit) {
      actions.commitShapes(interaction.preview, interaction.baseline);
    }
  };

  const cancelInteraction = (event?: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction) actions.previewShapes(interaction.baseline);
    interactionRef.current = null;
    setResizeDirection({ x: 1, y: 1 });
    setMarquee(null);
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (event.ctrlKey || event.metaKey) {
      const localPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = Math.exp(-event.deltaY * 0.002);
      dispatch(setViewport(zoomAtPoint(editor.viewport, localPoint, editor.viewport.zoom * factor)));
    } else {
      dispatch(
        setViewport(
          panViewport(editor.viewport, { x: -event.deltaX, y: -event.deltaY })
        )
      );
    }
  };

  const fitToContent = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const bounds = selectionBounds(board.shapes, board.shapes.map((shape) => shape.id));
    if (!bounds) {
      dispatch(setViewport({ x: 0, y: 0, zoom: 1 }));
      return;
    }
    const padding = 96;
    const contentWidth = Math.max(1, bounds.width);
    const contentHeight = Math.max(1, bounds.height);
    const zoom = Math.min(
      4,
      Math.max(
        0.1,
        Math.min(
          Math.max(1, rect.width - padding * 2) / contentWidth,
          Math.max(1, rect.height - padding * 2) / contentHeight
        )
      )
    );
    dispatch(
      setViewport({
        x: bounds.x - (rect.width / zoom - bounds.width) / 2,
        y: bounds.y - (rect.height / zoom - bounds.height) / 2,
        zoom,
      })
    );
  }, [board.shapes, dispatch]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isEditableTarget(event.target)) {
        spacePressedRef.current = true;
      }
      if (isEditableTarget(event.target)) {
        if (event.key === "Escape") (event.target as HTMLElement).blur();
        return;
      }

      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        actions.redo();
        return;
      }
      if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        actions.copySelected();
        return;
      }
      if (command && event.key.toLowerCase() === "x") {
        event.preventDefault();
        actions.cutSelected();
        return;
      }
      if (command && event.key.toLowerCase() === "v") {
        event.preventDefault();
        actions.paste();
        return;
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        actions.duplicateSelected();
        return;
      }
      if (command && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) actions.ungroupSelected();
        else actions.groupSelected();
        return;
      }
      if (command && (event.key === "+" || event.key === "=" || event.key === "-")) {
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const factor = event.key === "-" ? 0.8 : 1.25;
        dispatch(
          setViewport(
            zoomAtPoint(editor.viewport, { x: rect.width / 2, y: rect.height / 2 }, editor.viewport.zoom * factor)
          )
        );
        return;
      }
      if (command && event.key === "0") {
        event.preventDefault();
        fitToContent();
        return;
      }
      if (command && event.key === "1") {
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        dispatch(
          setViewport(
            zoomAtPoint(
              editor.viewport,
              { x: rect.width / 2, y: rect.height / 2 },
              1
            )
          )
        );
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        actions.removeSelected();
        return;
      }
      if (event.key === "Escape") {
        cancelInteraction();
        dispatch(setEditingShapeId(null));
        dispatch(clearSelectedShapes());
        dispatch(setSelectedTool("pointer"));
        return;
      }
      if (event.key.startsWith("Arrow") && selectedIds.length > 0) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        actions.nudgeSelected(
          event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0,
          event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0
        );
        return;
      }
      const toolByKey: Record<string, EditorTool> = {
        v: "pointer",
        h: "hand",
        r: "rectangle",
        o: "ellipse",
        t: "text",
        i: "image",
        b: "board",
      };
      const tool = toolByKey[event.key.toLowerCase()];
      if (tool && !command) dispatch(setSelectedTool(tool));
      if (event.key === "]") actions.orderSelected(event.metaKey || event.ctrlKey ? "front" : "forward");
      if (event.key === "[") actions.orderSelected(event.metaKey || event.ctrlKey ? "back" : "backward");
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
    // cancelInteraction reads only refs and the current action facade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, dispatch, editor.viewport, fitToContent, selectedIds.length]);

  const handleTextChange = (shapeId: string, text: string) => {
    if (!textBaselineRef.current) textBaselineRef.current = cloneShapes(board.shapes);
    actions.previewShapes(
      board.shapes.map((shape) => (shape.id === shapeId ? { ...shape, text } : shape))
    );
  };

  const commitText = () => {
    if (textBaselineRef.current) {
      actions.commitShapes(board.shapes, textBaselineRef.current);
      textBaselineRef.current = null;
    }
    dispatch(setEditingShapeId(null));
  };

  const screenFrame = selectedFrame
    ? {
        start: worldToScreen(
          { x: selectedFrame.bounds.x, y: selectedFrame.bounds.y },
          editor.viewport
        ),
        width: selectedFrame.bounds.width * editor.viewport.zoom,
        height: selectedFrame.bounds.height * editor.viewport.zoom,
        rotation: selectedFrame.rotation,
      }
    : null;

  const marqueeStyle = marquee
    ? (() => {
        const start = worldToScreen(marquee.start, editor.viewport);
        const end = worldToScreen(marquee.end, editor.viewport);
        return {
          left: Math.min(start.x, end.x),
          top: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
        };
      })()
    : null;

  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      style={{
        backgroundColor: board.backGroundColor,
        cursor:
          selectedTool === "hand"
            ? "grab"
            : selectedTool === "pointer"
            ? "default"
            : "crosshair",
        ...(showGrid
          ? {
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)",
              backgroundSize: `${Math.max(8, editor.gridSize * editor.viewport.zoom)}px ${Math.max(8, editor.gridSize * editor.viewport.zoom)}px`,
              backgroundPosition: `${-editor.viewport.x * editor.viewport.zoom}px ${-editor.viewport.y * editor.viewport.zoom}px`,
            }
          : {}),
      }}
      role="application"
      aria-label="Kumo design canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={cancelInteraction}
      onWheel={handleWheel}
      onContextMenu={(event) => {
        event.preventDefault();
        const hit = hitTest(board.shapes, pointerWorld(event as unknown as React.PointerEvent<HTMLDivElement>));
        if (hit && !selectedIds.includes(hit.id)) dispatch(setSelectedShapes(selectHitTarget(hit)));
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onDoubleClick={(event) => {
        const hit = hitTest(board.shapes, pointerWorld(event));
        if (hit?.type === "board" && hit.boardId) {
          setNavigationError(null);
          void getBoard(hit.boardId)
            .then((nextBoard) => {
              dispatch(clearSelectedShapes());
              dispatch(setWhiteboardData(nextBoard));
            })
            .catch((error) => setNavigationError(
              error instanceof Error ? error.message : "We couldn't open the linked board."
            ));
          return;
        }
        if (hit?.type === "text") {
          dispatch(setSelectedShapes([hit.id]));
          dispatch(setEditingShapeId(hit.id));
        }
      }}
    >
      <div className={styles.shapeLayer} aria-live="off">
        {board.shapes
          .slice()
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((shape) => {
            if (shape.hidden) return null;
            const bounds = shapeBounds(shape);
            const position = worldToScreen({ x: bounds.x, y: bounds.y }, editor.viewport);
            const isEditing = editor.editingShapeId === shape.id && shape.type === "text";
            const commonStyle: React.CSSProperties = {
              left: position.x,
              top: position.y,
              width: Math.max(1, bounds.width * editor.viewport.zoom),
              height: Math.max(1, bounds.height * editor.viewport.zoom),
              transform: `rotate(${shape.rotation ?? 0}deg) scaleX(${shape.flipX ? -1 : 1}) scaleY(${shape.flipY ? -1 : 1})`,
              borderRadius: shape.type === "ellipse" ? "50%" : `${shape.borderRadius ?? 0}px`,
              border: `${Math.max(0, (shape.borderWidth ?? 0) * editor.viewport.zoom)}px ${shape.borderStyle ?? "solid"} ${shape.borderColor ?? "transparent"}`,
              backgroundColor: shape.backgroundColor ?? "transparent",
              backgroundImage: shape.backgroundImage ? `url(${shape.backgroundImage})` : undefined,
              opacity: shape.opacity ?? 1,
              color: shape.color ?? "#f7f7f5",
              zIndex: shape.zIndex,
            };

            return (
              <div
                key={shape.id}
                className={`${styles.shape} ${selectedIds.includes(shape.id) ? styles.selectedShape : ""}`}
                style={commonStyle}
                data-shape-id={shape.id}
              >
                {shape.type === "text" &&
                  (isEditing ? (
                    <TextEditor
                      style={{
                        fontFamily: shape.fontFamily ?? "Arial",
                        fontSize: `${(shape.fontSize ?? 18) * editor.viewport.zoom}px`,
                        fontWeight: shape.fontWeight ?? "normal",
                        textAlign: (shape.textAlign as React.CSSProperties["textAlign"]) ?? "left",
                        lineHeight: shape.lineHeight ?? 1.2,
                        letterSpacing: `${(shape.letterSpacing ?? 0) * editor.viewport.zoom}px`,
                        textDecoration: shape.textDecoration ?? "none",
                      }}
                      value={shape.text ?? ""}
                      onChange={(text) => handleTextChange(shape.id, text)}
                      onBlur={commitText}
                    />
                  ) : (
                    <div
                      className={styles.textContent}
                      style={{
                        alignItems: shape.alignItems ?? "flex-start",
                        fontFamily: shape.fontFamily ?? "Arial",
                        fontSize: `${(shape.fontSize ?? 18) * editor.viewport.zoom}px`,
                        fontWeight: shape.fontWeight ?? "normal",
                        justifyContent:
                          shape.textAlign === "center"
                            ? "center"
                            : shape.textAlign === "right"
                            ? "flex-end"
                            : "flex-start",
                        lineHeight: shape.lineHeight ?? 1.2,
                        letterSpacing: `${(shape.letterSpacing ?? 0) * editor.viewport.zoom}px`,
                        textDecoration: shape.textDecoration ?? "none",
                      }}
                    >
                      {shape.text}
                    </div>
                  ))}
                {shape.type === "calendar" && <span className={styles.placeholderGlyph}>31</span>}
                {shape.type === "board" && <span className={styles.boardLabel}>{shape.title ?? "Open board"}</span>}
              </div>
            );
          })}
      </div>

      {screenFrame && selectedIds.length > 0 && (
        <div
          className={styles.selectionBox}
          style={{
            left: screenFrame.start.x,
            top: screenFrame.start.y,
            width: screenFrame.width,
            height: screenFrame.height,
            transform: `rotate(${screenFrame.rotation}deg) scaleX(${resizeDirection.x}) scaleY(${resizeDirection.y})`,
          }}
          role="group"
          aria-label="Selection transform controls"
        >
          {actions.canEdit && (
            <>
              <span className={styles.rotationStem} aria-hidden="true" />
              <button
                type="button"
                aria-label="Rotate selection"
                className={styles.rotationHandle}
                data-rotation-handle="true"
              />
              {resizeHandles.map((item) => (
                <button
                  key={item.handle}
                  type="button"
                  aria-label={item.label}
                  className={styles.resizeHandle}
                  data-resize-handle={item.handle}
                  style={{ left: item.left, top: item.top, cursor: item.cursor }}
                />
              ))}
            </>
          )}
        </div>
      )}

      {marqueeStyle && (
        <div className={styles.marquee} style={marqueeStyle} aria-hidden="true" />
      )}

      {board.currentUsers
        .filter((presence) => presence.uid !== user.uid)
        .map((presence) => {
          const point = worldToScreen({ x: presence.cursorX, y: presence.cursorY }, editor.viewport);
          return (
            <div
              className={styles.remoteCursor}
              key={presence.uid}
              style={{ left: point.x, top: point.y }}
            >
              <span className={styles.cursorArrow}>◆</span>
              <span className={styles.cursorLabel}>{presence.label ?? "Collaborator"}</span>
            </div>
          );
        })}

      {contextMenu && (
        <div
          className={styles.contextMenu}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {[
            ["Copy", actions.copySelected],
            ["Paste", actions.paste],
            ["Duplicate", actions.duplicateSelected],
            ["Group", actions.groupSelected],
            ["Bring to front", () => actions.orderSelected("front")],
            ["Send to back", () => actions.orderSelected("back")],
            ["Delete", actions.removeSelected],
          ].map(([label, action]) => (
            <button
              type="button"
              role="menuitem"
              key={label as string}
              onClick={() => {
                (action as () => void)();
                setContextMenu(null);
              }}
            >
              {label as string}
            </button>
          ))}
        </div>
      )}
      {navigationError && (
        <div className={styles.navigationError} role="alert">
          <span>{navigationError}</span>
          <button type="button" aria-label="Dismiss navigation error" onClick={() => setNavigationError(null)}>×</button>
        </div>
      )}
    </div>
  );
};

export default EditorCanvas;
