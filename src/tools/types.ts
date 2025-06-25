// Core Types for Tool System Architecture
export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// Event Types
export interface MouseEventData {
  point: Point;
  absolutePoint: Point;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface WheelEventData extends MouseEventData {
  deltaX: number;
  deltaY: number;
  deltaZ: number;
}

export interface KeyboardEventData {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

// Tool Types
export enum ToolType {
  POINTER = "pointer",
  RECTANGLE = "rectangle",
  ELLIPSE = "ellipse",
  TEXT = "text",
  CALENDAR = "calendar",
  IMAGE = "image",
  PAN = "pan",
  ZOOM = "zoom",
}

export enum InteractionState {
  IDLE = "idle",
  DRAWING = "drawing",
  DRAGGING = "dragging",
  RESIZING = "resizing",
  HIGHLIGHTING = "highlighting",
  MOVING = "moving",
}

export enum ResizeDirection {
  NONE = "none",
  TOP = "top",
  BOTTOM = "bottom",
  LEFT = "left",
  RIGHT = "right",
  TOP_LEFT = "topLeft",
  TOP_RIGHT = "topRight",
  BOTTOM_LEFT = "bottomLeft",
  BOTTOM_RIGHT = "bottomRight",
}

// Tool Configuration
export interface ToolConfig {
  type: ToolType;
  name: string;
  description: string;
  icon: string;
  cursor?: string;
  enabled: boolean;
  options?: Record<string, any>;
}

// Tool Handler Interface
export interface ToolHandler {
  readonly toolType: ToolType;
  readonly config: ToolConfig;

  // Event Handlers
  onMouseDown(event: MouseEventData, context: ToolContext): ToolResult;
  onMouseMove(event: MouseEventData, context: ToolContext): ToolResult;
  onMouseUp(event: MouseEventData, context: ToolContext): ToolResult;
  onDoubleClick?(event: MouseEventData, context: ToolContext): ToolResult;
  onKeyDown?(event: KeyboardEventData, context: ToolContext): ToolResult;
  onKeyUp?(event: KeyboardEventData, context: ToolContext): ToolResult;

  // Lifecycle
  onActivate?(context: ToolContext): void;
  onDeactivate?(context: ToolContext): void;

  // State
  canHandle(state: InteractionState): boolean;
  getValidTransitions(currentState: InteractionState): InteractionState[];
}

// Tool Context (dependencies injection)
export interface ToolContext {
  // State selectors
  shapes: any[];
  selectedShapes: string[];
  window: any;
  user: any;
  board: any;

  // Action dispatchers
  dispatch: (action: any) => void;

  // Utilities
  gridSnapping: {
    enabled: boolean;
    snapToGrid: (point: Point) => Point;
    getSnapDistance: () => number;
  };

  shapeUtils: {
    createShape: (type: string, point: Point) => any;
    moveShape: (shape: any, offset: Point) => any;
    resizeShape: (
      shape: any,
      bounds: BoundingBox,
      offset: Point,
      direction: ResizeDirection
    ) => any;
    findShapeAt: (point: Point) => any;
    findShapesInBounds: (bounds: BoundingBox) => any[];
    getShapeBounds: (shapes: any[]) => BoundingBox;
  };

  cursorUtils: {
    setCursor: (cursor: string) => void;
    resetCursor: () => void;
  };

  historyUtils: {
    saveSnapshot: () => void;
    undo: () => void;
    redo: () => void;
  };

  contextMenu: {
    show: (point: Point, items: ContextMenuItem[]) => void;
    hide: () => void;
  };
}

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}

// Tool Result
export interface ToolResult {
  handled: boolean;
  newState?: InteractionState;
  cursor?: string;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  actions?: ToolAction[];
}

export interface ToolAction {
  type: string;
  payload?: any;
  meta?: {
    batch?: boolean;
    skipHistory?: boolean;
    throttle?: number;
    debounce?: number;
  };
  [key: string]: any; // Index signature for Redux compatibility
}

// Tool Registry
export interface ToolRegistry {
  register(handler: ToolHandler): void;
  unregister(toolType: ToolType): void;
  getHandler(toolType: ToolType): ToolHandler | undefined;
  getAllHandlers(): ToolHandler[];
  getActiveHandler(): ToolHandler | undefined;
  setActiveHandler(toolType: ToolType): void;
}

// Event System
export interface EventBus {
  on<T = any>(event: string, handler: (data: T) => void): () => void;
  emit<T = any>(event: string, data: T): void;
  off(event: string, handler?: (data: any) => void): void;
}

// State Machine for Tool States
export interface ToolStateMachine {
  currentState: InteractionState;
  transition(event: string, data?: any): InteractionState;
  canTransition(toState: InteractionState): boolean;
  getValidTransitions(): InteractionState[];
  onStateChange(
    callback: (newState: InteractionState, oldState: InteractionState) => void
  ): void;
}

// Performance monitoring
export interface PerformanceMonitor {
  startMeasure(name: string): void;
  endMeasure(name: string): void;
  mark(name: string): void;
  getMetrics(): Record<string, number>;
}

// Configuration
export interface ToolSystemConfig {
  enablePerformanceMonitoring: boolean;
  throttleMouseMove: number;
  debounceResize: number;
  enableGridSnapping: boolean;
  gridSize: number;
  maxHistorySize: number;
  enableKeyboardShortcuts: boolean;
}
