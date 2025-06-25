import { BaseToolHandler } from "../base/BaseToolHandler";
import {
  ToolType,
  ToolConfig,
  MouseEventData,
  ToolContext,
  ToolResult,
  InteractionState,
  ResizeDirection,
  Point,
  BoundingBox,
} from "../types";
import { ResizeHandleDetection } from "../../utils/ResizeHandleDetection";

interface PointerState {
  startPoint: Point | null;
  isDragging: boolean;
  isResizing: boolean;
  resizeDirection: ResizeDirection;
  dragOffset: Point | null;
  selectedShapesOnStart: string[];
}

export class PointerToolHandler extends BaseToolHandler {
  readonly toolType = ToolType.POINTER;
  readonly config: ToolConfig = {
    type: ToolType.POINTER,
    name: "Pointer",
    description: "Select, move, and resize shapes",
    icon: "cursor-pointer",
    cursor: "default",
    enabled: true,
  };

  private state: PointerState = {
    startPoint: null,
    isDragging: false,
    isResizing: false,
    resizeDirection: ResizeDirection.NONE,
    dragOffset: null,
    selectedShapesOnStart: [],
  };

  onMouseDown(event: MouseEventData, context: ToolContext): ToolResult {
    // Ignore if clicking on UI elements
    if (this.shouldIgnoreEvent(event, context)) {
      return this.failure();
    }

    // Hide context menu if visible
    context.contextMenu.hide();

    const { point } = event;
    this.state.startPoint = point;
    this.state.selectedShapesOnStart = [...context.selectedShapes];

    // Find shape at cursor position
    const shapeUnderCursor = context.shapeUtils.findShapeAt(point);

    if (context.selectedShapes.length > 0) {
      const selectionBounds = context.shapeUtils.getShapeBounds(
        context.shapes.filter((shape) =>
          context.selectedShapes.includes(shape.id)
        )
      );

      // Check if clicking outside selection
      if (!this.isPointInBounds(point, selectionBounds)) {
        if (!event.shiftKey) {
          // Clear selection and potentially start new selection
          return this.success({
            newState: InteractionState.HIGHLIGHTING,
            actions: [
              {
                type: "CLEAR_SELECTION",
              },
              {
                type: "START_HIGHLIGHT",
                payload: { startPoint: point },
              },
            ],
          });
        }
      } else {
        // Check for resize handles using the improved detection utility
        const resizeResult = ResizeHandleDetection.getResizeDirection(
          point,
          selectionBounds,
          context.window
        );

        if (resizeResult.isResize) {
          this.state.isResizing = true;
          this.state.resizeDirection = resizeResult.direction;
          this.state.isDragging = true;

          return this.success({
            newState: InteractionState.RESIZING,
            cursor: resizeResult.cursor,
            actions: [
              {
                type: "START_RESIZE",
                payload: { direction: resizeResult.direction },
              },
            ],
          });
        } else {
          // Start moving selected shapes
          this.state.isDragging = true;
          this.state.dragOffset = { x: 0, y: 0 };

          return this.success({
            newState: InteractionState.MOVING,
            cursor: "move",
            actions: [
              {
                type: "START_MOVE",
              },
            ],
          });
        }
      }
    }

    // Handle shape selection
    if (shapeUnderCursor) {
      if (
        event.shiftKey &&
        context.selectedShapes.includes(shapeUnderCursor.id)
      ) {
        // Remove from selection
        return this.success({
          actions: [
            {
              type: "REMOVE_FROM_SELECTION",
              payload: { shapeId: shapeUnderCursor.id },
            },
          ],
        });
      } else if (event.shiftKey) {
        // Add to selection
        return this.success({
          actions: [
            {
              type: "ADD_TO_SELECTION",
              payload: { shapeId: shapeUnderCursor.id },
            },
          ],
        });
      } else {
        // Select shape and prepare for potential drag
        this.state.isDragging = true;
        this.state.dragOffset = { x: 0, y: 0 };

        return this.success({
          newState: InteractionState.MOVING,
          cursor: "move",
          actions: [
            {
              type: "SET_SELECTION",
              payload: { shapeIds: [shapeUnderCursor.id] },
            },
          ],
        });
      }
    } else {
      // No shape under cursor - start highlighting
      return this.success({
        newState: InteractionState.HIGHLIGHTING,
        actions: [
          {
            type: "CLEAR_SELECTION",
          },
          {
            type: "START_HIGHLIGHT",
            payload: { startPoint: point },
          },
        ],
      });
    }
  }

  onMouseMove(event: MouseEventData, context: ToolContext): ToolResult {
    const { point } = event;

    if (!this.state.startPoint) {
      // Just hovering - update cursor based on what's under cursor
      return this.updateHoverCursor(point, context);
    }

    const offset = {
      x: point.x - this.state.startPoint.x,
      y: point.y - this.state.startPoint.y,
    };

    if (this.state.isResizing) {
      return this.handleResize(offset, context);
    } else if (this.state.isDragging && context.selectedShapes.length > 0) {
      return this.handleMove(offset, context);
    } else {
      // Highlighting/selection box
      return this.success({
        actions: [
          {
            type: "UPDATE_HIGHLIGHT",
            payload: { endPoint: point },
          },
        ],
      });
    }
  }

  onMouseUp(event: MouseEventData, context: ToolContext): ToolResult {
    const wasResizing = this.state.isResizing;
    const wasDragging = this.state.isDragging;

    // Reset state
    this.resetState();

    const actions: any[] = [];

    if (wasResizing) {
      actions.push({ type: "END_RESIZE" });
    } else if (wasDragging) {
      actions.push({ type: "END_MOVE" });
    } else {
      // End highlighting
      actions.push({ type: "END_HIGHLIGHT" });
    }

    // Save state for undo
    actions.push({
      type: "SAVE_HISTORY_SNAPSHOT",
      meta: { skipHistory: wasResizing || wasDragging },
    });

    return this.success({
      newState: InteractionState.IDLE,
      cursor: "default",
      actions,
    });
  }

  onDoubleClick(event: MouseEventData, context: ToolContext): ToolResult {
    const { point } = event;
    const shape = context.shapeUtils.findShapeAt(point);

    if (shape?.boardId) {
      // Navigate to nested board
      return this.success({
        actions: [
          {
            type: "NAVIGATE_TO_BOARD",
            payload: { boardId: shape.boardId },
          },
        ],
      });
    }

    return this.failure();
  }

  canHandle(state: InteractionState): boolean {
    return [
      InteractionState.IDLE,
      InteractionState.HIGHLIGHTING,
      InteractionState.MOVING,
      InteractionState.RESIZING,
    ].includes(state);
  }

  getValidTransitions(currentState: InteractionState): InteractionState[] {
    switch (currentState) {
      case InteractionState.IDLE:
        return [
          InteractionState.HIGHLIGHTING,
          InteractionState.MOVING,
          InteractionState.RESIZING,
        ];
      case InteractionState.HIGHLIGHTING:
        return [InteractionState.IDLE];
      case InteractionState.MOVING:
        return [InteractionState.IDLE];
      case InteractionState.RESIZING:
        return [InteractionState.IDLE];
      default:
        return [InteractionState.IDLE];
    }
  }

  private resetState(): void {
    this.state = {
      startPoint: null,
      isDragging: false,
      isResizing: false,
      resizeDirection: ResizeDirection.NONE,
      dragOffset: null,
      selectedShapesOnStart: [],
    };
  }

  private updateHoverCursor(point: Point, context: ToolContext): ToolResult {
    if (context.selectedShapes.length > 0) {
      const selectionBounds = context.shapeUtils.getShapeBounds(
        context.shapes.filter((shape) =>
          context.selectedShapes.includes(shape.id)
        )
      );

      if (this.isPointInBounds(point, selectionBounds)) {
        // Use ResizeHandleDetection for consistent cursor behavior
        const resizeResult = ResizeHandleDetection.getResizeDirection(
          point,
          selectionBounds,
          context.window
        );

        return this.success({ cursor: resizeResult.cursor });
      }
    }

    const shapeUnderCursor = context.shapeUtils.findShapeAt(point);
    const cursor = shapeUnderCursor ? "pointer" : "default";

    return this.success({ cursor });
  }

  private handleMove(offset: Point, context: ToolContext): ToolResult {
    const snappedOffset = context.gridSnapping.enabled
      ? this.snapOffsetToGrid(offset, context)
      : offset;

    return this.success({
      actions: [
        {
          type: "MOVE_SHAPES",
          payload: {
            shapeIds: context.selectedShapes,
            offset: snappedOffset,
          },
          meta: { throttle: 16 }, // 60fps
        },
      ],
    });
  }

  private handleResize(offset: Point, context: ToolContext): ToolResult {
    const snappedOffset = context.gridSnapping.enabled
      ? this.snapOffsetToGrid(offset, context)
      : offset;

    return this.success({
      actions: [
        {
          type: "RESIZE_SHAPES",
          payload: {
            shapeIds: context.selectedShapes,
            offset: snappedOffset,
            direction: this.state.resizeDirection,
          },
          meta: { throttle: 16 }, // 60fps
        },
      ],
    });
  }

  private snapOffsetToGrid(offset: Point, context: ToolContext): Point {
    if (!context.gridSnapping.enabled) {
      return offset;
    }

    const gridSize = context.gridSnapping.getSnapDistance();
    return {
      x: Math.round(offset.x / gridSize) * gridSize,
      y: Math.round(offset.y / gridSize) * gridSize,
    };
  }
}
