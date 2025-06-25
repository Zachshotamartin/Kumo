import React from "react";

// Core shape interface that all shapes must implement
export interface BaseShape {
  // Core identification
  type: string;
  id: string;

  // Positioning
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  // Computed dimensions
  width: number;
  height: number;

  // Z-index and hierarchy
  zIndex: number;
  level: number;

  // Transform properties
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;

  // Visual styling
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;
  borderColor?: string;
  backgroundColor?: string;
  color?: string;
  opacity?: number;

  // Text properties (for shapes that support text)
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  rows?: number;

  // Image properties (for shapes that support images)
  backgroundImage?: string;

  // Component properties (for compound shapes)
  shapes?: BaseShape[];

  // Board navigation (for recursive whiteboards)
  boardId?: string | null;
  title?: string | null;
  uid?: string | null;

  // Extension point for shape-specific properties
  [key: string]: any;
}

// Shape creation options
export interface ShapeCreationOptions {
  x: number;
  y: number;
  defaultSize?: { width: number; height: number };
  zIndex?: number;
  [key: string]: any;
}

// Shape rendering context
export interface ShapeRenderContext {
  shape: BaseShape;
  isSelected: boolean;
  isHovered: boolean;
  window: {
    x1: number;
    y1: number;
    percentZoomed: number;
  };
  onMouseEnter?: (shape: BaseShape) => void;
  onMouseLeave?: () => void;
  onShapeClick?: (shape: BaseShape) => void;
}

// Shape plugin interface
export interface ShapePlugin {
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;

  // Shape lifecycle
  create(options: ShapeCreationOptions): BaseShape;
  getDefaultProperties(): Partial<BaseShape>;

  // Rendering
  render(context: ShapeRenderContext): React.ReactElement;

  // Validation
  validate(shape: BaseShape): boolean;

  // Shape operations
  resize?(shape: BaseShape, bounds: ShapeBounds, offset: Point): BaseShape;
  move?(shape: BaseShape, offset: Point): BaseShape;

  // Shape-specific utilities
  getBounds?(shape: BaseShape): ShapeBounds;
  getSnapPoints?(shape: BaseShape): Point[];

  // Serialization
  serialize?(shape: BaseShape): any;
  deserialize?(data: any): BaseShape;
}

// Supporting types
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Shape registry interface
export interface ShapeRegistry {
  register(plugin: ShapePlugin): void;
  unregister(type: string): void;
  getPlugin(type: string): ShapePlugin | undefined;
  getAllPlugins(): ShapePlugin[];
  getRegisteredTypes(): string[];
  getEnabledTypes(): string[];
  isEnabled(type: string): boolean;
  createShape(type: string, options: ShapeCreationOptions): BaseShape | null;
}

// Shape factory interface
export interface ShapeFactory {
  create(type: string, options: ShapeCreationOptions): BaseShape | null;
  createDefault(type: string, x: number, y: number): BaseShape | null;
  clone(shape: BaseShape): BaseShape;
  updateShape(shape: BaseShape, updates: Partial<BaseShape>): BaseShape;
}

// Shape renderer interface
export interface ShapeRenderer {
  render(
    shapes: BaseShape[],
    context: Omit<ShapeRenderContext, "shape">
  ): React.ReactElement;
  renderShape(
    shape: BaseShape,
    context: ShapeRenderContext
  ): React.ReactElement | null;
}

// Shape validation interface
export interface ShapeValidator {
  validateShape(shape: BaseShape): ShapeValidationResult;
  validateType(type: string): boolean;
}

export interface ShapeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Shape transformation utilities
export interface ShapeTransformUtils {
  move(shape: BaseShape, offset: Point): BaseShape;
  resize(shape: BaseShape, bounds: ShapeBounds): BaseShape;
  rotate(shape: BaseShape, angle: number): BaseShape;
  scale(shape: BaseShape, factor: number): BaseShape;
  flip(shape: BaseShape, horizontal: boolean, vertical: boolean): BaseShape;
}

// Shape selection utilities
export interface ShapeSelectionUtils {
  isPointInShape(point: Point, shape: BaseShape): boolean;
  getShapesInBounds(shapes: BaseShape[], bounds: ShapeBounds): BaseShape[];
  getShapesBounds(shapes: BaseShape[]): ShapeBounds;
  getShapeCenter(shape: BaseShape): Point;
}

// Shape style utilities
export interface ShapeStyleUtils {
  applyStyle(shape: BaseShape, style: Partial<BaseShape>): BaseShape;
  getComputedStyle(shape: BaseShape, context: any): React.CSSProperties;
  interpolateStyle(
    from: BaseShape,
    to: BaseShape,
    progress: number
  ): Partial<BaseShape>;
}

// Plugin configuration
export interface ShapePluginConfig {
  type: string;
  enabled: boolean;
  defaultProperties?: Partial<BaseShape>;
  customProperties?: Record<string, any>;
  renderOptions?: {
    enableHover?: boolean;
    enableSelection?: boolean;
    customCursor?: string;
  };
}

// Events
export interface ShapeEvent {
  type: string;
  shape: BaseShape;
  originalEvent?: Event;
  data?: any;
}

export interface ShapeEventHandler {
  (event: ShapeEvent): void;
}

// Configuration for the shape system
export interface ShapeSystemConfig {
  enableValidation: boolean;
  enablePerformanceOptimizations: boolean;
  maxShapes: number;
  defaultZoomLevel: number;
  enableShapeRegistry: boolean;
  enableCustomProperties: boolean;
}

// Shape operation results
export interface ShapeOperationResult {
  success: boolean;
  shape?: BaseShape;
  error?: string;
  warnings?: string[];
}
