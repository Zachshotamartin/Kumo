import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cursor, LockSimple, X } from "@phosphor-icons/react";
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
import {
  applyDocumentLayout,
  constrainFrameChildren,
  displayTextLines,
  fitTextShape,
} from "../../editor/layout";
import { measureShapes } from "../../editor/measurement";
import {
  updateVectorPoint,
} from "../../editor/graphics";
import { createDraftShape, draftAtPoint } from "../../editor/shapeCreation";
import {
  adoptContainedShapes,
  contextualSelectionIds,
  frameAtPoint,
  isEffectivelyHidden,
  isEffectivelyLocked,
  reparentAfterMove,
} from "../../editor/hierarchy";
import { rulerTicks } from "../../editor/rulers";
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
  setTextSelection,
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
import { TextEditor } from "./TextEditor";
import { ShapeVectorGraphic } from "./ShapeGraphic";
import { shapeAppearanceStyle } from "../../editor/shapeAppearance";
import { SelectionHighlight } from "./SelectionHighlight";
import { cullDocumentShapes, fontFeatureCss, fontVariationCss, textSegments } from "../../platform/productCapabilities";
import { useCollaborativeText } from "../../collaboration/useCollaborativeText";

type InteractionMode = "draw" | "move" | "resize" | "rotate" | "marquee" | "pan" | "vector-point";

const CONTEXT_ACTIONS_REQUIRING_IDLE_SELECTION = new Set([
  "Group",
  "Ungroup",
  "Frame selection",
  "Remove frame",
  "Bring to front",
  "Bring forward",
  "Send backward",
  "Send to back",
  "Delete",
]);

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

type CanvasPointerReleaseEvent = {
  currentTarget: HTMLDivElement;
  pointerId: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

const cloneShapes = (shapes: Shape[]): Shape[] => JSON.parse(JSON.stringify(shapes));

const capturePointer = (element: HTMLElement, pointerId: number) => {
  try { element.setPointerCapture(pointerId); } catch { /* Synthetic and cancelled pointers cannot be captured. */ }
};

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

interface EditorCanvasViewProps {
  actions: EditorActions;
  updateMyPresence: (patch: Partial<Liveblocks["Presence"]>) => void;
  showCommentPins?: boolean;
  applyCollaborativeText?: (shapeId: string, previousText: string, nextText: string) => void;
}

export const EditorCanvasView = ({
  actions,
  updateMyPresence,
  showCommentPins = true,
  applyCollaborativeText = () => undefined,
}: EditorCanvasViewProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const interactionRef = useRef<Interaction | null>(null);
  const finishInteractionRef = useRef<(event: CanvasPointerReleaseEvent) => void>(() => undefined);
  const cancelInteractionRef = useRef<(event?: Pick<CanvasPointerReleaseEvent, "currentTarget" | "pointerId">) => void>(() => undefined);
  const textBaselineRef = useRef<Shape[] | null>(null);
  const textDraftRef = useRef(new Map<string, string>());
  const spacePressedRef = useRef(false);
  const cursorFrameRef = useRef<number | null>(null);
  const latestCursorRef = useRef<Point | null>(null);
  const cursorChatInputRef = useRef<HTMLInputElement>(null);
  const navigationRequestRef = useRef(0);
  const touchPointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{
    distance: number;
    midpoint: Point;
    viewport: Viewport;
  } | null>(null);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [resizeDirection, setResizeDirection] = useState({ x: 1, y: 1 });
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);
  const [cursorChatMode, setCursorChatMode] = useState(false);
  const [cursorChat, setCursorChat] = useState("");
  const [cursorChatAnchor, setCursorChatAnchor] = useState<Point>({ x: 40, y: 40 });
  const [collaborationNotice, setCollaborationNotice] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1600, height: 1000 });

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
  const renderedShapes = useMemo(() => cullDocumentShapes(canvasShapes, {
    x: editor.viewport.x,
    y: editor.viewport.y,
    width: canvasSize.width / editor.viewport.zoom,
    height: canvasSize.height / editor.viewport.zoom,
  }, selectedIds), [canvasShapes, canvasSize.height, canvasSize.width, editor.viewport.x, editor.viewport.y, editor.viewport.zoom, selectedIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
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

  const remoteActivityFor = useCallback((shapeIds: string[]) => board.currentUsers.find((presence) =>
    presence.uid !== user.uid && presence.activeShapeIds?.some((id) => shapeIds.includes(id))
  ), [board.currentUsers, user.uid]);

  const claimShapeActivity = useCallback((
    shapeIds: string[],
    activity: NonNullable<Liveblocks["Presence"]["activity"]>
  ) => {
    const activeCollaborator = remoteActivityFor(shapeIds);
    if (activeCollaborator) {
      if (activity === "editing" && activeCollaborator.activity === "editing") {
        setCollaborationNotice(`Editing text with ${activeCollaborator.label ?? "a collaborator"}.`);
        updateMyPresence({ activeShapeIds: shapeIds, activity });
        return true;
      }
      setCollaborationNotice(
        `${activeCollaborator.label ?? "A collaborator"} is ${activeCollaborator.activity ?? "editing"} this selection.`
      );
      return false;
    }
    setCollaborationNotice(null);
    updateMyPresence({ activeShapeIds: shapeIds, activity });
    return true;
  }, [remoteActivityFor, updateMyPresence]);

  const releaseShapeActivity = useCallback(() => {
    updateMyPresence({ activeShapeIds: [], activity: null, textSelection: null });
  }, [updateMyPresence]);

  const blockIfRemotelyActive = useCallback((shapeIds: string[]) => {
    const activeCollaborator = remoteActivityFor(shapeIds);
    if (!activeCollaborator) return false;
    setCollaborationNotice(
      `${activeCollaborator.label ?? "A collaborator"} is ${activeCollaborator.activity ?? "editing"} this selection.`
    );
    return true;
  }, [remoteActivityFor]);

  const exitCursorChat = useCallback(() => {
    setCursorChatMode(false);
    setCursorChat("");
    updateMyPresence({ cursorChat: "" });
  }, [updateMyPresence]);

  const updateCursorChat = useCallback((value: string) => {
    const next = value.slice(0, 180);
    setCursorChat(next);
    updateMyPresence({ cursorChat: next });
  }, [updateMyPresence]);

  useEffect(() => {
    if (!cursorChatMode) return;
    cursorChatInputRef.current?.focus();
    const timeout = window.setTimeout(exitCursorChat, 5000);
    return () => window.clearTimeout(timeout);
  }, [cursorChat, cursorChatMode, exitCursorChat]);

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
    updateMyPresence({ activeShapeIds: [], activity: null, cursorChat: "" });
  }, [updateMyPresence]);

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
    (shape: Shape, deep = false): string[] => contextualSelectionIds(canvasShapes, shape, deep),
    [canvasShapes]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) return;
    setContextMenu(null);
    if (cursorChatMode) {
      exitCursorChat();
      return;
    }
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

    capturePointer(event.currentTarget, event.pointerId);
    if (vectorPointId && vectorShapeId && actions.canEdit) {
      if (!claimShapeActivity([vectorShapeId], "editing")) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
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
      if (!claimShapeActivity(selectedIds, "rotating")) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
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
      if (!claimShapeActivity(selectedIds, "resizing")) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
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
        if (!claimShapeActivity(nextSelection, "moving")) {
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (commitBaseline) actions.cancelPreview(commitBaseline);
          return;
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
    if (cursorChatMode) setCursorChatAnchor(world);
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

  const finishInteraction = (event: CanvasPointerReleaseEvent) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    // Some browsers coalesce the final pointermove under load. Recompute a move
    // from the pointerup coordinates so the committed geometry always matches
    // where the user actually released the object.
    if (interaction.mode === "move") {
      const world = pointerWorld(event);
      let delta = { x: world.x - interaction.startWorld.x, y: world.y - interaction.startWorld.y };
      if (event.shiftKey) {
        delta = Math.abs(delta.x) >= Math.abs(delta.y)
          ? { x: delta.x, y: 0 }
          : { x: 0, y: delta.y };
      }
      if (!event.ctrlKey && !event.metaKey && !activeGridSize) {
        delta = snapMoveToObjects(
          interaction.baseline,
          interaction.selectedIds,
          delta,
          6 / editor.viewport.zoom
        ).delta;
      }
      interaction.preview = moveShapesFromBaseline(
        interaction.baseline,
        interaction.selectedIds,
        delta,
        activeGridSize
      );
    }

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
                ...(current.type === "text" ? { textAutoResize: "auto-width" as const } : {}),
                x2: current.x1 + defaults.width,
                y2: current.y1 + defaults.height,
              });
          interaction.preview = [...interaction.baseline, replacement];
        } else if (current.type === "text") {
          interaction.preview = interaction.preview.map((shape) => shape.id === current.id
            ? fitTextShape({ ...shape, textAutoResize: "auto-height" })
            : shape);
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
    if (["move", "resize", "rotate", "vector-point"].includes(interaction.mode)) {
      releaseShapeActivity();
    }
    if (interaction.mode === "draw" && interaction.shapeId) {
      const created = interaction.preview.find((shape) => shape.id === interaction.shapeId);
      if (created?.type === "text" && claimShapeActivity([created.id], "editing")) {
        dispatch(setEditingShapeId(created.id));
      }
    }
  };

  const cancelInteraction = (event?: Pick<CanvasPointerReleaseEvent, "currentTarget" | "pointerId">) => {
    const interaction = interactionRef.current;
    if (interaction) {
      actions.cancelPreview(interaction.commitBaseline ?? interaction.baseline);
      if (interaction.mode === "rotate" && interaction.selectionFrame) {
        dispatch(setSelectionRotation(interaction.selectionFrame.rotation));
      }
      if (["move", "resize", "rotate", "vector-point"].includes(interaction.mode)) {
        releaseShapeActivity();
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

  const touchMidpoint = (points: Point[]) => ({
    x: (points[0]!.x + points[1]!.x) / 2,
    y: (points[0]!.y + points[1]!.y) / 2,
  });
  const touchDistance = (points: Point[]) => Math.hypot(
    points[1]!.x - points[0]!.x,
    points[1]!.y - points[0]!.y
  );
  const localTouchPoints = (element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    return [...touchPointersRef.current.values()].map((point) => ({ x: point.x - rect.left, y: point.y - rect.top }));
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      capturePointer(event.currentTarget, event.pointerId);
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = localTouchPoints(event.currentTarget);
      if (points.length >= 2) {
        cancelInteraction();
        pinchRef.current = {
          distance: Math.max(1, touchDistance(points)),
          midpoint: touchMidpoint(points),
          viewport: viewportRef.current,
        };
        return;
      }
    }
    handlePointerDown(event);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = localTouchPoints(event.currentTarget);
      const pinch = pinchRef.current;
      if (pinch && points.length >= 2) {
        event.preventDefault();
        const midpoint = touchMidpoint(points);
        const zoomed = zoomAtPoint(
          pinch.viewport,
          pinch.midpoint,
          pinch.viewport.zoom * touchDistance(points) / pinch.distance
        );
        const next = panViewport(zoomed, {
          x: midpoint.x - pinch.midpoint.x,
          y: midpoint.y - pinch.midpoint.y,
        });
        viewportRef.current = next;
        dispatch(setViewport(next));
        return;
      }
    }
    handlePointerMove(event);
  };

  const finishCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      const wasPinching = Boolean(pinchRef.current);
      touchPointersRef.current.delete(event.pointerId);
      if (touchPointersRef.current.size < 2) pinchRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (wasPinching) return;
    }
    finishInteraction(event);
  };

  const cancelCanvasPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    touchPointersRef.current.delete(event.pointerId);
    if (touchPointersRef.current.size < 2) pinchRef.current = null;
    cancelInteraction(event);
  };

  useEffect(() => {
    finishInteractionRef.current = finishInteraction;
    cancelInteractionRef.current = cancelInteraction;
  });

  useEffect(() => {
    const interaction = interactionRef.current;
    if (!interaction || !["move", "resize", "rotate", "vector-point"].includes(interaction.mode)) return;
    const contender = board.currentUsers
      .filter((presence) => presence.activeShapeIds?.some((id) => interaction.selectedIds.includes(id)))
      .sort((left, right) => left.uid.localeCompare(right.uid))[0];
    if (!contender) return;
    // Presence can cross in flight when two people begin on the same frame.
    // A stable user-id ordering gives both clients the same winner instead of
    // allowing two divergent previews to commit over one another.
    if (user.uid && user.uid.localeCompare(contender.uid) < 0) return;
    cancelInteractionRef.current();
    setCollaborationNotice(
      `${contender.label ?? "A collaborator"} took control of this selection first.`
    );
  }, [board.currentUsers, user.uid]);

  useEffect(() => {
    const finishOutsideCanvas = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !interactionRef.current) return;
      finishInteractionRef.current({
        currentTarget: canvas,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
    };
    const cancelOutsideCanvas = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !interactionRef.current) return;
      cancelInteractionRef.current({ currentTarget: canvas, pointerId: event.pointerId });
    };
    window.addEventListener("pointerup", finishOutsideCanvas);
    window.addEventListener("pointercancel", cancelOutsideCanvas);
    return () => {
      window.removeEventListener("pointerup", finishOutsideCanvas);
      window.removeEventListener("pointercancel", cancelOutsideCanvas);
    };
  }, []);

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
        if (blockIfRemotelyActive(selectedIds)) return;
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
        if (blockIfRemotelyActive(selectedIds)) return;
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
      if (!command && event.key === "/") {
        event.preventDefault();
        cancelInteraction();
        dispatch(clearSelectedShapes());
        dispatch(setSelectedTool("pointer"));
        setCursorChatAnchor(latestCursorRef.current ?? {
          x: editor.viewport.x + 80 / editor.viewport.zoom,
          y: editor.viewport.y + 80 / editor.viewport.zoom,
        });
        setCursorChatMode(true);
        setCursorChat("");
        updateMyPresence({ cursorChat: "" });
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (blockIfRemotelyActive(selectedIds)) return;
        actions.removeSelected();
        return;
      }
      if (event.key === "Escape") {
        cancelInteraction();
        if (cursorChatMode) exitCursorChat();
        if (editor.editingShapeId) releaseShapeActivity();
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
          if (claimShapeActivity([selectedShape.id], "editing")) {
            dispatch(setEditingShapeId(selectedShape.id));
          }
          return;
        }
      }
      if (event.key.startsWith("Arrow") && selectedIds.length > 0) {
        event.preventDefault();
        if (blockIfRemotelyActive(selectedIds)) return;
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
      if (tool && !command) {
        if (cursorChatMode) exitCursorChat();
        dispatch(setSelectedTool(tool));
      }
      if (event.key === "]" && !blockIfRemotelyActive(selectedIds)) {
        actions.orderSelected(event.metaKey || event.ctrlKey ? "front" : "forward");
      }
      if (event.key === "[" && !blockIfRemotelyActive(selectedIds)) {
        actions.orderSelected(event.metaKey || event.ctrlKey ? "back" : "backward");
      }
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
  }, [actions, blockIfRemotelyActive, board.shapes, claimShapeActivity, cursorChatMode, dispatch, editor.editingShapeId, editor.viewport, exitCursorChat, fitToContent, releaseShapeActivity, selectHitTarget, selectedIds, updateMyPresence]);

  const handleTextChange = (shapeId: string, text: string) => {
    if (!textBaselineRef.current) textBaselineRef.current = cloneShapes(board.shapes);
    const previousText = textDraftRef.current.get(shapeId)
      ?? board.shapes.find((shape) => shape.id === shapeId)?.text
      ?? "";
    applyCollaborativeText(shapeId, previousText, text);
    textDraftRef.current.set(shapeId, text);
    actions.previewShapes(
      applyDocumentLayout(board.shapes.map((shape) => (shape.id === shapeId
        ? { ...shape, text }
        : shape)))
    );
  };

  const commitText = (shapeId: string, text: string) => {
    if (textBaselineRef.current) {
      const nextShapes = board.shapes.map((shape) =>
        shape.id === shapeId ? fitTextShape({ ...shape, text }) : shape
      );
      actions.commitShapes(nextShapes, textBaselineRef.current);
      textBaselineRef.current = null;
    }
    textDraftRef.current.delete(shapeId);
    dispatch(setEditingShapeId(null));
    releaseShapeActivity();
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
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={finishCanvasPointer}
      onPointerCancel={cancelCanvasPointer}
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
          const linkedAccess = board.linkedBoards[hit.boardId];
          if (linkedAccess && !linkedAccess.accessible) {
            setNavigationError(`“${linkedAccess.title}” is private. Its owner needs to share that destination with you.`);
            return;
          }
          const requestId = ++navigationRequestRef.current;
          setNavigationError(null);
          void getBoard(hit.boardId)
            .then((nextBoard) => {
              if (requestId !== navigationRequestRef.current) return;
              const url = new URL(window.location.href);
              url.searchParams.set("board", hit.boardId!);
              window.history.replaceState({}, "", url);
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
          if (!isEffectivelyLocked(canvasShapes, hit) && claimShapeActivity([hit.id], "editing")) {
            dispatch(setEditingShapeId(hit.id));
          }
        }
      }}
    >
      <div className={styles.shapeLayer} aria-live="off">
        {renderedShapes
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
            const linkedAccess = shape.type === "board" && shape.boardId
              ? board.linkedBoards[shape.boardId]
              : undefined;
            const remoteActivity = remoteActivityFor([shape.id]);
            const remoteTextEditors = shape.type === "text"
              ? board.currentUsers.filter((presence) => presence.textSelection?.shapeId === shape.id)
              : [];
            const commonStyle: React.CSSProperties = {
              left: position.x,
              top: position.y,
              width: Math.max(1, bounds.width * editor.viewport.zoom),
              height: Math.max(1, bounds.height * editor.viewport.zoom),
              transform: `rotate(${shape.rotation ?? 0}deg) scaleX(${shape.flipX ? -1 : 1}) scaleY(${shape.flipY ? -1 : 1})`,
              ...shapeAppearanceStyle(shape, editor.viewport.zoom),
              ...(clipInsets ? {
                clipPath: `inset(${clipInsets.top * editor.viewport.zoom}px ${clipInsets.right * editor.viewport.zoom}px ${clipInsets.bottom * editor.viewport.zoom}px ${clipInsets.left * editor.viewport.zoom}px)`,
              } : {}),
              ...(maskClip ? { clipPath: maskClip } : {}),
            };

            return (
              <div
                key={shape.id}
                className={`${styles.shape} ${selectedIds.includes(shape.id) ? styles.selectedShape : ""} ${editor.hoveredShapeId === shape.id && !selectedIds.includes(shape.id) ? styles.hoveredShape : ""} ${remoteActivity ? styles.remoteActiveShape : ""}`}
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
                {remoteActivity && <span className={styles.remoteActivityBadge}>{remoteActivity.label ?? "Collaborator"} · {remoteActivity.activity ?? "editing"}</span>}
                {remoteTextEditors.length > 0 && <span className={styles.remoteTextEditors} aria-label={`${remoteTextEditors.map((person) => person.label ?? "Collaborator").join(", ")} editing text`}>{remoteTextEditors.map((person) => person.label?.slice(0, 1).toUpperCase() ?? "C").join("")}</span>}
                {(shape.type === "frame" || shape.type === "section") && (
                  <span className={styles.frameLabel}>{shape.name ?? "Frame"}</span>
                )}
                {(shape.type === "vector" || shape.type === "boolean") && <ShapeVectorGraphic shape={shape} />}
                {shape.type === "text" &&
                  (isEditing ? (
                    <TextEditor
                      autoResize={shape.textAutoResize ?? "fixed"}
                      verticalAlign={(shape.alignItems as React.CSSProperties["alignItems"]) ?? "flex-start"}
                      style={{
                        fontFamily: shape.fontFamily ?? "Arial",
                        fontSize: `${(shape.fontSize ?? 18) * editor.viewport.zoom}px`,
                        fontWeight: shape.fontWeight ?? "normal",
                        textAlign: (shape.textAlign as React.CSSProperties["textAlign"]) ?? "left",
                        lineHeight: shape.lineHeight ?? 1.2,
                        letterSpacing: `${(shape.letterSpacing ?? 0) * editor.viewport.zoom}px`,
                        textDecoration: shape.textDecoration ?? "none",
                        fontVariationSettings: fontVariationCss(shape.fontAxes),
                        fontFeatureSettings: fontFeatureCss(shape.openTypeFeatures),
                      }}
                      value={shape.text ?? ""}
                      onChange={(text) => handleTextChange(shape.id, text)}
                      onBlur={(text) => commitText(shape.id, text)}
                      onSelectionChange={(start, end) => {
                        dispatch(setTextSelection({ shapeId: shape.id, start, end }));
                        updateMyPresence({ textSelection: { shapeId: shape.id, start, end } });
                      }}
                    />
                  ) : (
                    <div
                      className={styles.textContent}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        if (isEffectivelyLocked(canvasShapes, shape)) return;
                        if (!claimShapeActivity([shape.id], "editing")) return;
                        dispatch(setSelectedShapes([shape.id]));
                        dispatch(setEditingShapeId(shape.id));
                      }}
                      style={{
                        alignItems: shape.alignItems ?? "flex-start",
                        overflow: "visible",
                        fontFamily: shape.fontFamily ?? "Arial",
                        fontSize: `${(shape.fontSize ?? 18) * editor.viewport.zoom}px`,
                        fontWeight: shape.fontWeight ?? "normal",
                        lineHeight: shape.lineHeight ?? 1.2,
                        letterSpacing: `${(shape.letterSpacing ?? 0) * editor.viewport.zoom}px`,
                        textDecoration: shape.textDecoration ?? "none",
                        fontVariationSettings: fontVariationCss(shape.fontAxes),
                        fontFeatureSettings: fontFeatureCss(shape.openTypeFeatures),
                      }}
                    >
                      <span
                        style={{
                          textAlign: (shape.textAlign as React.CSSProperties["textAlign"]) ?? "left",
                          paddingInlineStart: `${(shape.textIndent ?? 0) * editor.viewport.zoom}px`,
                          whiteSpace: shape.textAutoResize === "auto-width" ? "pre" : "pre-wrap",
                          overflowWrap: shape.textAutoResize === "auto-width" ? "normal" : "anywhere",
                        }}
                      >
                        {shape.textRuns?.length ? textSegments(shape).map((segment, index) => (
                          <span
                            key={`${shape.id}-run-${index}`}
                            style={{
                              color: segment.style.color,
                              fontFamily: segment.style.fontFamily,
                              fontSize: segment.style.fontSize ? `${segment.style.fontSize * editor.viewport.zoom}px` : undefined,
                              fontWeight: segment.style.fontWeight,
                              textDecoration: segment.style.textDecoration,
                            }}
                          >{segment.text}</span>
                        )) : displayTextLines(shape).map((line, index) => (
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
                {shape.type === "board" && (
                  <span className={`${styles.boardLabel} ${linkedAccess && !linkedAccess.accessible ? styles.lockedBoardLabel : ""}`}>
                    <b>{shape.title ?? "Open board"}</b>
                    {linkedAccess && !linkedAccess.accessible
                      ? <small><LockSimple aria-hidden="true" />Access required</small>
                      : <small>Open connected board</small>}
                  </span>
                )}
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
            {rulerTicks(editor.viewport.x, editor.viewport.zoom).map((tick) => (
              <span key={tick.value} data-ruler-value={tick.value} style={{ left: tick.position }}><b>{tick.label}</b></span>
            ))}
          </div>
          <div
            className={`${styles.ruler} ${styles.verticalRuler}`}
            aria-label="Vertical ruler. Click to add a horizontal guide."
            role="button"
            tabIndex={0}
            onPointerDown={(event) => createGuide("horizontal", event)}
          >
            {rulerTicks(editor.viewport.y, editor.viewport.zoom).map((tick) => (
              <span key={tick.value} data-ruler-value={tick.value} style={{ top: tick.position }}><b>{tick.label}</b></span>
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
        <SelectionHighlight
          style={{
            left: screenFrame.start.x,
            top: screenFrame.start.y,
            width: screenFrame.width,
            height: screenFrame.height,
            transform: `rotate(${screenFrame.rotation}deg) scaleX(${resizeDirection.x}) scaleY(${resizeDirection.y})`,
          }}
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
        </SelectionHighlight>
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
              <span className={styles.cursorIdentity}>
                <span className={styles.cursorLabel}>{presence.label ?? "Collaborator"}</span>
                {presence.cursorChat && <span className={styles.cursorChatBubble}>{presence.cursorChat}</span>}
              </span>
            </div>
          );
        })}

      {cursorChatMode && (() => {
        const point = worldToScreen(cursorChatAnchor, editor.viewport);
        return (
          <input
            ref={cursorChatInputRef}
            className={styles.localCursorChat}
            style={{ left: point.x, top: point.y }}
            aria-label="Cursor chat"
            value={cursorChat}
            placeholder="Type to everyone"
            maxLength={180}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => updateCursorChat(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                exitCursorChat();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                updateCursorChat("");
              }
            }}
          />
        );
      })()}

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
                if (
                  CONTEXT_ACTIONS_REQUIRING_IDLE_SELECTION.has(label)
                  && blockIfRemotelyActive(selectedIds)
                ) {
                  setContextMenu(null);
                  return;
                }
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
      {collaborationNotice && (
        <div className={styles.collaborationNotice} role="status">
          <span>{collaborationNotice}</span>
          <button type="button" aria-label="Dismiss collaboration notice" onClick={() => setCollaborationNotice(null)}><X aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
};

const EditorCanvas = () => {
  const actions = useEditorActions();
  const updateMyPresence = useUpdateMyPresence();
  const applyCollaborativeText = useCollaborativeText();
  return (
    <EditorCanvasView
      actions={actions}
      updateMyPresence={updateMyPresence}
      applyCollaborativeText={applyCollaborativeText}
    />
  );
};

export default EditorCanvas;
