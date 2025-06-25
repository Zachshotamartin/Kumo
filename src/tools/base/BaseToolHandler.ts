import {
  ToolHandler,
  ToolType,
  ToolConfig,
  MouseEventData,
  KeyboardEventData,
  ToolContext,
  ToolResult,
  InteractionState,
} from "../types";

/**
 * Abstract base class for all tool handlers.
 * Provides common functionality and sensible defaults.
 */
export abstract class BaseToolHandler implements ToolHandler {
  abstract readonly toolType: ToolType;
  abstract readonly config: ToolConfig;

  /**
   * Default mouse down handler. Override in subclasses for specific behavior.
   */
  onMouseDown(event: MouseEventData, context: ToolContext): ToolResult {
    return {
      handled: false,
    };
  }

  /**
   * Default mouse move handler. Override in subclasses for specific behavior.
   */
  onMouseMove(event: MouseEventData, context: ToolContext): ToolResult {
    return {
      handled: false,
    };
  }

  /**
   * Default mouse up handler. Override in subclasses for specific behavior.
   */
  onMouseUp(event: MouseEventData, context: ToolContext): ToolResult {
    return {
      handled: false,
    };
  }

  /**
   * Default double click handler. Override in subclasses for specific behavior.
   */
  onDoubleClick?(event: MouseEventData, context: ToolContext): ToolResult {
    return {
      handled: false,
    };
  }

  /**
   * Default key down handler. Override in subclasses for specific behavior.
   */
  onKeyDown?(event: KeyboardEventData, context: ToolContext): ToolResult {
    return {
      handled: false,
    };
  }

  /**
   * Default key up handler. Override in subclasses for specific behavior.
   */
  onKeyUp?(event: KeyboardEventData, context: ToolContext): ToolResult {
    return {
      handled: false,
    };
  }

  /**
   * Called when this tool becomes active. Override for initialization.
   */
  onActivate?(context: ToolContext): void {
    // Default implementation - set cursor if specified
    if (this.config.cursor) {
      context.cursorUtils.setCursor(this.config.cursor);
    }
  }

  /**
   * Called when this tool becomes inactive. Override for cleanup.
   */
  onDeactivate?(context: ToolContext): void {
    // Default implementation - reset cursor
    context.cursorUtils.resetCursor();
  }

  /**
   * Default implementation - can handle any state.
   * Override in subclasses to restrict to specific states.
   */
  canHandle(state: InteractionState): boolean {
    return true;
  }

  /**
   * Default implementation - allows all state transitions.
   * Override in subclasses to provide specific transition logic.
   */
  getValidTransitions(currentState: InteractionState): InteractionState[] {
    return Object.values(InteractionState);
  }

  /**
   * Utility method to create a successful tool result
   */
  protected success(options: Partial<ToolResult> = {}): ToolResult {
    return {
      handled: true,
      ...options,
    };
  }

  /**
   * Utility method to create a failed tool result
   */
  protected failure(options: Partial<ToolResult> = {}): ToolResult {
    return {
      handled: false,
      ...options,
    };
  }

  /**
   * Utility method to check if event should be ignored (e.g., on UI elements)
   */
  protected shouldIgnoreEvent(
    event: MouseEventData,
    context: ToolContext
  ): boolean {
    // Add logic to check if click is on UI elements like buttons, etc.
    // This would need to be implemented based on your specific UI structure
    return false;
  }

  /**
   * Utility method to calculate distance between two points
   */
  protected calculateDistance(
    point1: { x: number; y: number },
    point2: { x: number; y: number }
  ): number {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Utility method to check if two points are within a threshold
   */
  protected isWithinThreshold(
    point1: { x: number; y: number },
    point2: { x: number; y: number },
    threshold: number = 5
  ): boolean {
    return this.calculateDistance(point1, point2) <= threshold;
  }

  /**
   * Utility method to apply grid snapping if enabled
   */
  protected snapToGrid(
    point: { x: number; y: number },
    context: ToolContext
  ): { x: number; y: number } {
    if (context.gridSnapping.enabled) {
      return context.gridSnapping.snapToGrid(point);
    }
    return point;
  }

  /**
   * Utility method to check if a point is within a bounding box
   */
  protected isPointInBounds(
    point: { x: number; y: number },
    bounds: { startX: number; startY: number; endX: number; endY: number }
  ): boolean {
    return (
      point.x >= Math.min(bounds.startX, bounds.endX) &&
      point.x <= Math.max(bounds.startX, bounds.endX) &&
      point.y >= Math.min(bounds.startY, bounds.endY) &&
      point.y <= Math.max(bounds.startY, bounds.endY)
    );
  }

  /**
   * Utility method to normalize bounding box (ensure start < end)
   */
  protected normalizeBounds(bounds: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }) {
    return {
      startX: Math.min(bounds.startX, bounds.endX),
      startY: Math.min(bounds.startY, bounds.endY),
      endX: Math.max(bounds.startX, bounds.endX),
      endY: Math.max(bounds.startY, bounds.endY),
    };
  }
}
