import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cursor, X } from "@phosphor-icons/react";
import { useUpdateMyPresence } from "@liveblocks/react";
import { useDispatch, useSelector } from "react-redux";
import { Shape, ShapeFunctions } from "../../classes/shape";
import { duplicateShapes } from "../../editor/commands";
import {
  hitTest,
  effectiveGridSize,
  moveShapesFromBaseline,
  normalizeShape,
  normalizeDegrees,
  panViewport,
  resizeSelectionFromPointer,
  resizeTransformForFrame,
  rotateShapesFromBaseline,
  rotationDeltaForPointer,
  screenToWorld,
  selectionBounds,
  selectionFrame,
  shapeBounds,
  shapesInMarquee,
  snapPointToGrid,
  worldToScreen,
  wheelZoomFactor,
  ZOOM_STEP_FACTOR,
  zoomAtPoint,
} from "../../editor/geometry";
import { constrainFrameChildren, displayTextLines } from "../../editor/layout";
import { measureShapes } from "../../editor/measurement";
import {
  createVectorShape,
  effectStyles,
  gradientCss,
  shapePathData,
  updateVectorPoint,
  vectorPathData,
} from "../../editor/graphics";
import {
  adoptContainedShapes,
  frameAtPoint,
  isEffectivelyHidden,
  isEffectivelyLocked,
  reparentAfterMove,
  topLevelFrameFor,
} from "../../editor/hierarchy";
import {
  frameClipInsets,
  SmartGuide,
  snapMoveToObjects,
  snapResizePointerToObjects,
} from "../../editor/snapping";
import { EditorTool, Point, ResizeHandle, SelectionFrame, Viewport } from "../../editor/types";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import {
  initializeEditor,
  setMeasureMode,
  setCommentDraftAnchor,
  setCurrentPageId,
  setEditingShapeId,
  setHoveredShapeId,
  setViewport,
} from "../../features/editor/editorSlice";
import {
  clearSelectedShapes,
  setSelectedShapes,
  setSelectedTool,
  setSelectionRotation,
} from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { AppDispatch, RootState } from "../../store";
import { getBoard } from "../../services/boardRepository";
import styles from "./EditorCanvas.module.css";
import { CommentPins } from "../../comments/CommentPins";
import { documentPages, shapesOnPage } from "../../editor/workspace";

type InteractionMode = "draw" | "move" | "resize" | "rotate" | "marquee" | "pan" | "vector-point";

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
  includeNested?: boolean;
  commitBaseline?: Shape[];
  vectorShapeId?: string;
  vectorPointId?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  worldPoint: Point;
}

interface TextEditorProps {
  value: string;
  style: React.CSSProperties;
  verticalAlign: React.CSSProperties["alignItems"];
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
    textarea.style.height = `${Math.min(textarea.scrollHeight, textarea.parentElement?.clientHeight ?? textarea.scrollHeight)}px`;
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
  tool: Exclude<EditorTool, "pointer" | "hand" | "comment">,
  point: Point,
  shapes: Shape[]
): Shape => {
  if (tool === "pen") {
    return createVectorShape(point, point, Math.max(0, ...shapes.map((shape) => shape.zIndex)) + 1);
  }
  const shape = ShapeFunctions.createShape(tool, point.x, point.y, shapes);
  return normalizeShape({
    ...shape,
    text: tool === "text" ? "Type something" : shape.text,
    fontSize: tool === "text" ? 18 : shape.fontSize,
    name: tool === "board" ? "Linked board" : tool === "text" ? "Text" : tool === "image" ? "Image" : tool === "ellipse" ? "Ellipse" : tool === "frame" ? "Frame" : "Rectangle",
    title: tool === "board" ? "Choose a destination" : shape.title,
    backgroundColor: tool === "text" || tool === "image" || tool === "frame" ? "transparent" : tool === "board" ? "#303640" : "#f4f2ed",
    color: "#f7f7f5",
    borderColor: tool === "frame" ? "#8b8d92" : "#17181a",
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
  if (draft.type === "vector" && draft.vectorPoints?.length) {
    const last = draft.vectorPoints.at(-1)!;
    return updateVectorPoint([draft], draft.id, last.id, { x: start.x + dx, y: start.y + dy })[0]!;
  }
  return normalizeShape({
    ...draft,
    x1: start.x,
    y1: start.y,
    x2: start.x + dx,
    y2: start.y + dy,
  });
};

const VectorGraphic = ({ shape }: { shape: Shape }) => {
  const bounds = shapeBounds(shape);
  const viewBox = `0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`;
  if (shape.type === "boolean" && shape.booleanChildren?.length) {
    const id = `boolean-${shape.id.replace(/[^a-z0-9]/gi, "")}`;
    const paths = shape.booleanChildren.map((child) => shapePathData(child, bounds));
    if (shape.booleanOperation === "subtract") {
      return (
        <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
          <defs><mask id={`${id}-mask`}><rect width="100%" height="100%" fill="black" /><path d={paths[0]} fill="white" />{paths.slice(1).map((path, index) => <path key={index} d={path} fill="black" />)}</mask></defs>
          <rect width="100%" height="100%" fill={shape.backgroundColor ?? "#fff"} mask={`url(#${id}-mask)`} />
        </svg>
      );
    }
    if (shape.booleanOperation === "intersect") {
      return (
        <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id={`${id}-clip`}><path d={paths[0]} /></clipPath></defs>
          {paths.slice(1).map((path, index) => <path key={index} d={path} fill={shape.backgroundColor ?? "#fff"} clipPath={`url(#${id}-clip)`} />)}
        </svg>
      );
    }
    return (
      <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
        {shape.booleanOperation === "exclude"
          ? <path d={paths.join(" ")} fill={shape.backgroundColor ?? "#fff"} fillRule="evenodd" />
          : paths.map((path, index) => <path key={index} d={path} fill={shape.backgroundColor ?? "#fff"} />)}
      </svg>
    );
  }
  return (
    <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      <path
        d={vectorPathData(shape.vectorPoints ?? [], bounds, shape.vectorClosed)}
        fill={shape.vectorClosed ? shape.backgroundColor ?? "transparent" : "none"}
        stroke={shape.borderColor ?? "#fff"}
        strokeWidth={shape.borderWidth ?? 1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

interface EditorCanvasViewProps {
  actions: EditorActions;
  updateMyPresence: (patch: Partial<Liveblocks["Presence"]>) => void;
  showCommentPins?: boolean;
}

export const EditorCanvasView = ({ actions, updateMyPresence, showCommentPins = true }: EditorCanvasViewProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const interactionRef = useRef<Interaction | null>(null);
  const textBaselineRef = useRef<Shape[] | null>(null);
  const spacePressedRef = useRef(false);
  const cursorFrameRef = useRef<number | null>(null);
  const latestCursorRef = useRef<Point | null>(null);
  const navigationRequestRef = useRef(0);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState({ x: 1, y: 1 });
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);

  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const selectionRotation = useSelector((state: RootState) => state.selected.selectionRotation);
  const selectedTool = useSelector((state: RootState) => state.selected.selectedTool);
  const editor = useSelector((state: RootState) => state.editor);
  const user = useSelector((state: RootState) => state.auth);
  const showGrid = useSelector((state: RootState) => state.actions.grid);
  const pages = useMemo(() => documentPages(board.shapes), [board.shapes]);
  const activePageId = editor.currentPageId && pages.some((page) => page.id === editor.currentPageId)
    ? editor.currentPageId
    : pages[0]!.id;
  const canvasShapes = useMemo(() => shapesOnPage(board.shapes, activePageId), [activePageId, board.shapes]);
  const selectedFrame = useMemo(
    () => selectionFrame(canvasShapes, selectedIds, selectionRotation),
    [canvasShapes, selectedIds, selectionRotation]
  );
  const selectedShapes = useMemo(
    () => canvasShapes.filter((shape) => selectedIds.includes(shape.id)),
    [canvasShapes, selectedIds]
  );
  const selectedGroupId = selectedShapes[0]?.groupId;
  const isExistingGroup = Boolean(
    selectedShapes.length > 1 &&
    selectedGroupId &&
    selectedShapes.every((shape) => shape.groupId === selectedGroupId)
  );
  const canUngroup = selectedShapes.some((shape) => Boolean(shape.groupId));
  const canUnframe = selectedShapes.some((shape) => shape.type === "frame");
  const selectionLocked = selectedShapes.some((shape) => isEffectivelyLocked(canvasShapes, shape));
  const activeGridSize = editor.snapToGrid
    ? effectiveGridSize(editor.gridSize, editor.viewport.zoom)
    : 0;
  const measurements = useMemo(() => {
    if (!editor.measureMode || selectedShapes.length !== 1 || !editor.hoveredShapeId) return [];
    const hovered = canvasShapes.find((shape) => shape.id === editor.hoveredShapeId);
    if (!hovered || hovered.id === selectedShapes[0]?.id || hovered.type === "guide") return [];
    return measureShapes(selectedShapes[0]!, hovered).filter((measurement) => measurement.value > 0);
  }, [canvasShapes, editor.hoveredShapeId, editor.measureMode, selectedShapes]);

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
    dispatch(setCurrentPageId(documentPages(board.shapes)[0]!.id));
    // Board identity intentionally scopes the history reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, board.roomId, dispatch]);

  useEffect(() => {
    updateMyPresence({ selectionIds: selectedIds });
  }, [selectedIds, updateMyPresence]);

  useEffect(() => {
    updateMyPresence({ viewport: editor.viewport });
  }, [editor.viewport, updateMyPresence]);

  useEffect(() => {
    viewportRef.current = editor.viewport;
  }, [editor.viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelUnit = (event: WheelEvent) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 16;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return canvas.clientHeight || 1;
      return 1;
    };
    const handleCanvasWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const unit = wheelUnit(event);
      const current = viewportRef.current;
      const next = event.ctrlKey || event.metaKey
        ? zoomAtPoint(
            current,
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            current.zoom * wheelZoomFactor(event.deltaY * unit)
          )
        : panViewport(current, {
            x: -event.deltaX * unit,
            y: -event.deltaY * unit,
          });
      viewportRef.current = next;
      dispatch(setViewport(next));
    };

    canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleCanvasWheel);
  }, [dispatch]);

  useEffect(() => () => {
    navigationRequestRef.current += 1;
    if (cursorFrameRef.current !== null) {
      window.cancelAnimationFrame(cursorFrameRef.current);
    }
  }, []);

  const pointerWorld = useCallback(
    (event: Pick<React.PointerEvent<HTMLDivElement>, "clientX" | "clientY">): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToWorld({ x: event.clientX, y: event.clientY }, rect, editor.viewport);
    },
    [editor.viewport]
  );

  const createGuide = useCallback((axis: "horizontal" | "vertical", event: React.PointerEvent<HTMLElement>) => {
    if (!actions.canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerWorld(event as unknown as React.PointerEvent<HTMLDivElement>);
    const guide = normalizeShape({
      ...ShapeFunctions.createShape("guide", point.x, point.y, board.shapes),
      name: `${axis === "vertical" ? "Vertical" : "Horizontal"} guide`,
      guideAxis: axis,
      x1: axis === "vertical" ? point.x : 0,
      x2: axis === "vertical" ? point.x : 0,
      y1: axis === "horizontal" ? point.y : 0,
      y2: axis === "horizontal" ? point.y : 0,
      locked: true,
      pageId: activePageId,
    });
    actions.commitShapes([...board.shapes, guide]);
  }, [actions, activePageId, board.shapes, pointerWorld]);

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
    (shape: Shape, deep = false): string[] => {
      if (!deep) {
        const frame = topLevelFrameFor(canvasShapes, shape);
        if (frame) return [frame.id];
      }
      if (!shape.groupId) return [shape.id];
      return canvasShapes
        .filter((candidate) => candidate.groupId === shape.groupId)
        .map((candidate) => candidate.id);
    },
    [canvasShapes]
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
    const vectorPointId = (event.target as HTMLElement).dataset.vectorPointId;
    const vectorShapeId = (event.target as HTMLElement).dataset.vectorShapeId;
    const wantsPan = event.button === 1 || selectedTool === "hand" || spacePressedRef.current;
    const deepSelection = event.metaKey || event.ctrlKey;

    if (selectedTool === "comment") {
      const hit = hitTest(canvasShapes, startWorld);
      const bounds = hit ? shapeBounds(hit) : null;
      dispatch(setCommentDraftAnchor({
        x: startWorld.x - (bounds?.x ?? 0),
        y: startWorld.y - (bounds?.y ?? 0),
        shapeId: hit?.id ?? "",
      }));
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    if (vectorPointId && vectorShapeId && actions.canEdit) {
      interactionRef.current = {
        mode: "vector-point",
        pointerId: event.pointerId,
        startWorld,
        startScreen,
        baseline,
        preview: baseline,
        selectedIds: [vectorShapeId],
        startViewport,
        vectorPointId,
        vectorShapeId,
      };
      return;
    }
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
      const hit = hitTest(canvasShapes, startWorld);
      dispatch(setSelectedShapes(hit ? selectHitTarget(hit, deepSelection) : []));
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
      const drawStart = activeGridSize
        ? snapPointToGrid(startWorld, activeGridSize)
        : startWorld;
      const parent = frameAtPoint(canvasShapes, drawStart);
      const draft = normalizeShape({
        ...createDraftShape(selectedTool, drawStart, board.shapes),
        parentId: parent?.id ?? null,
        pageId: activePageId,
      });
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

    const hit = hitTest(canvasShapes, startWorld);
    if (hit) {
      const hitIds = selectHitTarget(hit, deepSelection);
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
        let moveBaseline = baseline;
        let commitBaseline: Shape[] | undefined;
        if (event.altKey) {
          const duplicated = duplicateShapes(baseline, nextSelection, 0);
          moveBaseline = duplicated.shapes;
          commitBaseline = baseline;
          nextSelection = duplicated.duplicatedIds;
          dispatch(setSelectedShapes(nextSelection));
          actions.previewShapes(moveBaseline);
        }
        interactionRef.current = {
          mode: "move",
          pointerId: event.pointerId,
          startWorld,
          startScreen,
          baseline: moveBaseline,
          preview: moveBaseline,
          selectedIds: nextSelection,
          startViewport,
          commitBaseline,
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
      includeNested: deepSelection,
      startViewport,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const world = pointerWorld(event);
    latestCursorRef.current = world;
    if (cursorFrameRef.current === null) {
      cursorFrameRef.current = window.requestAnimationFrame(() => {
        cursorFrameRef.current = null;
        if (latestCursorRef.current) updateMyPresence({ cursor: latestCursorRef.current });
      });
    }

    const hit = !interactionRef.current ? hitTest(canvasShapes, world) : undefined;
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

    if (interaction.mode === "vector-point" && interaction.vectorShapeId && interaction.vectorPointId) {
      interaction.preview = updateVectorPoint(
        interaction.baseline,
        interaction.vectorShapeId,
        interaction.vectorPointId,
        activeGridSize ? snapPointToGrid(world, activeGridSize) : world
      );
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "draw" && interaction.shapeId) {
      const draft = interaction.baseline.length < interaction.preview.length
        ? interaction.preview.find((shape) => shape.id === interaction.shapeId)
        : undefined;
      if (!draft) return;
      const drawEnd = activeGridSize
        ? snapPointToGrid(world, activeGridSize)
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
      let delta = { x: world.x - interaction.startWorld.x, y: world.y - interaction.startWorld.y };
      if (event.shiftKey) {
        delta = Math.abs(delta.x) >= Math.abs(delta.y)
          ? { x: delta.x, y: 0 }
          : { x: 0, y: delta.y };
      }
      if (!event.ctrlKey && !event.metaKey && !activeGridSize) {
        const snapped = snapMoveToObjects(
          interaction.baseline,
          interaction.selectedIds,
          delta,
          6 / editor.viewport.zoom
        );
        delta = snapped.delta;
        setSmartGuides(snapped.guides);
      } else {
        setSmartGuides([]);
      }
      interaction.preview = moveShapesFromBaseline(
        interaction.baseline,
        interaction.selectedIds,
        delta,
        activeGridSize
      );
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "resize" && interaction.handle && interaction.selectionFrame) {
      const snapped = !event.ctrlKey && !event.metaKey && !activeGridSize
        ? snapResizePointerToObjects(
            interaction.baseline,
            interaction.selectedIds,
            interaction.handle,
            world,
            6 / editor.viewport.zoom
          )
        : { point: world, guides: [] };
      setSmartGuides(snapped.guides);
      const options = {
        fromCenter: event.altKey,
        lockAspectRatio: event.shiftKey,
        minimumSize: 1,
        gridSize: activeGridSize,
      };
      const transform = resizeTransformForFrame(
        interaction.selectionFrame,
        interaction.handle,
        snapped.point,
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
      const resized = resizeSelectionFromPointer(
        interaction.baseline,
        interaction.selectedIds,
        interaction.selectionFrame,
        interaction.handle,
        snapped.point,
        options
      );
      const resizedFrameId = interaction.selectedIds.length === 1 &&
        interaction.baseline.find((shape) => shape.id === interaction.selectedIds[0])?.type === "frame"
        ? interaction.selectedIds[0]
        : null;
      interaction.preview = resizedFrameId
        ? constrainFrameChildren(interaction.baseline, resized, resizedFrameId)
        : resized;
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
        event.shiftKey ? 15 : 0,
        interaction.selectionFrame.rotation
      );
      const delta = rotationDeltaForPointer(
        interaction.selectionFrame.bounds,
        interaction.startWorld,
        world,
        event.shiftKey ? 15 : 0,
        interaction.selectionFrame.rotation
      );
      dispatch(setSelectionRotation(
        normalizeDegrees(interaction.selectionFrame.rotation + delta)
      ));
      actions.previewShapes(interaction.preview);
      return;
    }

    if (interaction.mode === "marquee") {
      setMarquee({ start: interaction.startWorld, end: world });
      const hits = shapesInMarquee(
        interaction.baseline,
        interaction.startWorld,
        world,
        interaction.includeNested
      );
      dispatch(setSelectedShapes([...new Set([...(interaction.additiveSelection ?? []), ...hits])]));
    }
  };

  const finishInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setResizeDirection({ x: 1, y: 1 });
    setSmartGuides([]);
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
            : current.type === "vector"
              ? { width: 120, height: 0 }
            : { width: 120, height: 88 };
          const replacement = current.type === "vector" && current.vectorPoints?.length
            ? updateVectorPoint([current], current.id, current.vectorPoints.at(-1)!.id, {
                x: current.x1 + defaults.width,
                y: current.y1 + defaults.height,
              })[0]!
            : normalizeShape({
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
      interaction.mode === "rotate" ||
      interaction.mode === "vector-point"
    ) {
      shouldCommit = true;
    }

    if (interaction.mode === "move") {
      interaction.preview = reparentAfterMove(
        interaction.preview,
        interaction.selectedIds,
        spacePressedRef.current
      );
    }
    if (interaction.mode === "draw" && interaction.shapeId) {
      const created = interaction.preview.find((shape) => shape.id === interaction.shapeId);
      interaction.preview = created?.type === "frame"
        ? adoptContainedShapes(interaction.preview, created.id)
        : reparentAfterMove(interaction.preview, interaction.selectedIds);
    }

    if (shouldCommit) {
      actions.commitShapes(interaction.preview, interaction.commitBaseline ?? interaction.baseline);
    }
    if (interaction.mode === "draw" && interaction.shapeId) {
      const created = interaction.preview.find((shape) => shape.id === interaction.shapeId);
      if (created?.type === "text") dispatch(setEditingShapeId(created.id));
    }
  };

  const cancelInteraction = (event?: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction) {
      actions.cancelPreview(interaction.commitBaseline ?? interaction.baseline);
      if (interaction.mode === "rotate" && interaction.selectionFrame) {
        dispatch(setSelectionRotation(interaction.selectionFrame.rotation));
      }
    }
    interactionRef.current = null;
    setResizeDirection({ x: 1, y: 1 });
    setSmartGuides([]);
    setMarquee(null);
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const fitToContent = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const bounds = selectionBounds(canvasShapes, canvasShapes.map((shape) => shape.id));
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
  }, [canvasShapes, dispatch]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      return target instanceof Element
        && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt" && !isEditableTarget(event.target)) dispatch(setMeasureMode(true));
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
        const rect = canvasRef.current?.getBoundingClientRect();
        const selectedShape = selectedIds.length === 1
          ? canvasShapes.find((shape) => shape.id === selectedIds[0])
          : undefined;
        const target = selectedShape?.type === "frame"
          ? selectedShape
          : selectedShape?.parentId
            ? canvasShapes.find((shape) => shape.id === selectedShape.parentId && shape.type === "frame")
            : undefined;
        actions.paste({
          targetFrameId: target?.id ?? null,
          ...(rect ? {
            viewport: {
              x: editor.viewport.x,
              y: editor.viewport.y,
              width: rect.width / editor.viewport.zoom,
              height: rect.height / editor.viewport.zoom,
            },
          } : {}),
        });
        return;
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        actions.duplicateSelected();
        return;
      }
      if (command && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.altKey) actions.frameSelected();
        else if (event.shiftKey) actions.ungroupSelected();
        else actions.groupSelected();
        return;
      }
      if (command && (event.key === "+" || event.key === "=" || event.key === "-")) {
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const factor = event.key === "-" ? 1 / ZOOM_STEP_FACTOR : ZOOM_STEP_FACTOR;
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
      if ((event.key === "Enter" || event.key === "F2") && selectedIds.length === 1) {
        const selectedShape = canvasShapes.find((shape) => shape.id === selectedIds[0]);
        if (event.key === "Enter" && event.shiftKey && selectedShape?.parentId) {
          event.preventDefault();
          dispatch(setSelectedShapes([selectedShape.parentId]));
          return;
        }
        if (event.key === "Enter" && selectedShape?.type === "frame") {
          const child = canvasShapes
            .filter((shape) => shape.parentId === selectedShape.id && !isEffectivelyHidden(canvasShapes, shape))
            .sort((left, right) => right.zIndex - left.zIndex)[0];
          if (child) {
            event.preventDefault();
            dispatch(setSelectedShapes(selectHitTarget(child, true)));
            return;
          }
        }
        if (selectedShape?.type === "text" && !isEffectivelyLocked(canvasShapes, selectedShape)) {
          event.preventDefault();
          dispatch(setEditingShapeId(selectedShape.id));
          return;
        }
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
        f: "frame",
        r: "rectangle",
        o: "ellipse",
        p: "pen",
        t: "text",
        i: "image",
        b: "board",
        c: "comment",
      };
      const tool = toolByKey[event.key.toLowerCase()];
      if (tool && !command) dispatch(setSelectedTool(tool));
      if (event.key === "]") actions.orderSelected(event.metaKey || event.ctrlKey ? "front" : "forward");
      if (event.key === "[") actions.orderSelected(event.metaKey || event.ctrlKey ? "back" : "backward");
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
      if (event.key === "Alt") dispatch(setMeasureMode(false));
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
    // cancelInteraction reads only refs and the current action facade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, board.shapes, dispatch, editor.viewport, fitToContent, selectHitTarget, selectedIds]);

  const handleTextChange = (shapeId: string, text: string) => {
    if (!textBaselineRef.current) textBaselineRef.current = cloneShapes(board.shapes);
    actions.previewShapes(
      board.shapes.map((shape) => (shape.id === shapeId ? { ...shape, text } : shape))
    );
  };

  const commitText = (shapeId: string, text: string) => {
    if (textBaselineRef.current) {
      const nextShapes = board.shapes.map((shape) =>
        shape.id === shapeId ? { ...shape, text } : shape
      );
      actions.commitShapes(nextShapes, textBaselineRef.current);
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
              backgroundSize: `${effectiveGridSize(editor.gridSize, editor.viewport.zoom) * editor.viewport.zoom}px ${effectiveGridSize(editor.gridSize, editor.viewport.zoom) * editor.viewport.zoom}px`,
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
      onPointerLeave={() => {
        if (!interactionRef.current) {
          latestCursorRef.current = null;
          updateMyPresence({ cursor: null });
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const worldPoint = pointerWorld(event as unknown as React.PointerEvent<HTMLDivElement>);
        const hit = hitTest(canvasShapes, worldPoint);
        if (hit && !selectedIds.includes(hit.id)) dispatch(setSelectedShapes(selectHitTarget(hit)));
        setContextMenu({ x: event.clientX, y: event.clientY, worldPoint });
      }}
      onDoubleClick={(event) => {
        const hit = hitTest(canvasShapes, pointerWorld(event));
        if (hit?.type === "board" && hit.boardId) {
          const requestId = ++navigationRequestRef.current;
          setNavigationError(null);
          void getBoard(hit.boardId)
            .then((nextBoard) => {
              if (requestId !== navigationRequestRef.current) return;
              dispatch(clearSelectedShapes());
              dispatch(setWhiteboardData(nextBoard));
            })
            .catch((error) => {
              if (requestId === navigationRequestRef.current) {
                setNavigationError(
                  error instanceof Error ? error.message : "We couldn't open the linked board."
                );
              }
            });
          return;
        }
        if (hit) dispatch(setSelectedShapes(selectHitTarget(hit, true)));
        if (hit?.type === "text") {
          if (!isEffectivelyLocked(canvasShapes, hit)) dispatch(setEditingShapeId(hit.id));
        }
      }}
    >
      <div className={styles.shapeLayer} aria-live="off">
        {canvasShapes
          .slice()
          .filter((shape) => shape.type !== "guide")
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((shape) => {
            if (isEffectivelyHidden(canvasShapes, shape)) return null;
            if (shape.isMask) return null;
            const bounds = shapeBounds(shape);
            const clipInsets = frameClipInsets(canvasShapes, shape);
            const mask = shape.maskId ? canvasShapes.find((candidate) => candidate.id === shape.maskId) : undefined;
            const maskBounds = mask ? shapeBounds(mask) : null;
            const maskClip = maskBounds
              ? mask?.type === "ellipse"
                ? `ellipse(${maskBounds.width / 2 * editor.viewport.zoom}px ${maskBounds.height / 2 * editor.viewport.zoom}px at ${(maskBounds.x + maskBounds.width / 2 - bounds.x) * editor.viewport.zoom}px ${(maskBounds.y + maskBounds.height / 2 - bounds.y) * editor.viewport.zoom}px)`
                : `inset(${Math.max(0, maskBounds.y - bounds.y) * editor.viewport.zoom}px ${Math.max(0, bounds.x + bounds.width - maskBounds.x - maskBounds.width) * editor.viewport.zoom}px ${Math.max(0, bounds.y + bounds.height - maskBounds.y - maskBounds.height) * editor.viewport.zoom}px ${Math.max(0, maskBounds.x - bounds.x) * editor.viewport.zoom}px)`
              : undefined;
            const position = worldToScreen({ x: bounds.x, y: bounds.y }, editor.viewport);
            const isEditing = editor.editingShapeId === shape.id && shape.type === "text";
            const commonStyle: React.CSSProperties = {
              left: position.x,
              top: position.y,
              width: Math.max(1, bounds.width * editor.viewport.zoom),
              height: Math.max(1, bounds.height * editor.viewport.zoom),
              transform: `rotate(${shape.rotation ?? 0}deg) scaleX(${shape.flipX ? -1 : 1}) scaleY(${shape.flipY ? -1 : 1})`,
              borderRadius: shape.type === "ellipse" ? "50%" : `${shape.borderRadius ?? 0}px`,
              border: shape.type === "vector" || shape.type === "boolean" ? 0 : `${Math.max(0, (shape.borderWidth ?? 0) * editor.viewport.zoom)}px ${shape.borderStyle ?? "solid"} ${shape.borderColor ?? "transparent"}`,
              backgroundColor: shape.backgroundColor ?? "transparent",
              backgroundImage: shape.backgroundImage ? `url(${shape.backgroundImage})` : gradientCss(shape),
              opacity: shape.opacity ?? 1,
              color: shape.color ?? "#f7f7f5",
              zIndex: shape.zIndex,
              mixBlendMode: shape.blendMode as React.CSSProperties["mixBlendMode"],
              ...effectStyles(shape),
              ...(clipInsets ? {
                clipPath: `inset(${clipInsets.top * editor.viewport.zoom}px ${clipInsets.right * editor.viewport.zoom}px ${clipInsets.bottom * editor.viewport.zoom}px ${clipInsets.left * editor.viewport.zoom}px)`,
              } : {}),
              ...(maskClip ? { clipPath: maskClip } : {}),
            };

            return (
              <div
                key={shape.id}
                className={`${styles.shape} ${selectedIds.includes(shape.id) ? styles.selectedShape : ""} ${editor.hoveredShapeId === shape.id && !selectedIds.includes(shape.id) ? styles.hoveredShape : ""}`}
                style={commonStyle}
                data-shape-id={shape.id}
                data-group-id={shape.groupId ?? undefined}
                data-parent-id={shape.parentId ?? undefined}
                data-shape-type={shape.type}
                data-locked={isEffectivelyLocked(canvasShapes, shape) ? "true" : "false"}
                data-z-index={shape.zIndex}
                data-flip-x={shape.flipX ? "true" : "false"}
                data-flip-y={shape.flipY ? "true" : "false"}
              >
                {(shape.type === "frame" || shape.type === "section") && (
                  <span className={styles.frameLabel}>{shape.name ?? "Frame"}</span>
                )}
                {(shape.type === "vector" || shape.type === "boolean") && <VectorGraphic shape={shape} />}
                {shape.type === "text" &&
                  (isEditing ? (
                    <TextEditor
                      verticalAlign={(shape.alignItems as React.CSSProperties["alignItems"]) ?? "flex-start"}
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
                      onBlur={(text) => commitText(shape.id, text)}
                    />
                  ) : (
                    <div
                      className={styles.textContent}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        if (shape.locked) return;
                        dispatch(setSelectedShapes([shape.id]));
                        dispatch(setEditingShapeId(shape.id));
                      }}
                      style={{
                        alignItems: shape.alignItems ?? "flex-start",
                        fontFamily: shape.fontFamily ?? "Arial",
                        fontSize: `${(shape.fontSize ?? 18) * editor.viewport.zoom}px`,
                        fontWeight: shape.fontWeight ?? "normal",
                        lineHeight: shape.lineHeight ?? 1.2,
                        letterSpacing: `${(shape.letterSpacing ?? 0) * editor.viewport.zoom}px`,
                        textDecoration: shape.textDecoration ?? "none",
                      }}
                    >
                      <span
                        style={{
                          textAlign: (shape.textAlign as React.CSSProperties["textAlign"]) ?? "left",
                          paddingInlineStart: `${(shape.textIndent ?? 0) * editor.viewport.zoom}px`,
                        }}
                      >
                        {displayTextLines(shape).map((line, index) => (
                          <span
                            key={`${shape.id}-line-${index}`}
                            className={styles.textParagraph}
                            style={{ marginBlockEnd: index < displayTextLines(shape).length - 1 ? `${(shape.paragraphSpacing ?? 0) * editor.viewport.zoom}px` : 0 }}
                          >
                            {line || "\u00a0"}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                {shape.type === "calendar" && <span className={styles.placeholderGlyph}>31</span>}
                {shape.type === "board" && <span className={styles.boardLabel}>{shape.title ?? "Open board"}</span>}
              </div>
            );
          })}
      </div>

      {selectedShapes.length === 1 && selectedShapes[0]?.type === "vector" && selectedShapes[0].vectorPoints?.map((point) => {
        const position = worldToScreen(point, editor.viewport);
        return (
          <button
            type="button"
            key={point.id}
            className={styles.vectorPoint}
            style={{ left: position.x, top: position.y }}
            data-vector-point-id={point.id}
            data-vector-shape-id={selectedShapes[0]!.id}
            aria-label={`Move vector point ${point.id}`}
          />
        );
      })}

      {editor.showRulers && (
        <>
          <div
            className={`${styles.ruler} ${styles.horizontalRuler}`}
            aria-label="Horizontal ruler. Click to add a vertical guide."
            role="button"
            tabIndex={0}
            onPointerDown={(event) => createGuide("vertical", event)}
          >
            {Array.from({ length: 41 }, (_, index) => (Math.floor(editor.viewport.x / 100) - 10 + index) * 100).map((value) => (
              <span key={value} style={{ left: (value - editor.viewport.x) * editor.viewport.zoom }}><b>{value}</b></span>
            ))}
          </div>
          <div
            className={`${styles.ruler} ${styles.verticalRuler}`}
            aria-label="Vertical ruler. Click to add a horizontal guide."
            role="button"
            tabIndex={0}
            onPointerDown={(event) => createGuide("horizontal", event)}
          >
            {Array.from({ length: 41 }, (_, index) => (Math.floor(editor.viewport.y / 100) - 10 + index) * 100).map((value) => (
              <span key={value} style={{ top: (value - editor.viewport.y) * editor.viewport.zoom }}><b>{value}</b></span>
            ))}
          </div>
          <span className={styles.rulerCorner} aria-hidden="true" />
        </>
      )}

      {canvasShapes.filter((shape) => shape.type === "guide" && shape.guideAxis).map((guide) => {
        const vertical = guide.guideAxis === "vertical";
        const position = vertical
          ? (guide.x1 - editor.viewport.x) * editor.viewport.zoom
          : (guide.y1 - editor.viewport.y) * editor.viewport.zoom;
        return (
          <button
            type="button"
            key={guide.id}
            className={`${styles.persistentGuide} ${vertical ? styles.verticalGuide : styles.horizontalGuide}`}
            style={vertical ? { left: position } : { top: position }}
            aria-label={`${vertical ? "Vertical" : "Horizontal"} guide at ${Math.round(vertical ? guide.x1 : guide.y1)}. Double-click to remove.`}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={() => actions.commitShapes(board.shapes.filter((shape) => shape.id !== guide.id))}
          />
        );
      })}

      {measurements.map((measurement) => {
        const start = worldToScreen(measurement.start, editor.viewport);
        const end = worldToScreen(measurement.end, editor.viewport);
        const horizontal = measurement.axis === "horizontal";
        return (
          <span
            key={measurement.axis}
            className={styles.measurement}
            style={{
              left: Math.min(start.x, end.x),
              top: Math.min(start.y, end.y),
              width: horizontal ? Math.max(1, Math.abs(end.x - start.x)) : 1,
              height: horizontal ? 1 : Math.max(1, Math.abs(end.y - start.y)),
            }}
            aria-label={`${measurement.axis} distance ${Math.round(measurement.value)}`}
          >
            <b>{Math.round(measurement.value)}</b>
          </span>
        );
      })}

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
          {actions.canEdit && !selectionLocked && (
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

      {smartGuides.map((guide, index) => {
        const start = worldToScreen(
          guide.axis === "x"
            ? { x: guide.position, y: guide.start }
            : { x: guide.start, y: guide.position },
          editor.viewport
        );
        return (
          <span
            key={`${guide.axis}-${guide.position}-${index}`}
            className={styles.smartGuide}
            data-guide-axis={guide.axis}
            style={guide.axis === "x"
              ? { left: start.x, top: start.y, height: (guide.end - guide.start) * editor.viewport.zoom }
              : { left: start.x, top: start.y, width: (guide.end - guide.start) * editor.viewport.zoom }}
            aria-hidden="true"
          />
        );
      })}

      {board.currentUsers
        .filter((presence) =>
          presence.uid !== user.uid && presence.cursorX !== null && presence.cursorY !== null
        )
        .map((presence) => {
          const point = worldToScreen(
            { x: presence.cursorX!, y: presence.cursorY! },
            editor.viewport
          );
          return (
            <div
              className={styles.remoteCursor}
              key={presence.uid}
              style={{ left: point.x, top: point.y }}
            >
              <span className={styles.cursorArrow}><Cursor aria-hidden="true" weight="fill" /></span>
              <span className={styles.cursorLabel}>{presence.label ?? "Collaborator"}</span>
            </div>
          );
        })}

      {showCommentPins && <CommentPins />}

      {contextMenu && (
        <div
          className={styles.contextMenu}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {[
            ...(selectedShapes.length ? [["Copy", actions.copySelected] as const] : []),
            ["Paste here", () => actions.paste({ point: contextMenu.worldPoint })] as const,
            ...(selectedShapes.length ? [["Duplicate", actions.duplicateSelected] as const] : []),
            ...(selectedShapes.length > 1 && !isExistingGroup ? [["Group", actions.groupSelected] as const] : []),
            ...(canUngroup ? [["Ungroup", actions.ungroupSelected] as const] : []),
            ...(selectedShapes.length && !canUnframe ? [["Frame selection", actions.frameSelected] as const] : []),
            ...(canUnframe ? [["Remove frame", actions.unframeSelected] as const] : []),
            ...(selectedShapes.length ? [
              ["Bring to front", () => actions.orderSelected("front")] as const,
              ["Bring forward", () => actions.orderSelected("forward")] as const,
              ["Send backward", () => actions.orderSelected("backward")] as const,
              ["Send to back", () => actions.orderSelected("back")] as const,
              ["Delete", actions.removeSelected] as const,
            ] : []),
          ].map(([label, action]) => (
            <button
              type="button"
              role="menuitem"
              key={label}
              onClick={() => {
                action();
                setContextMenu(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {navigationError && (
        <div className={styles.navigationError} role="alert">
          <span>{navigationError}</span>
          <button type="button" aria-label="Dismiss navigation error" onClick={() => setNavigationError(null)}><X aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
};

const EditorCanvas = () => {
  const actions = useEditorActions();
  const updateMyPresence = useUpdateMyPresence();
  return <EditorCanvasView actions={actions} updateMyPresence={updateMyPresence} />;
};

export default EditorCanvas;
