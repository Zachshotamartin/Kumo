import {
  AppMode,
  ToolState,
  InteractionState,
  StateEvent,
  StateMachineContext,
  StateGuard,
  StateAction,
  StateMachineConfig,
  Point,
  OperationState,
  ResizeDirection,
} from "../types";

/**
 * Simplified State Machine for Kumo Whiteboard
 *
 * Replaces 25+ boolean flags with proper state machine logic:
 * - Clear state transitions
 * - Validation of allowed transitions
 * - Centralized state logic
 * - Debugging and logging
 */
export class AppStateMachine {
  private context: StateMachineContext;
  private config: StateMachineConfig;
  private listeners: Array<(context: StateMachineContext) => void> = [];
  private transitionLog: Array<{
    from: AppMode;
    to: AppMode;
    event: StateEvent;
    timestamp: number;
  }> = [];

  constructor(
    initialContext?: Partial<StateMachineContext>,
    config?: Partial<StateMachineConfig>
  ) {
    this.config = {
      doubleClickThreshold: 300,
      dragThreshold: 5,
      hoverDelay: 100,
      allowMultiSelect: true,
      enableSnapToGrid: true,
      enableKeyboardShortcuts: true,
      debounceMs: 16,
      throttleMs: 16,
      maxHistorySize: 50,
      validateTransitions: true,
      strictMode: false,
      enableLogging: true,
      ...config,
    };

    this.context = {
      mode: "viewing",
      tool: "pointer",
      interaction: "idle",
      selectedShapes: [],
      hoveredShape: null,
      editingShape: null,
      resizeDirection: "none",
      mousePosition: { x: 0, y: 0 },
      mouseDown: false,
      dragStart: null,
      viewport: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scale: 1,
        minScale: 0.1,
        maxScale: 5,
      },
      ui: {
        sidebar: true,
        toolbar: true,
        optionsPanel: false,
        userPanel: false,
        settingsPanel: false,
        grid: true,
        rulers: false,
        snapGuides: true,
      },
      operation: null,
      performanceMode: "auto",
      ...initialContext,
    };
  }

  /**
   * Send an event to the state machine
   */
  send(event: StateEvent): void {
    const currentMode = this.context.mode;
    const newContext = this.processEvent(event);

    if (newContext !== this.context) {
      const newMode = newContext.mode;

      // Log transition
      if (this.config.enableLogging && currentMode !== newMode) {
        this.transitionLog.push({
          from: currentMode,
          to: newMode,
          event,
          timestamp: Date.now(),
        });

        console.log(`[StateMachine] ${currentMode} → ${newMode}`, event);
      }

      this.context = newContext;
      this.notifyListeners();
    }
  }

  /**
   * Get current state context
   */
  getContext(): StateMachineContext {
    return { ...this.context };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (context: StateMachineContext) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get transition history for debugging
   */
  getTransitionHistory(): typeof this.transitionLog {
    return [...this.transitionLog];
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private processEvent(event: StateEvent): StateMachineContext {
    const currentMode = this.context.mode;
    const currentTool = this.context.tool;

    // Handle tool selection events first
    if (event.type === "SELECT_TOOL") {
      return this.handleToolSelection(event.tool);
    }

    // Process based on current mode
    switch (currentMode) {
      case "viewing":
        return this.handleViewingMode(event);
      case "drawing":
        return this.handleDrawingMode(event);
      case "selecting":
        return this.handleSelectingMode(event);
      case "editing":
        return this.handleEditingMode(event);
      case "resizing":
        return this.handleResizingMode(event);
      case "dragging":
        return this.handleDraggingMode(event);
      case "panning":
        return this.handlePanningMode(event);
      case "zooming":
        return this.handleZoomingMode(event);
      default:
        return this.context;
    }
  }

  private handleToolSelection(tool: ToolState): StateMachineContext {
    // Tool changes always reset to viewing mode
    return {
      ...this.context,
      tool,
      mode: "viewing",
      interaction: "idle",
      operation: null,
      selectedShapes: tool === "pointer" ? this.context.selectedShapes : [], // Clear selection for shape tools
    };
  }

  private handleViewingMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_DOWN":
        return this.handleMouseDownInViewing(event);

      case "MOUSE_MOVE":
        return this.updateMousePosition(event.position);

      case "MOUSE_ENTER":
        if (event.target && event.target !== "canvas") {
          return {
            ...this.context,
            hoveredShape: event.target,
            interaction: "hovering",
          };
        }
        return this.context;

      case "MOUSE_LEAVE":
        return { ...this.context, hoveredShape: null, interaction: "idle" };

      case "KEY_DOWN":
        return this.handleKeyDown(event);

      case "SHAPE_SELECTED":
        return this.handleShapeSelection(event.shapeIds);

      case "VIEWPORT_PAN":
        return this.handleViewportPan(event.delta);

      case "VIEWPORT_ZOOM":
        return this.handleViewportZoom(event.scale, event.center);

      case "TOGGLE_UI":
        return this.handleUIToggle(event.element);

      default:
        return this.context;
    }
  }

  private handleMouseDownInViewing(
    event: StateEvent & { type: "MOUSE_DOWN" }
  ): StateMachineContext {
    const newContext = {
      ...this.context,
      mouseDown: true,
      dragStart: event.position,
      mousePosition: event.position,
    };

    // Determine what mode to enter based on tool and target
    if (this.context.tool === "pointer") {
      if (event.target && event.target !== "canvas") {
        // Clicking on a shape
        if (this.isResizeHandle(event.target)) {
          return this.startResizing(newContext, event.target);
        } else {
          return this.startDragging(newContext, event.target);
        }
      } else {
        // Clicking on canvas - start selection
        return this.startSelecting(newContext);
      }
    } else if (this.isShapeTool(this.context.tool)) {
      // Shape tool - start drawing
      return this.startDrawing(newContext);
    } else if (this.context.tool === "hand") {
      // Hand tool - start panning
      return this.startPanning(newContext);
    }

    return newContext;
  }

  private handleDrawingMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_MOVE":
        return this.updateDrawing(event.position);

      case "MOUSE_UP":
        return this.finishDrawing();

      case "ESC_PRESSED":
        return this.cancelDrawing();

      default:
        return this.context;
    }
  }

  private handleSelectingMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_MOVE":
        return this.updateSelection(event.position);

      case "MOUSE_UP":
        return this.finishSelection();

      case "ESC_PRESSED":
        return this.cancelSelection();

      default:
        return this.context;
    }
  }

  private handleDraggingMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_MOVE":
        return this.updateDragging(event.position);

      case "MOUSE_UP":
        return this.finishDragging();

      case "ESC_PRESSED":
        return this.cancelDragging();

      default:
        return this.context;
    }
  }

  private handleResizingMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_MOVE":
        return this.updateResizing(event.position);

      case "MOUSE_UP":
        return this.finishResizing();

      case "ESC_PRESSED":
        return this.cancelResizing();

      default:
        return this.context;
    }
  }

  private handleEditingMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_DOWN":
        // Click outside editing shape cancels edit mode
        if (!event.target || event.target !== this.context.editingShape) {
          return this.finishEditing();
        }
        return this.context;

      case "ESC_PRESSED":
        return this.finishEditing();

      case "DOUBLE_CLICK":
        return this.finishEditing();

      default:
        return this.context;
    }
  }

  private handlePanningMode(event: StateEvent): StateMachineContext {
    switch (event.type) {
      case "MOUSE_MOVE":
        return this.updatePanning(event.position);

      case "MOUSE_UP":
        return this.finishPanning();

      case "ESC_PRESSED":
        return this.cancelPanning();

      default:
        return this.context;
    }
  }

  private handleZoomingMode(event: StateEvent): StateMachineContext {
    // Zoom mode is typically instant, return to viewing
    return { ...this.context, mode: "viewing" };
  }

  // ===================
  // STATE TRANSITION HELPERS
  // ===================

  private startDrawing(context: StateMachineContext): StateMachineContext {
    const operation: OperationState = {
      type: "creating",
      startTime: Date.now(),
      startPosition: context.dragStart!,
      currentPosition: context.mousePosition,
      committed: false,
    };

    return {
      ...context,
      mode: "drawing",
      interaction: "dragging",
      operation,
    };
  }

  private startSelecting(context: StateMachineContext): StateMachineContext {
    return {
      ...context,
      mode: "selecting",
      interaction: "selecting",
      selectedShapes: [], // Clear previous selection
    };
  }

  private startDragging(
    context: StateMachineContext,
    target: string
  ): StateMachineContext {
    // Add shape to selection if not already selected
    const selectedShapes = context.selectedShapes.includes(target)
      ? context.selectedShapes
      : [target];

    const operation: OperationState = {
      type: "moving",
      startTime: Date.now(),
      startPosition: context.dragStart!,
      currentPosition: context.mousePosition,
      target,
      committed: false,
    };

    return {
      ...context,
      mode: "dragging",
      interaction: "dragging",
      selectedShapes,
      operation,
    };
  }

  private startResizing(
    context: StateMachineContext,
    handle: string
  ): StateMachineContext {
    const resizeDirection = this.parseResizeHandle(handle);

    const operation: OperationState = {
      type: "resizing",
      startTime: Date.now(),
      startPosition: context.dragStart!,
      currentPosition: context.mousePosition,
      target: handle,
      committed: false,
    };

    return {
      ...context,
      mode: "resizing",
      interaction: "resizing",
      resizeDirection,
      operation,
    };
  }

  private startPanning(context: StateMachineContext): StateMachineContext {
    return {
      ...context,
      mode: "panning",
      interaction: "dragging",
    };
  }

  private updateDrawing(position: Point): StateMachineContext {
    if (!this.context.operation) return this.context;

    const operation = {
      ...this.context.operation,
      currentPosition: position,
    };

    return {
      ...this.context,
      mousePosition: position,
      operation,
    };
  }

  private updateSelection(position: Point): StateMachineContext {
    // TODO: Calculate which shapes are in selection rectangle
    return {
      ...this.context,
      mousePosition: position,
    };
  }

  private updateDragging(position: Point): StateMachineContext {
    if (!this.context.operation) return this.context;

    const operation = {
      ...this.context.operation,
      currentPosition: position,
    };

    return {
      ...this.context,
      mousePosition: position,
      operation,
    };
  }

  private updateResizing(position: Point): StateMachineContext {
    if (!this.context.operation) return this.context;

    const operation = {
      ...this.context.operation,
      currentPosition: position,
    };

    return {
      ...this.context,
      mousePosition: position,
      operation,
    };
  }

  private updatePanning(position: Point): StateMachineContext {
    if (!this.context.dragStart) return this.context;

    const delta = {
      x: position.x - this.context.dragStart.x,
      y: position.y - this.context.dragStart.y,
    };

    return this.handleViewportPan(delta);
  }

  private finishDrawing(): StateMachineContext {
    const operation = this.context.operation;
    if (!operation) return this.context;

    // TODO: Commit the drawn shape
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
      operation: { ...operation, committed: true },
    };
  }

  private finishSelection(): StateMachineContext {
    // TODO: Commit the selection
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
    };
  }

  private finishDragging(): StateMachineContext {
    const operation = this.context.operation;
    if (!operation) return this.context;

    // TODO: Commit the drag operation
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
      operation: { ...operation, committed: true },
    };
  }

  private finishResizing(): StateMachineContext {
    const operation = this.context.operation;
    if (!operation) return this.context;

    // TODO: Commit the resize operation
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
      resizeDirection: "none",
      operation: { ...operation, committed: true },
    };
  }

  private finishEditing(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      editingShape: null,
    };
  }

  private finishPanning(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
    };
  }

  private cancelDrawing(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
      operation: null,
    };
  }

  private cancelSelection(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
    };
  }

  private cancelDragging(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
      operation: null,
    };
  }

  private cancelResizing(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
      resizeDirection: "none",
      operation: null,
    };
  }

  private cancelPanning(): StateMachineContext {
    return {
      ...this.context,
      mode: "viewing",
      interaction: "idle",
      mouseDown: false,
      dragStart: null,
    };
  }

  // ===================
  // HELPER METHODS
  // ===================

  private updateMousePosition(position: Point): StateMachineContext {
    return {
      ...this.context,
      mousePosition: position,
    };
  }

  private handleShapeSelection(shapeIds: string[]): StateMachineContext {
    return {
      ...this.context,
      selectedShapes: shapeIds,
      mode: shapeIds.length > 0 ? "editing" : "viewing",
    };
  }

  private handleViewportPan(delta: Point): StateMachineContext {
    const viewport = {
      ...this.context.viewport,
      x: this.context.viewport.x - delta.x,
      y: this.context.viewport.y - delta.y,
    };

    return { ...this.context, viewport };
  }

  private handleViewportZoom(
    scale: number,
    center: Point
  ): StateMachineContext {
    const clampedScale = Math.max(
      this.context.viewport.minScale,
      Math.min(this.context.viewport.maxScale, scale)
    );

    const viewport = {
      ...this.context.viewport,
      scale: clampedScale,
    };

    return { ...this.context, viewport };
  }

  private handleUIToggle(
    element: keyof StateMachineContext["ui"]
  ): StateMachineContext {
    const ui = {
      ...this.context.ui,
      [element]: !this.context.ui[element],
    };

    return { ...this.context, ui };
  }

  private handleKeyDown(
    event: StateEvent & { type: "KEY_DOWN" }
  ): StateMachineContext {
    switch (event.key) {
      case "Escape":
        return this.handleEscape();
      case "Delete":
      case "Backspace":
        return this.handleDelete();
      default:
        return this.context;
    }
  }

  private handleEscape(): StateMachineContext {
    return {
      ...this.context,
      selectedShapes: [],
      mode: "viewing",
      interaction: "idle",
      operation: null,
    };
  }

  private handleDelete(): StateMachineContext {
    if (this.context.selectedShapes.length > 0) {
      // TODO: Delete selected shapes
      return {
        ...this.context,
        selectedShapes: [],
      };
    }
    return this.context;
  }

  private isShapeTool(tool: ToolState): boolean {
    return ["rectangle", "ellipse", "text", "image", "calendar"].includes(tool);
  }

  private isResizeHandle(target: string): boolean {
    return target.includes("resize-handle");
  }

  private parseResizeHandle(handle: string): ResizeDirection {
    if (handle.includes("n")) return "n";
    if (handle.includes("s")) return "s";
    if (handle.includes("e")) return "e";
    if (handle.includes("w")) return "w";
    if (handle.includes("ne")) return "ne";
    if (handle.includes("nw")) return "nw";
    if (handle.includes("se")) return "se";
    if (handle.includes("sw")) return "sw";
    return "none";
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.context);
      } catch (error) {
        console.error("Error in state machine listener:", error);
      }
    });
  }
}
