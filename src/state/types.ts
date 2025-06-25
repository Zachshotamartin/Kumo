// Simplified State Management Types for Kumo Whiteboard

// ===================
// APPLICATION STATES
// ===================

/**
 * Main application state machine states
 */
export type AppMode =
  | "viewing" // Default viewing mode
  | "drawing" // Creating new shapes
  | "selecting" // Multi-selecting shapes
  | "editing" // Editing selected shapes
  | "resizing" // Resizing shapes
  | "dragging" // Moving shapes
  | "panning" // Panning the viewport
  | "zooming"; // Zooming the viewport

/**
 * Tool states - represents which tool is active
 */
export type ToolState =
  | "pointer"
  | "rectangle"
  | "ellipse"
  | "text"
  | "image"
  | "calendar"
  | "component"
  | "eraser"
  | "hand";

/**
 * Interaction states - represents current user interaction
 */
export type InteractionState =
  | "idle"
  | "hovering"
  | "pressing"
  | "dragging"
  | "resizing"
  | "rotating"
  | "selecting";

/**
 * Resize direction for shape manipulation
 */
export type ResizeDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw"
  | "none";

/**
 * UI visibility states
 */
export interface UIVisibility {
  sidebar: boolean;
  toolbar: boolean;
  optionsPanel: boolean;
  userPanel: boolean;
  settingsPanel: boolean;
  grid: boolean;
  rulers: boolean;
  snapGuides: boolean;
}

// ===================
// STATE MACHINE EVENTS
// ===================

/**
 * Events that can trigger state transitions
 */
export type StateEvent =
  // Tool selection events
  | { type: "SELECT_TOOL"; tool: ToolState }
  | { type: "TOOL_ACTIVATED" }
  | { type: "TOOL_DEACTIVATED" }

  // Mouse/touch events
  | { type: "MOUSE_DOWN"; position: Point; target?: string }
  | { type: "MOUSE_MOVE"; position: Point; delta: Point }
  | { type: "MOUSE_UP"; position: Point }
  | { type: "MOUSE_ENTER"; target: string }
  | { type: "MOUSE_LEAVE"; target: string }
  | { type: "DOUBLE_CLICK"; position: Point }

  // Keyboard events
  | { type: "KEY_DOWN"; key: string; modifiers: KeyModifiers }
  | { type: "KEY_UP"; key: string }
  | { type: "ESC_PRESSED" }
  | { type: "DELETE_PRESSED" }

  // Shape events
  | { type: "SHAPE_SELECTED"; shapeIds: string[] }
  | { type: "SHAPE_DESELECTED" }
  | { type: "SHAPE_CREATED"; shape: any }
  | { type: "SHAPE_UPDATED"; shapeId: string; updates: any }
  | { type: "SHAPE_DELETED"; shapeIds: string[] }

  // Viewport events
  | { type: "VIEWPORT_PAN"; delta: Point }
  | { type: "VIEWPORT_ZOOM"; scale: number; center: Point }
  | { type: "VIEWPORT_RESET" }

  // UI events
  | { type: "TOGGLE_UI"; element: keyof UIVisibility }
  | { type: "OPEN_SETTINGS" }
  | { type: "CLOSE_SETTINGS" }

  // Collaboration events
  | { type: "USER_JOINED"; user: User }
  | { type: "USER_LEFT"; userId: string }
  | { type: "CURSOR_MOVED"; userId: string; position: Point };

/**
 * State machine context (shared data across states)
 */
export interface StateMachineContext {
  // Current state information
  mode: AppMode;
  tool: ToolState;
  interaction: InteractionState;

  // Selection and manipulation
  selectedShapes: string[];
  hoveredShape: string | null;
  editingShape: string | null;
  resizeDirection: ResizeDirection;

  // Mouse/touch state
  mousePosition: Point;
  mouseDown: boolean;
  dragStart: Point | null;

  // Viewport state
  viewport: ViewportState;

  // UI state
  ui: UIVisibility;

  // Temporary operation state
  operation: OperationState | null;

  // Performance mode
  performanceMode: "auto" | "high" | "balanced" | "compatibility";
}

// ===================
// SUPPORTING TYPES
// ===================

export interface Point {
  x: number;
  y: number;
}

export interface KeyModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export interface ViewportState {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  minScale: number;
  maxScale: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  cursor?: Point;
  isActive: boolean;
}

/**
 * Represents an ongoing operation (creation, editing, etc.)
 */
export interface OperationState {
  type: "creating" | "editing" | "resizing" | "moving" | "rotating";
  startTime: number;
  startPosition: Point;
  currentPosition: Point;
  target?: string;
  preview?: any;
  committed: boolean;
}

// ===================
// STATE MACHINE GUARDS
// ===================

/**
 * Guard conditions for state transitions
 */
export type StateGuard =
  | "canStartDrawing"
  | "canStartSelecting"
  | "canStartResizing"
  | "canStartDragging"
  | "hasSelection"
  | "hasHoveredShape"
  | "isOverShape"
  | "isOverResizeHandle"
  | "isOverCanvas"
  | "hasModifierKey"
  | "isValidTool";

// ===================
// ACTION TYPES
// ===================

/**
 * Actions that can be performed during state transitions
 */
export type StateAction =
  | "startOperation"
  | "updateOperation"
  | "commitOperation"
  | "cancelOperation"
  | "selectShape"
  | "deselectShapes"
  | "updateSelection"
  | "updateCursor"
  | "updateViewport"
  | "showUI"
  | "hideUI"
  | "setTool"
  | "recordHistory"
  | "playSound"
  | "showNotification";

// ===================
// SIMPLIFIED STORE STRUCTURE
// ===================

/**
 * Simplified Redux store structure
 */
export interface AppState {
  // Core application state machine
  app: StateMachineContext;

  // Data domains (simplified from multiple slices)
  whiteboard: WhiteboardState;
  auth: AuthState;
  collaboration: CollaborationState;
  performance: PerformanceState;

  // Derived/computed state (selectors)
  computed: ComputedState;
}

export interface WhiteboardState {
  id: string;
  title: string;
  description: string;
  shapes: any[];
  background: {
    color: string;
    image?: string;
    pattern?: string;
  };
  settings: {
    snapToGrid: boolean;
    gridSize: number;
    showRulers: boolean;
    autoSave: boolean;
  };
  history: {
    past: any[][];
    present: any[];
    future: any[][];
    maxHistorySize: number;
  };
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  permissions: string[];
  boards: {
    owned: BoardInfo[];
    shared: BoardInfo[];
    public: BoardInfo[];
  };
}

export interface BoardInfo {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  lastModified: Date;
  collaborators: User[];
  isPublic: boolean;
}

export interface CollaborationState {
  users: User[];
  cursors: Map<string, Point>;
  isConnected: boolean;
  latency: number;
  conflictResolution: "last-write-wins" | "operational-transform";
}

export interface PerformanceState {
  fps: number;
  memoryUsage: number;
  renderTime: number;
  shapesVisible: number;
  shapesTotal: number;
  cullingEnabled: boolean;
  lodEnabled: boolean;
  warnings: string[];
}

export interface ComputedState {
  // Computed from current state
  canUndo: boolean;
  canRedo: boolean;
  selectionBounds: BoundingBox | null;
  visibleShapes: string[];

  // Performance computed state
  shouldUseLOD: boolean;
  shouldCull: boolean;
  recommendedBatchSize: number;

  // UI computed state
  activeResizeHandles: ResizeDirection[];
  snapPoints: Point[];

  // Collaboration computed state
  otherCursors: Array<{ user: User; position: Point }>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ===================
// STATE MACHINE CONFIGURATION
// ===================

/**
 * Configuration for state machine behavior
 */
export interface StateMachineConfig {
  // Timing configuration
  doubleClickThreshold: number;
  dragThreshold: number;
  hoverDelay: number;

  // Behavior configuration
  allowMultiSelect: boolean;
  enableSnapToGrid: boolean;
  enableKeyboardShortcuts: boolean;

  // Performance configuration
  debounceMs: number;
  throttleMs: number;
  maxHistorySize: number;

  // Validation configuration
  validateTransitions: boolean;
  strictMode: boolean;
  enableLogging: boolean;
}

// ===================
// MIGRATION TYPES
// ===================

/**
 * Types for migrating from the old Redux structure
 */
export interface LegacyStateMapping {
  // Maps old action flags to new state machine states
  actionFlagsToModes: Record<string, AppMode>;
  actionFlagsToInteractions: Record<string, InteractionState>;

  // Maps old slice state to new consolidated state
  sliceMapping: {
    actions: keyof AppState;
    selected: keyof AppState;
    window: keyof AppState;
    hide: keyof AppState;
  };
}

/**
 * Migration utilities
 */
export interface StateMigration {
  version: string;
  migrate: (oldState: any) => AppState;
  validate: (state: AppState) => boolean;
}

// ===================
// EVENT SYSTEM
// ===================

/**
 * Event system for decoupled communication
 */
export interface StateEventBus {
  emit<T = any>(event: string, data: T): void;
  on<T = any>(event: string, handler: (data: T) => void): () => void;
  off(event: string, handler: Function): void;
  once<T = any>(event: string, handler: (data: T) => void): void;
}

/**
 * Middleware for Redux state machine integration
 */
export interface StateMachineMiddleware {
  onStateChange: (oldState: AppState, newState: AppState, action: any) => void;
  onTransition: (from: AppMode, to: AppMode, event: StateEvent) => void;
  onError: (error: Error, context: StateMachineContext) => void;
}
