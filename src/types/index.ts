/**
 * Comprehensive Type Definitions for Kumo Whiteboard
 *
 * This file provides complete type safety for the entire application,
 * replacing all 'any' types with proper TypeScript definitions.
 */

// ===================
// CORE GEOMETRIC TYPES
// ===================

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface Transform {
  rotation: number;
  scaleX: number;
  scaleY: number;
}

// ===================
// SHAPE TYPES
// ===================

export type ShapeType =
  | "rectangle"
  | "ellipse"
  | "text"
  | "line"
  | "arrow"
  | "image"
  | "component"
  | "pen"
  | "highlighter";

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  lineDash?: number[];
}

export interface BaseShape {
  id: string;
  type: ShapeType;
  bounds: ShapeBounds;
  transform?: Transform;
  style: ShapeStyle;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface TextShape extends BaseShape {
  type: "text";
  text: string;
  editing: boolean;
}

export interface ImageShape extends BaseShape {
  type: "image";
  src: string;
  alt?: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface ComponentShape extends BaseShape {
  type: "component";
  shapes: KumoShape[];
  name: string;
  description?: string;
}

export interface PenShape extends BaseShape {
  type: "pen" | "highlighter";
  points: Point[];
  pressure?: number[];
}

export type KumoShape =
  | BaseShape
  | TextShape
  | ImageShape
  | ComponentShape
  | PenShape;

// ===================
// BOARD TYPES
// ===================

export interface BoardInfo {
  id: string;
  title: string;
  uid: string;
  description?: string;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  collaborators: string[];
  settings: BoardSettings;
}

export interface BoardSettings {
  gridSize: number;
  gridVisible: boolean;
  gridSnapping: boolean;
  background: string;
  width: number;
  height: number;
  zoom: number;
  maxZoom: number;
  minZoom: number;
}

export interface Board {
  info: BoardInfo;
  shapes: KumoShape[];
  version: number;
  checksum?: string;
}

// ===================
// USER TYPES
// ===================

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  preferences: UserPreferences;
  permissions: UserPermission[];
  cursor?: Point;
  isActive: boolean;
  lastSeen: number;
}

export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  gridVisible: boolean;
  gridSnapping: boolean;
  autoSave: boolean;
  shortcuts: Record<string, string>;
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  collaboration: boolean;
  mentions: boolean;
  updates: boolean;
  marketing: boolean;
}

export type UserPermission =
  | "read"
  | "write"
  | "admin"
  | "share"
  | "comment"
  | "export";

// ===================
// TOOL TYPES
// ===================

export type ToolType =
  | "select"
  | "pen"
  | "highlighter"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "image"
  | "eraser"
  | "hand";

export interface ToolState {
  type: ToolType;
  isActive: boolean;
  options: ToolOptions;
}

export interface ToolOptions {
  // Pen/Highlighter options
  brushSize?: number;
  pressure?: boolean;

  // Shape options
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string;

  // Text options
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";

  // Line options
  arrowStart?: boolean;
  arrowEnd?: boolean;
  lineDash?: number[];
}

// ===================
// INTERACTION TYPES
// ===================

export type InteractionState =
  | "idle"
  | "hovering"
  | "pressing"
  | "dragging"
  | "resizing"
  | "rotating"
  | "drawing"
  | "selecting";

export type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export interface SelectionState {
  selectedShapes: string[];
  hoveredShape: string | null;
  selectionBounds: BoundingBox | null;
  isMultiSelect: boolean;
  borderStartX?: number;
  borderStartY?: number;
  borderEndX?: number;
  borderEndY?: number;
}

// ===================
// VIEWPORT TYPES
// ===================

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  rotation: number;
}

export interface WindowState {
  width: number;
  height: number;
  scale: number;
  orientation: "portrait" | "landscape";
  isFullscreen: boolean;
  deviceType: "mobile" | "tablet" | "desktop";
}

// ===================
// HISTORY TYPES
// ===================

export interface HistoryState {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
  maxSize: number;
}

export interface HistoryEntry {
  shapes: KumoShape[];
  timestamp: number;
  action: string;
  description: string;
}

// ===================
// ACTIONS TYPES
// ===================

export interface ActionState {
  // Drawing states
  drawing: boolean;
  dragging: boolean;
  resizing: boolean;
  rotating: boolean;

  // UI states
  sharing: boolean;
  deleting: boolean;
  exporting: boolean;
  importing: boolean;

  // Search and filter
  searchTerm: string;
  filterType: ShapeType | "all";

  // Performance
  isPerformanceMode: boolean;
  renderQuality: "high" | "medium" | "low";
}

// ===================
// UI TYPES
// ===================

export interface SideBarState {
  hideOptions: boolean;
  hideTools: boolean;
  hideHistory: boolean;
  width: number;
  collapsed: boolean;
}

export interface UIVisibility {
  toolbar: boolean;
  sidebar: boolean;
  contextMenu: boolean;
  inspector: boolean;
  minimap: boolean;
  grid: boolean;
  rulers: boolean;
  statusBar: boolean;
}

// ===================
// COLLABORATION TYPES
// ===================

export interface CollaborationState {
  isConnected: boolean;
  users: User[];
  cursors: Record<string, Point>;
  latency: number;
  conflictResolution: "last-write-wins" | "operational-transform";
  pendingOperations: CollaborationOperation[];
}

export interface CollaborationOperation {
  id: string;
  type: "create" | "update" | "delete" | "move" | "style";
  shapeId: string;
  data: any;
  userId: string;
  timestamp: number;
  acknowledged: boolean;
}

// ===================
// PERFORMANCE TYPES
// ===================

export interface PerformanceState {
  fps: number;
  memoryUsage: number;
  renderTime: number;
  shapesVisible: number;
  shapesTotal: number;
  cullingEnabled: boolean;
  lodEnabled: boolean;
  warnings: string[];
  profile: PerformanceProfile;
}

export type PerformanceProfile =
  | "high-performance"
  | "balanced"
  | "battery-saver"
  | "compatibility";

// ===================
// COMPLETE APPLICATION STATE
// ===================

export interface RootState {
  // Legacy Redux slices (for migration compatibility)
  auth: AuthSliceState;
  whiteBoard: WhiteBoardSliceState;
  window: WindowSliceState;
  sideBar: SideBarSliceState;
  boards: BoardsSliceState;
  actions: ActionsSliceState;
  selected: SelectedSliceState;
  boardImages: BoardImagesSliceState;
  shapeHistory: ShapeHistorySliceState;
}

// Legacy slice state types for migration
export interface AuthSliceState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  permissions: UserPermission[];
}

export interface WhiteBoardSliceState {
  board: BoardInfo | null;
  shapes: KumoShape[];
  loading: boolean;
  error: string | null;
  lastSaved: number;
}

export interface WindowSliceState extends WindowState {
  scrollX: number;
  scrollY: number;
  centerX: number;
  centerY: number;
}

export interface SideBarSliceState extends SideBarState {
  activeTab: string;
  minimized: boolean;
}

export interface BoardsSliceState {
  privateBoards: BoardInfo[];
  publicBoards: BoardInfo[];
  sharedBoards: BoardInfo[];
  searchableBoards: BoardInfo[];
  resultsBoards: BoardInfo[];
  loading: boolean;
  error: string | null;
}

export interface ActionsSliceState extends ActionState {
  lastAction: string;
  pendingActions: string[];
}

export interface SelectedSliceState extends SelectionState {
  selectedTool: ToolType;
  toolOptions: ToolOptions;
  clipboard: KumoShape[];
}

export interface BoardImagesSliceState {
  boardImages: Array<{
    id: string;
    url: string;
    thumbnail?: string;
    width: number;
    height: number;
  }>;
  loading: boolean;
  error: string | null;
}

export interface ShapeHistorySliceState {
  history: KumoShape[][];
  currentIndex: number;
  maxSize: number;
}

// ===================
// EVENT TYPES
// ===================

export interface MouseEventData {
  point: Point;
  button: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  pressure?: number;
  timestamp: number;
}

export interface KeyboardEventData {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  timestamp: number;
}

export interface TouchEventData {
  touches: Touch[];
  changedTouches: Touch[];
  targetTouches: Touch[];
  timestamp: number;
}

// ===================
// API TYPES
// ===================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
}

// ===================
// UTILITY TYPES
// ===================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export type EventHandler<T = any> = (event: T) => void;

export type AsyncEventHandler<T = any> = (event: T) => Promise<void>;

// ===================
// COMPONENT PROP TYPES
// ===================

export interface ShapeComponentProps {
  shape: KumoShape;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter?: EventHandler<MouseEventData>;
  onMouseLeave?: EventHandler<MouseEventData>;
  onMouseDown?: EventHandler<MouseEventData>;
  onMouseUp?: EventHandler<MouseEventData>;
  onClick?: EventHandler<MouseEventData>;
  onDoubleClick?: EventHandler<MouseEventData>;
}

export interface ToolComponentProps {
  tool: ToolState;
  isActive: boolean;
  onSelect: EventHandler<ToolType>;
  onOptionsChange: EventHandler<ToolOptions>;
}

export interface BoardComponentProps {
  board: Board;
  readonly?: boolean;
  onShapeCreate?: EventHandler<KumoShape>;
  onShapeUpdate?: EventHandler<KumoShape>;
  onShapeDelete?: EventHandler<string>;
  onSelectionChange?: EventHandler<string[]>;
}

// ===================
// CONTEXT TYPES
// ===================

export interface AppContext {
  user: User | null;
  board: Board | null;
  theme: "light" | "dark";
  performance: PerformanceProfile;
  features: FeatureFlags;
}

export interface FeatureFlags {
  collaboration: boolean;
  realTimeSync: boolean;
  advancedTools: boolean;
  performanceMode: boolean;
  betaFeatures: boolean;
  aiAssistant: boolean;
}

// ===================
// MIGRATION TYPES
// ===================

export interface MigrationContext {
  fromVersion: string;
  toVersion: string;
  data: any;
  options: MigrationOptions;
}

export interface MigrationOptions {
  preserveIds: boolean;
  validateData: boolean;
  createBackup: boolean;
  skipErrors: boolean;
}

export interface MigrationResult {
  success: boolean;
  migratedData?: any;
  errors: string[];
  warnings: string[];
  stats: MigrationStats;
}

export interface MigrationStats {
  itemsProcessed: number;
  itemsMigrated: number;
  itemsSkipped: number;
  itemsFailed: number;
  duration: number;
}

// Re-export utility types
export type {
  FirebaseSnapshot,
  FirebaseReference,
  FirebaseError,
  BoardUpdatePayload,
  ShapeVisibility,
  SpatialIndex,
  SpatialNode,
} from "./utils";
