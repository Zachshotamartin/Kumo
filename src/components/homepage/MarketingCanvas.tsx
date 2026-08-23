import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowRight,
  Graph,
  Trash,
} from "@phosphor-icons/react";
import {
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Shape } from "../../classes/shape";
import { shapeBounds } from "../../editor/geometry";
import { createDraftShape, draftAtPoint } from "../../editor/shapeCreation";
import {
  EDITOR_TOOL_DEFINITIONS,
  type EditorToolDefinition,
} from "../../editor/toolDefinitions";
import { ShapeVectorGraphic } from "../editor/ShapeGraphic";
import { TextEditor } from "../editor/TextEditor";
import { shapeAppearanceStyle } from "../../editor/shapeAppearance";
import { SelectionHighlight } from "../editor/SelectionHighlight";
import KumoLogo from "../brand/KumoLogo";
import type { KumoLogoContext } from "../brand/KumoLogoConfig";
import styles from "./MarketingCanvas.module.css";
import {
  MARKETING_CANVAS_HEIGHT,
  MARKETING_CANVAS_WIDTH,
  MARKETING_STATUS_SHAPE_ID,
  createMarketingTextShapes,
  moveMarketingShape,
} from "./marketingCanvasModel";

type MarketingTool = "pointer" | "rectangle" | "ellipse" | "pen";
type MarketingDrawTool = Exclude<MarketingTool, "pointer">;
type Point = { x: number; y: number };

type DrawGesture = {
  pointerId: number;
  start: Point;
  latest: Point;
  startClient: Point;
  latestClient: Point;
  square: boolean;
};

type TextDragGesture = {
  pointerId: number;
  shapeId: string;
  element: HTMLDivElement;
  canvasRect: DOMRect;
  startClient: Point;
  latestClient: Point;
};

const DRAW_THRESHOLD = 5;

const marketingToolIds = new Set<MarketingTool>(["pointer", "rectangle", "ellipse", "pen"]);
const tools = EDITOR_TOOL_DEFINITIONS.filter(
  (tool): tool is EditorToolDefinition & { id: MarketingTool } =>
    marketingToolIds.has(tool.id as MarketingTool)
);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const boundsFromPoints = (start: Point, end: Point) => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

const textTransform = (shape: Shape): CSSProperties["textTransform"] => {
  if (shape.textCase === "upper") return "uppercase";
  if (shape.textCase === "lower") return "lowercase";
  if (shape.textCase === "title") return "capitalize";
  return "none";
};

const textTagForShape = (shape: Shape): ElementType => {
  if (shape.id === "marketing-headline") return "h1";
  if (shape.id === "marketing-eyebrow" || shape.id === "marketing-copy") return "p";
  return "span";
};

const responsiveFontSize = (shape: Shape) => {
  const fluid = `${(shape.fontSize ?? 12) / 10}cqi`;
  if (shape.id === "marketing-brand") return `clamp(18px, ${fluid}, 20px)`;
  if (shape.id === "marketing-descriptor") return `clamp(9px, ${fluid}, 10px)`;
  if (isFlowShape(shape)) return `clamp(8px, ${fluid}, 10px)`;
  if (shape.id === MARKETING_STATUS_SHAPE_ID) return `clamp(9px, ${fluid}, 11px)`;
  if (shape.id === "marketing-eyebrow") return `clamp(9px, ${fluid}, 11px)`;
  if (shape.id === "marketing-headline") return `clamp(52px, ${fluid}, 78px)`;
  if (shape.id === "marketing-copy") return `clamp(15px, ${fluid}, 18px)`;
  return fluid;
};

const isFlowShape = (shape: Shape) =>
  shape.id === "marketing-explore" ||
  shape.id === "marketing-shape" ||
  shape.id === "marketing-build";

interface MarketingCanvasProps {
  logoContext: KumoLogoContext;
  logoStatus: string;
}

const MarketingCanvas = ({ logoContext, logoStatus }: MarketingCanvasProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previewRectRef = useRef<SVGRectElement>(null);
  const previewEllipseRef = useRef<SVGEllipseElement>(null);
  const previewLineRef = useRef<SVGLineElement>(null);
  const drawGestureRef = useRef<DrawGesture | null>(null);
  const textDragRef = useRef<TextDragGesture | null>(null);
  const [activeTool, setActiveTool] = useState<MarketingTool>("pointer");
  const [drawings, setDrawings] = useState<Shape[]>([]);
  const [textShapes, setTextShapes] = useState<Shape[]>(() =>
    createMarketingTextShapes(logoStatus)
  );
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const selectTool = (tool: MarketingTool) => {
    if (tool !== "pointer") setEditingTextId(null);
    setActiveTool(tool);
  };

  const pointInCanvas = (clientX: number, clientY: number, rect: DOMRect): Point => ({
    x: clamp(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * MARKETING_CANVAS_WIDTH,
      0,
      MARKETING_CANVAS_WIDTH
    ),
    y: clamp(
      ((clientY - rect.top) / Math.max(rect.height, 1)) * MARKETING_CANVAS_HEIGHT,
      0,
      MARKETING_CANVAS_HEIGHT
    ),
  });

  const clearPreview = () => {
    [previewRectRef.current, previewEllipseRef.current, previewLineRef.current]
      .forEach((element) => element?.removeAttribute("data-visible"));
  };

  const updatePreview = (
    tool: MarketingDrawTool,
    start: Point,
    end: Point,
    square: boolean
  ) => {
    clearPreview();
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    const constrainedEnd = square && tool !== "pen"
      ? {
        x: start.x + Math.sign(dx || 1) * size,
        y: start.y + Math.sign(dy || 1) * size,
      }
      : end;
    const bounds = boundsFromPoints(start, constrainedEnd);
    if (tool === "rectangle" && previewRectRef.current) {
      previewRectRef.current.setAttribute("x", String(bounds.x));
      previewRectRef.current.setAttribute("y", String(bounds.y));
      previewRectRef.current.setAttribute("width", String(bounds.width));
      previewRectRef.current.setAttribute("height", String(bounds.height));
      previewRectRef.current.setAttribute("data-visible", "true");
    } else if (tool === "ellipse" && previewEllipseRef.current) {
      previewEllipseRef.current.setAttribute("cx", String(bounds.x + bounds.width / 2));
      previewEllipseRef.current.setAttribute("cy", String(bounds.y + bounds.height / 2));
      previewEllipseRef.current.setAttribute("rx", String(bounds.width / 2));
      previewEllipseRef.current.setAttribute("ry", String(bounds.height / 2));
      previewEllipseRef.current.setAttribute("data-visible", "true");
    } else if (tool === "pen" && previewLineRef.current) {
      previewLineRef.current.setAttribute("x1", String(start.x));
      previewLineRef.current.setAttribute("y1", String(start.y));
      previewLineRef.current.setAttribute("x2", String(constrainedEnd.x));
      previewLineRef.current.setAttribute("y2", String(constrainedEnd.y));
      previewLineRef.current.setAttribute("data-visible", "true");
    }
  };

  const beginDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool === "pointer" || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const start = pointInCanvas(event.clientX, event.clientY, rect);
    drawGestureRef.current = {
      pointerId: event.pointerId,
      start,
      latest: start,
      startClient: { x: event.clientX, y: event.clientY },
      latestClient: { x: event.clientX, y: event.clientY },
      square: event.shiftKey,
    };
    setSelectedTextId(null);
    updatePreview(activeTool, start, start, event.shiftKey);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const continueDrawing = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = drawGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || activeTool === "pointer") return;
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.latest = pointInCanvas(event.clientX, event.clientY, rect);
    gesture.latestClient = { x: event.clientX, y: event.clientY };
    gesture.square = event.shiftKey;
    updatePreview(activeTool, gesture.start, gesture.latest, gesture.square);
  };

  const finishDrawing = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const gesture = drawGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    drawGestureRef.current = null;
    clearPreview();
    const distance = Math.hypot(
      gesture.latestClient.x - gesture.startClient.x,
      gesture.latestClient.y - gesture.startClient.y
    );
    if (commit && activeTool !== "pointer" && distance >= DRAW_THRESHOLD) {
      setDrawings((current) => {
        const draft = createDraftShape(activeTool, gesture.start, current);
        return [...current, draftAtPoint(
          draft,
          gesture.start,
          gesture.latest,
          gesture.square
        )];
      });
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const stampShape = () => {
    if (activeTool === "pointer") return;
    setDrawings((current) => {
      const offset = (current.length % 5) * 28;
      const start = { x: 350 + offset, y: 360 + offset };
      const end = activeTool === "pen"
        ? { x: start.x + 170, y: start.y + 90 }
        : { x: start.x + 150, y: start.y + 105 };
      const draft = createDraftShape(activeTool, start, current);
      return [...current, draftAtPoint(draft, start, end, false)];
    });
  };

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const shortcut = event.key.toLowerCase();
    const tool = tools.find((candidate) => candidate.shortcut.toLowerCase() === shortcut);
    if (tool) {
      event.preventDefault();
      selectTool(tool.id);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && shortcut === "z") {
      event.preventDefault();
      setDrawings((current) => current.slice(0, -1));
      return;
    }
    if (event.key === "Enter" && activeTool !== "pointer") {
      event.preventDefault();
      stampShape();
    }
  };

  const beginTextDrag = (event: PointerEvent<HTMLDivElement>, shape: Shape) => {
    if (activeTool !== "pointer" || editingTextId === shape.id || event.button !== 0) return;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    setSelectedTextId(shape.id);
    textDragRef.current = {
      pointerId: event.pointerId,
      shapeId: shape.id,
      element: event.currentTarget,
      canvasRect,
      startClient: { x: event.clientX, y: event.clientY },
      latestClient: { x: event.clientX, y: event.clientY },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const continueTextDrag = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = textDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.latestClient = { x: event.clientX, y: event.clientY };
    const deltaX = gesture.latestClient.x - gesture.startClient.x;
    const deltaY = gesture.latestClient.y - gesture.startClient.y;
    gesture.element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
  };

  const finishTextDrag = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const gesture = textDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    textDragRef.current = null;
    gesture.element.style.transform = "";
    if (commit) {
      const deltaX = ((gesture.latestClient.x - gesture.startClient.x) /
        Math.max(gesture.canvasRect.width, 1)) * MARKETING_CANVAS_WIDTH;
      const deltaY = ((gesture.latestClient.y - gesture.startClient.y) /
        Math.max(gesture.canvasRect.height, 1)) * MARKETING_CANVAS_HEIGHT;
      setTextShapes((current) => current.map((shape) =>
        shape.id === gesture.shapeId ? moveMarketingShape(shape, deltaX, deltaY) : shape
      ));
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const startEditing = (shape: Shape) => {
    if (activeTool !== "pointer") return;
    setSelectedTextId(shape.id);
    setEditingTextId(shape.id);
  };

  const updateText = (shapeId: string, text: string) => {
    if (shapeId === MARKETING_STATUS_SHAPE_ID) setStatusOverride(text);
    setTextShapes((current) => current.map((shape) =>
      shape.id === shapeId ? { ...shape, text } : shape
    ));
  };

  const commitTextEdit = (shapeId: string, text: string) => {
    updateText(shapeId, text);
    setEditingTextId(null);
  };

  const moveTextWithKeyboard = (shape: Shape, event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const deltas: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = deltas[event.key];
    if (!delta) return false;
    event.preventDefault();
    setSelectedTextId(shape.id);
    setTextShapes((current) => current.map((candidate) =>
      candidate.id === shape.id
        ? moveMarketingShape(candidate, delta.x, delta.y)
        : candidate
    ));
    return true;
  };

  const resetCanvas = () => {
    drawGestureRef.current = null;
    textDragRef.current = null;
    clearPreview();
    setDrawings([]);
    setTextShapes(createMarketingTextShapes(logoStatus));
    setStatusOverride(null);
    setSelectedTextId(null);
    setEditingTextId(null);
    setActiveTool("pointer");
  };

  return (
    <div ref={canvasRef} className={styles.marketingCanvas} data-context={logoContext}>
      <div className={styles.drawingLayer} aria-hidden="true" data-layer="drawings">
        {drawings
          .slice()
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((shape) => {
            const bounds = shapeBounds(shape);
            const appearance = shapeAppearanceStyle(shape, 1);
            return (
              <div
                key={shape.id}
                className={styles.drawnShape}
                data-shape-id={shape.id}
                data-shape-type={shape.type}
                data-z-index={shape.zIndex}
                style={{
                  left: `${(bounds.x / MARKETING_CANVAS_WIDTH) * 100}%`,
                  top: `${(bounds.y / MARKETING_CANVAS_HEIGHT) * 100}%`,
                  width: `${(Math.max(1, bounds.width) / MARKETING_CANVAS_WIDTH) * 100}%`,
                  height: `${(Math.max(1, bounds.height) / MARKETING_CANVAS_HEIGHT) * 100}%`,
                  ...appearance,
                }}
              >
                {shape.type === "vector" && <ShapeVectorGraphic shape={shape} />}
              </div>
            );
          })}
      </div>

      <svg
        className={styles.previewLayer}
        viewBox={`0 0 ${MARKETING_CANVAS_WIDTH} ${MARKETING_CANVAS_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect ref={previewRectRef} className={styles.previewShape} />
        <ellipse ref={previewEllipseRef} className={styles.previewShape} />
        <line ref={previewLineRef} className={styles.previewShape} />
      </svg>

      <div
        ref={surfaceRef}
        className={styles.sketchSurface}
        data-tool={activeTool}
        role="button"
        tabIndex={0}
        aria-label="Kumo sketch canvas. Choose a shape tool, then drag to draw. Press Enter to stamp a shape."
        onPointerDown={beginDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={(event) => finishDrawing(event, true)}
        onPointerCancel={(event) => finishDrawing(event, false)}
        onLostPointerCapture={(event) => finishDrawing(event, true)}
        onKeyDown={handleSurfaceKeyDown}
      />

      <div className={styles.objectLayer} data-layer="marketing-objects" data-tool={activeTool}>
        {textShapes.map((modelShape) => {
          const shape = modelShape.id === MARKETING_STATUS_SHAPE_ID
            ? { ...modelShape, text: statusOverride ?? logoStatus }
            : modelShape;
          const TextTag = textTagForShape(shape);
          const editing = editingTextId === shape.id;
          const selected = selectedTextId === shape.id;
          const hasFlowArrow = shape.id === "marketing-explore" || shape.id === "marketing-shape";
          const objectStyle = {
            left: `${(shape.x1 / MARKETING_CANVAS_WIDTH) * 100}%`,
            top: `${(shape.y1 / MARKETING_CANVAS_HEIGHT) * 100}%`,
            width: `${(shape.width / MARKETING_CANVAS_WIDTH) * 100}%`,
            height: `${(shape.height / MARKETING_CANVAS_HEIGHT) * 100}%`,
            minHeight: `${(shape.height / MARKETING_CANVAS_HEIGHT) * 100}%`,
            zIndex: shape.zIndex,
            color: shape.color,
            fontFamily: shape.fontFamily,
            fontSize: responsiveFontSize(shape),
            fontWeight: shape.fontWeight,
            lineHeight: shape.lineHeight,
            letterSpacing: `${(shape.letterSpacing ?? 0) / 10}cqi`,
            textAlign: shape.textAlign as CSSProperties["textAlign"],
            textTransform: textTransform(shape),
          } satisfies CSSProperties;

          return (
            // The focusable ARIA group is a draggable canvas object. Native buttons
            // cannot legally contain the heading and paragraph semantics rendered here.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <div
              key={shape.id}
              className={`${styles.textObject} ${isFlowShape(shape) ? styles.flowObject : ""} ${selected ? styles.selectedObject : ""} ${editing ? styles.editingObject : ""}`}
              style={objectStyle}
              data-shape-id={shape.id}
              data-model-type={shape.type}
              data-shape-x={shape.x1}
              data-shape-y={shape.y1}
              data-shape-z={shape.zIndex}
              role="group"
              tabIndex={activeTool === "pointer" ? 0 : -1}
              aria-label={`${shape.name}: ${shape.text}. Drag to move. Press Enter to edit.`}
              onFocus={() => activeTool === "pointer" && setSelectedTextId(shape.id)}
              onPointerDown={(event) => beginTextDrag(event, shape)}
              onPointerMove={continueTextDrag}
              onPointerUp={(event) => finishTextDrag(event, true)}
              onPointerCancel={(event) => finishTextDrag(event, false)}
              onLostPointerCapture={(event) => finishTextDrag(event, true)}
              onDoubleClick={() => startEditing(shape)}
              onKeyDown={(event) => {
                if (editing || moveTextWithKeyboard(shape, event)) return;
                if (event.key === "Enter" || event.key === "F2") {
                  event.preventDefault();
                  startEditing(shape);
                }
              }}
            >
              {selected && <SelectionHighlight decorative style={{ inset: -4 }} />}
              {shape.id === "marketing-eyebrow" && <Graph aria-hidden="true" />}
              {editing ? (
                <TextEditor
                  value={shape.text ?? ""}
                  verticalAlign="flex-start"
                  style={{
                    fontFamily: shape.fontFamily,
                    fontSize: responsiveFontSize(shape),
                    fontWeight: shape.fontWeight,
                    lineHeight: shape.lineHeight,
                    letterSpacing: `${(shape.letterSpacing ?? 0) / 10}cqi`,
                    textAlign: shape.textAlign as CSSProperties["textAlign"],
                    textTransform: textTransform(shape),
                  }}
                  onChange={(text) => updateText(shape.id, text)}
                  onBlur={(text) => commitTextEdit(shape.id, text)}
                />
              ) : (
                <TextTag
                  className={styles.objectText}
                  aria-live={shape.id === MARKETING_STATUS_SHAPE_ID ? "polite" : undefined}
                >
                  {shape.text}
                </TextTag>
              )}
              {hasFlowArrow && <ArrowRight className={styles.flowArrow} aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      <div className={styles.heroVisual}>
        <KumoLogo
          className={styles.brandLogo}
          context={logoContext}
          label="Animated Kumo mascot"
          startupAnimation="startup"
          animationScope="app-startup"
        />
      </div>

      <div className={styles.sketchToolbar} role="toolbar" aria-label="Landing canvas tools">
        <span className={styles.toolbarLabel}>Sketch</span>
        <div className={styles.toolGroup}>
          {tools.map((tool) => {
            const ToolIcon = tool.Icon;
            return (
              <button
                key={tool.id}
                type="button"
                aria-label={`${tool.label} (${tool.shortcut})`}
                aria-pressed={activeTool === tool.id}
                title={`${tool.label} - ${tool.shortcut}`}
                onClick={() => selectTool(tool.id)}
              >
                <ToolIcon aria-hidden="true" weight={activeTool === tool.id ? "fill" : "regular"} />
              </button>
            );
          })}
        </div>
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <div className={styles.toolGroup}>
          <button
            type="button"
            aria-label="Undo drawing"
            title="Undo drawing"
            disabled={drawings.length === 0}
            onClick={() => setDrawings((current) => current.slice(0, -1))}
          >
            <ArrowCounterClockwise aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Clear drawings"
            title="Clear drawings"
            disabled={drawings.length === 0}
            onClick={() => setDrawings([])}
          >
            <Trash aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Reset canvas"
            title="Reset canvas"
            onClick={resetCanvas}
          >
            <ArrowClockwise aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarketingCanvas;
