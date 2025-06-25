import { BaseToolHandler } from "../base/BaseToolHandler";
import {
  ToolType,
  ToolConfig,
  MouseEventData,
  ToolContext,
  ToolResult,
  InteractionState,
  Point,
} from "../types";

interface CreationState {
  startPoint: Point | null;
  isCreating: boolean;
  currentShapeId: string | null;
}

export class ShapeCreationToolHandler extends BaseToolHandler {
  private shapeType: string;
  private state: CreationState = {
    startPoint: null,
    isCreating: false,
    currentShapeId: null,
  };

  constructor(shapeType: string) {
    super();
    this.shapeType = shapeType;
  }

  get toolType(): ToolType {
    return this.shapeType as ToolType;
  }

  get config(): ToolConfig {
    return {
      type: this.shapeType as ToolType,
      name: this.getShapeName(),
      description: `Create ${this.getShapeName().toLowerCase()} shapes`,
      icon: this.getShapeIcon(),
      cursor: "crosshair",
      enabled: true,
    };
  }

  onMouseDown(event: MouseEventData, context: ToolContext): ToolResult {
    // Ignore if clicking on UI elements
    if (this.shouldIgnoreEvent(event, context)) {
      return this.failure();
    }

    const { point } = event;
    const snappedPoint = this.snapToGrid(point, context);

    // Create new shape
    const newShape = context.shapeUtils.createShape(
      this.shapeType,
      snappedPoint
    );

    if (!newShape) {
      return this.failure();
    }

    this.state.startPoint = snappedPoint;
    this.state.isCreating = true;
    this.state.currentShapeId = newShape.id;

    return this.success({
      newState: InteractionState.DRAWING,
      actions: [
        {
          type: "CREATE_SHAPE",
          payload: { shape: newShape },
        },
        {
          type: "SET_SELECTION",
          payload: { shapeIds: [newShape.id] },
        },
      ],
    });
  }

  onMouseMove(event: MouseEventData, context: ToolContext): ToolResult {
    if (
      !this.state.isCreating ||
      !this.state.startPoint ||
      !this.state.currentShapeId
    ) {
      return this.failure();
    }

    const { point } = event;
    const snappedPoint = this.snapToGrid(point, context);

    // Update shape size based on drag
    const currentShape = context.shapes.find(
      (s) => s.id === this.state.currentShapeId
    );
    if (!currentShape) {
      return this.failure();
    }

    const updatedShape = {
      ...currentShape,
      x2: snappedPoint.x,
      y2: snappedPoint.y,
    };

    return this.success({
      actions: [
        {
          type: "UPDATE_SHAPE",
          payload: {
            shapeId: this.state.currentShapeId,
            updates: updatedShape,
          },
          meta: { throttle: 16 }, // 60fps
        },
      ],
    });
  }

  onMouseUp(event: MouseEventData, context: ToolContext): ToolResult {
    if (!this.state.isCreating || !this.state.currentShapeId) {
      return this.failure();
    }

    const currentShape = context.shapes.find(
      (s) => s.id === this.state.currentShapeId
    );

    // Check if shape has valid dimensions
    if (currentShape && this.isValidShape(currentShape)) {
      // Finalize shape creation
      this.resetState();

      const actions: any[] = [
        {
          type: "FINALIZE_SHAPE_CREATION",
          payload: { shapeId: this.state.currentShapeId },
        },
      ];

      // For text shapes, focus on text editing
      if (this.shapeType === "text") {
        actions.push({
          type: "START_TEXT_EDITING",
          payload: { shapeId: this.state.currentShapeId },
        });
      } else {
        // Switch back to pointer tool for other shapes
        actions.push({
          type: "SET_ACTIVE_TOOL",
          payload: { toolType: ToolType.POINTER },
        });
      }

      // Save history snapshot
      actions.push({
        type: "SAVE_HISTORY_SNAPSHOT",
      });

      return this.success({
        newState:
          this.shapeType === "text"
            ? InteractionState.IDLE
            : InteractionState.IDLE,
        actions,
      });
    } else {
      // Shape too small or invalid - remove it
      this.resetState();

      return this.success({
        newState: InteractionState.IDLE,
        actions: [
          {
            type: "REMOVE_SHAPE",
            payload: { shapeId: this.state.currentShapeId },
          },
        ],
      });
    }
  }

  onActivate(context: ToolContext): void {
    super.onActivate?.(context);

    // Clear any existing selection when activating creation tool
    context.dispatch({
      type: "CLEAR_SELECTION",
    });
  }

  canHandle(state: InteractionState): boolean {
    return [InteractionState.IDLE, InteractionState.DRAWING].includes(state);
  }

  getValidTransitions(currentState: InteractionState): InteractionState[] {
    switch (currentState) {
      case InteractionState.IDLE:
        return [InteractionState.DRAWING];
      case InteractionState.DRAWING:
        return [InteractionState.IDLE];
      default:
        return [InteractionState.IDLE];
    }
  }

  private resetState(): void {
    this.state = {
      startPoint: null,
      isCreating: false,
      currentShapeId: null,
    };
  }

  private isValidShape(shape: any): boolean {
    const minSize = 5; // Minimum size in pixels
    const width = Math.abs(shape.x2 - shape.x1);
    const height = Math.abs(shape.y2 - shape.y1);

    return width >= minSize && height >= minSize;
  }

  private getShapeName(): string {
    switch (this.shapeType) {
      case "rectangle":
        return "Rectangle";
      case "ellipse":
        return "Ellipse";
      case "text":
        return "Text";
      case "calendar":
        return "Calendar";
      case "image":
        return "Image";
      default:
        return "Shape";
    }
  }

  private getShapeIcon(): string {
    switch (this.shapeType) {
      case "rectangle":
        return "square";
      case "ellipse":
        return "circle";
      case "text":
        return "type";
      case "calendar":
        return "calendar";
      case "image":
        return "image";
      default:
        return "square";
    }
  }
}

// Factory functions for creating specific shape tools
export const createRectangleToolHandler = () =>
  new ShapeCreationToolHandler("rectangle");
export const createEllipseToolHandler = () =>
  new ShapeCreationToolHandler("ellipse");
export const createTextToolHandler = () => new ShapeCreationToolHandler("text");
export const createCalendarToolHandler = () =>
  new ShapeCreationToolHandler("calendar");
export const createImageToolHandler = () =>
  new ShapeCreationToolHandler("image");
