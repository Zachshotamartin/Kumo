/**
 * Type Utilities for Enhanced Type Safety
 *
 * Provides utility types and helper functions to replace 'any' types
 * in utility functions, helpers, and service modules.
 */

import {
  KumoShape,
  Point,
  BoundingBox,
  Board,
  User,
  BoardInfo,
  ShapeType,
  ApiResponse,
  ApiError,
  MigrationContext,
  MigrationResult,
} from "./index";

// ===================
// FIREBASE TYPES
// ===================

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface FirebaseDocument<T = Record<string, any>> {
  id: string;
  data: T;
  exists: boolean;
  metadata: {
    fromCache: boolean;
    hasPendingWrites: boolean;
  };
}

export interface FirebaseSnapshot<T = any> {
  exists(): boolean;
  val(): T | null;
  key: string | null;
  ref: FirebaseReference;
}

export interface FirebaseReference {
  key: string | null;
  parent: FirebaseReference | null;
  root: FirebaseReference;
  child(path: string): FirebaseReference;
  push(value?: any): FirebaseReference;
  set(value: any): Promise<void>;
  update(values: Record<string, any>): Promise<void>;
  remove(): Promise<void>;
  on(eventType: string, callback: (snapshot: FirebaseSnapshot) => void): void;
  off(
    eventType?: string,
    callback?: (snapshot: FirebaseSnapshot) => void
  ): void;
}

export interface FirebaseError {
  code: string;
  message: string;
  name: string;
  stack?: string;
}

export type FirebaseCallback<T = any> = (snapshot: FirebaseSnapshot<T>) => void;
export type FirebaseErrorCallback = (error: FirebaseError) => void;

// ===================
// PERFORMANCE TYPES
// ===================

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface ShapeVisibility {
  visible: boolean;
  culled: boolean;
  lodLevel: "hidden" | "simple" | "full";
  reason?: string;
}

export interface SpatialIndex {
  insert(shape: KumoShape): void;
  remove(shapeId: string): void;
  query(bounds: BoundingBox): KumoShape[];
  clear(): void;
  size(): number;
}

export interface SpatialNode {
  bounds: BoundingBox;
  shapes: KumoShape[];
  children: SpatialNode[];
  level: number;
  maxShapes: number;
  maxLevels: number;
}

export interface OptimizedShapeRenderContext {
  viewport: Viewport;
  spatialIndex: SpatialIndex;
  performanceMode: "high" | "balanced" | "battery";
  memoryUsage: number;
  frameRate: number;
}

export interface ShapeRenderOptions {
  enableLOD: boolean;
  enableCulling: boolean;
  batchSize: number;
  priority: "speed" | "quality" | "memory";
}

export interface PerformanceMetrics {
  renderTime: number;
  frameRate: number;
  memoryUsage: number;
  shapesRendered: number;
  shapesTotal: number;
  culledShapes: number;
  lodShapes: number;
}

// ===================
// SHAPE UTILITY TYPES
// ===================

export interface ShapeOperationContext {
  shapes: KumoShape[];
  selectedShapes: string[];
  clipboard: KumoShape[];
  history: KumoShape[][];
  viewport: Viewport;
}

export interface ShapeTransformData {
  translation: Point;
  rotation: number;
  scale: Point;
  origin: Point;
}

export interface ShapeBoundsCalculation {
  bounds: BoundingBox;
  center: Point;
  corners: Point[];
  area: number;
  perimeter: number;
}

export interface ShapeHitTestResult {
  hit: boolean;
  shape: KumoShape | null;
  distance: number;
  point: Point;
}

export interface ShapeIntersectionResult {
  intersects: boolean;
  shapes: KumoShape[];
  points: Point[];
  area: number;
}

// ===================
// BOARD UTILITY TYPES
// ===================

export interface BoardUpdatePayload {
  boardId: string;
  changes: Partial<Board>;
  userId: string;
  timestamp: number;
  operation: "create" | "update" | "delete";
}

export interface BoardValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  board: Board | null;
}

export interface BoardExportOptions {
  format: "json" | "svg" | "png" | "pdf";
  includeMetadata: boolean;
  compression: boolean;
  quality: number;
  bounds?: BoundingBox;
}

export interface BoardImportResult {
  success: boolean;
  board: Board | null;
  shapes: KumoShape[];
  errors: string[];
  warnings: string[];
}

// ===================
// EVENT HANDLER TYPES
// ===================

export interface MouseEventContext {
  point: Point;
  button: number;
  modifiers: {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
  };
  target: KumoShape | null;
  viewport: Viewport;
  timestamp: number;
}

export interface KeyboardEventContext {
  key: string;
  code: string;
  modifiers: {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
  };
  repeat: boolean;
  target: HTMLElement | null;
  timestamp: number;
}

export interface TouchEventContext {
  touches: TouchPoint[];
  center: Point;
  scale: number;
  rotation: number;
  velocity: Point;
  timestamp: number;
}

export interface TouchPoint {
  id: number;
  point: Point;
  pressure: number;
  radius: number;
}

// ===================
// UTILITY FUNCTION TYPES
// ===================

export type ShapeValidator = (shape: KumoShape) => boolean;
export type ShapeTransformer<T = KumoShape> = (shape: KumoShape) => T;
export type ShapeComparator = (a: KumoShape, b: KumoShape) => number;
export type ShapeFilter = (
  shape: KumoShape,
  index: number,
  array: KumoShape[]
) => boolean;
export type ShapeReducer<T> = (
  accumulator: T,
  shape: KumoShape,
  index: number,
  array: KumoShape[]
) => T;

export type PointValidator = (point: Point) => boolean;
export type PointTransformer = (point: Point) => Point;
export type DistanceCalculator = (a: Point, b: Point) => number;

export type BoardValidator = (board: Board) => BoardValidationResult;
export type BoardTransformer = (board: Board) => Board;
export type BoardComparator = (a: Board, b: Board) => number;

// ===================
// ASYNC OPERATION TYPES
// ===================

export interface AsyncOperationContext<T = any> {
  operation: string;
  data: T;
  userId: string;
  boardId: string;
  timestamp: number;
  timeout?: number;
}

export interface AsyncOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  retries: number;
}

export type AsyncHandler<T = any, R = any> = (
  context: AsyncOperationContext<T>
) => Promise<AsyncOperationResult<R>>;

// ===================
// MIGRATION UTILITY TYPES
// ===================

export interface LegacyShape {
  id: string;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  [key: string]: any;
}

export interface LegacyBoard {
  id: string;
  title: string;
  shapes: LegacyShape[];
  [key: string]: any;
}

export type ShapeMigrator = (legacyShape: LegacyShape) => KumoShape;
export type BoardMigrator = (legacyBoard: LegacyBoard) => Board;

export interface MigrationStep {
  name: string;
  version: string;
  migrate: (data: any) => any;
  validate: (data: any) => boolean;
}

// ===================
// COMPONENT PROP TYPES
// ===================

export interface ShapeComponentBaseProps {
  shape: KumoShape;
  isSelected?: boolean;
  isHovered?: boolean;
  isEditing?: boolean;
  viewport?: Viewport;
  theme?: "light" | "dark";
}

export interface ToolComponentBaseProps {
  isActive?: boolean;
  disabled?: boolean;
  size?: "small" | "medium" | "large";
  variant?: "primary" | "secondary" | "ghost";
}

export interface BoardComponentBaseProps {
  board: Board;
  readonly?: boolean;
  showGrid?: boolean;
  showRulers?: boolean;
  theme?: "light" | "dark";
}

// ===================
// TYPED EVENT HANDLERS
// ===================

export type TypedMouseEventHandler = (event: MouseEventContext) => void;
export type TypedKeyboardEventHandler = (event: KeyboardEventContext) => void;
export type TypedTouchEventHandler = (event: TouchEventContext) => void;

export type TypedShapeEventHandler = (
  shape: KumoShape,
  event: MouseEventContext
) => void;
export type TypedBoardEventHandler = (
  board: Board,
  event: MouseEventContext
) => void;

// ===================
// UTILITY FUNCTIONS
// ===================

/**
 * Type guard to check if an object is a valid Point
 */
export function isPoint(obj: any): obj is Point {
  return obj && typeof obj.x === "number" && typeof obj.y === "number";
}

/**
 * Type guard to check if an object is a valid BoundingBox
 */
export function isBoundingBox(obj: any): obj is BoundingBox {
  return (
    obj &&
    typeof obj.x === "number" &&
    typeof obj.y === "number" &&
    typeof obj.width === "number" &&
    typeof obj.height === "number"
  );
}

/**
 * Type guard to check if an object is a valid KumoShape
 */
export function isKumoShape(obj: any): obj is KumoShape {
  return (
    obj &&
    typeof obj.id === "string" &&
    typeof obj.type === "string" &&
    obj.bounds &&
    isBoundingBox(obj.bounds) &&
    typeof obj.zIndex === "number"
  );
}

/**
 * Type guard to check if an object is a valid Board
 */
export function isBoard(obj: any): obj is Board {
  return (
    obj &&
    obj.info &&
    typeof obj.info.id === "string" &&
    Array.isArray(obj.shapes) &&
    typeof obj.version === "number"
  );
}

/**
 * Type guard to check if an object is a valid User
 */
export function isUser(obj: any): obj is User {
  return (
    obj &&
    typeof obj.id === "string" &&
    typeof obj.email === "string" &&
    typeof obj.displayName === "string"
  );
}

/**
 * Type guard for Firebase snapshots
 */
export function isFirebaseSnapshot(obj: any): obj is FirebaseSnapshot {
  return (
    obj &&
    typeof obj.exists === "function" &&
    typeof obj.val === "function" &&
    typeof obj.key === "string"
  );
}

/**
 * Creates a typed error with proper structure
 */
export function createTypedError(
  code: string,
  message: string,
  details?: Record<string, any>
): ApiError {
  return {
    code,
    message,
    details: details || {},
    timestamp: Date.now(),
  };
}

/**
 * Creates a typed API response
 */
export function createTypedResponse<T>(
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success: !error,
    data,
    error,
    timestamp: Date.now(),
  };
}

/**
 * Type-safe deep clone function
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  const cloned: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }

  return cloned;
}

/**
 * Type-safe object merge function
 */
export function typedMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key) && source[key] !== undefined) {
      result[key] = source[key] as T[typeof key];
    }
  }

  return result;
}

/**
 * Type-safe array filtering with type narrowing
 */
export function filterWithType<T, U extends T>(
  array: T[],
  predicate: (item: T) => item is U
): U[] {
  return array.filter(predicate);
}

/**
 * Type-safe promise timeout wrapper
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}
