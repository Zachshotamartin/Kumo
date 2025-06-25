// Performance Optimization Types for Kumo Whiteboard

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number; // zoom level
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Virtual rendering configuration
export interface VirtualRenderConfig {
  // Viewport settings
  viewportPadding: number; // Extra area to render outside viewport (px)
  cullingEnabled: boolean;

  // Level-of-detail settings
  lodEnabled: boolean;
  lodThresholds: {
    simple: number; // Scale below which to use simple rendering
    hidden: number; // Scale below which to hide shapes entirely
  };

  // Performance settings
  maxShapesPerFrame: number;
  batchSize: number;
  frameTimeTarget: number; // Target frame time in ms (16.67ms = 60fps)

  // Optimization flags
  enableSpatialIndex: boolean;
  enableOcclusion: boolean;
  enableMemoryOptimization: boolean;
}

// Shape visibility information
export interface ShapeVisibility {
  shapeId: string;
  isVisible: boolean;
  distance: number; // Distance from viewport center
  occluded: boolean;
  lodLevel: "full" | "simple" | "hidden";
  lastVisibleFrame: number;
}

// Spatial indexing for fast viewport queries
export interface SpatialNode {
  bounds: BoundingBox;
  shapeIds: string[];
  children?: SpatialNode[];
  level: number;
}

export interface SpatialIndex {
  root: SpatialNode;
  maxDepth: number;
  maxShapesPerNode: number;
  bounds: BoundingBox;
}

// Performance metrics
export interface RenderMetrics {
  frameTime: number;
  shapesRendered: number;
  shapesCulled: number;
  drawCalls: number;
  memoryUsage: number;
  viewportQueries: number;
  timestamp: number;
}

export interface PerformanceStats {
  fps: number;
  avgFrameTime: number;
  minFrameTime: number;
  maxFrameTime: number;
  totalShapes: number;
  visibleShapes: number;
  cullingEfficiency: number; // Percentage of shapes culled
  memoryEfficiency: number;
  lastUpdate: number;
}

// Virtual renderer interface
export interface VirtualRenderer {
  // Core rendering
  updateViewport(viewport: Viewport): void;
  getVisibleShapes(shapes: any[]): any[];
  shouldRenderShape(shape: any, viewport: Viewport): ShapeVisibility;

  // Performance optimization
  buildSpatialIndex(shapes: any[]): SpatialIndex;
  queryShapesInViewport(viewport: Viewport): string[];
  updateShapeIndex(shapeId: string, bounds: BoundingBox): void;
  removeShapeFromIndex(shapeId: string): void;

  // Level-of-detail
  getLODLevel(shape: any, viewport: Viewport): "full" | "simple" | "hidden";
  renderShapeLOD(shape: any, lodLevel: string): React.ReactElement | null;

  // Performance monitoring
  getMetrics(): RenderMetrics;
  getStats(): PerformanceStats;
  resetMetrics(): void;
}

// Culling strategies
export type CullingStrategy = "frustum" | "distance" | "occlusion" | "hybrid";

export interface CullingResult {
  visibleShapes: string[];
  culledShapes: string[];
  strategy: CullingStrategy;
  efficiency: number;
  timeMs: number;
}

// Memory management
export interface MemoryPool {
  allocate<T>(size: number): T[];
  deallocate<T>(array: T[]): void;
  getUsage(): number;
  getCapacity(): number;
  cleanup(): void;
}

// Performance profiler
export interface PerformanceProfiler {
  startFrame(): void;
  endFrame(): void;
  markOperation(name: string): void;
  getProfile(): PerformanceProfile;
  exportData(): string;
}

export interface PerformanceProfile {
  operations: Array<{
    name: string;
    duration: number;
    count: number;
    percentage: number;
  }>;
  totalTime: number;
  frameCount: number;
  avgFPS: number;
}

// Optimization hints
export interface OptimizationHints {
  shouldUseLOD: boolean;
  shouldCullAggressively: boolean;
  shouldBatchRender: boolean;
  shouldUseSimpleShapes: boolean;
  recommendedBatchSize: number;
  estimatedPerformanceGain: number;
}

// Shape rendering context with performance data
export interface OptimizedShapeRenderContext {
  shape: any;
  isVisible: boolean;
  isSelected: boolean;
  isHovered: boolean;
  lodLevel: "full" | "simple" | "hidden";
  viewport: Viewport;
  distanceFromCenter: number;
  occluded: boolean;
  renderFrame: number;
  onMouseEnter?: (shape: any) => void;
  onMouseLeave?: () => void;
  onShapeClick?: (shape: any) => void;
}

// Batch rendering for performance
export interface RenderBatch {
  shapes: any[];
  lodLevel: "full" | "simple" | "hidden";
  priority: number;
  estimatedRenderTime: number;
}

export interface BatchRenderer {
  addShape(shape: any, context: OptimizedShapeRenderContext): void;
  processBatch(): React.ReactElement[];
  getPendingBatches(): RenderBatch[];
  getBatchMetrics(): {
    totalBatches: number;
    avgBatchSize: number;
    renderTime: number;
  };
}

// Canvas optimization types
export interface CanvasOptimization {
  enableLayering: boolean;
  enableDirtyRegions: boolean;
  enableOffscreenCanvas: boolean;
  maxLayers: number;
  dirtyRegionThreshold: number;
}

// Worker-based rendering for complex shapes
export interface RenderWorker {
  id: string;
  busy: boolean;
  capabilities: string[];
  renderShape(
    shape: any,
    context: OptimizedShapeRenderContext
  ): Promise<string>;
  terminate(): void;
}

export interface WorkerPool {
  workers: RenderWorker[];
  queue: Array<{
    shape: any;
    context: OptimizedShapeRenderContext;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
  }>;
  maxWorkers: number;
  getAvailableWorker(): RenderWorker | null;
  submitRenderJob(
    shape: any,
    context: OptimizedShapeRenderContext
  ): Promise<string>;
}

// Performance testing utilities
export interface PerformanceTest {
  name: string;
  description: string;
  setup(): void;
  run(): Promise<PerformanceTestResult>;
  cleanup(): void;
}

export interface PerformanceTestResult {
  testName: string;
  duration: number;
  fps: number;
  memoryUsed: number;
  shapesRendered: number;
  passed: boolean;
  metrics: RenderMetrics[];
  recommendations: string[];
}

// Event-driven performance updates
export interface PerformanceEvent {
  type:
    | "viewport_change"
    | "shape_added"
    | "shape_removed"
    | "zoom_change"
    | "performance_warning";
  data: any;
  timestamp: number;
  source: string;
}

export interface PerformanceEventHandler {
  (event: PerformanceEvent): void;
}

// Configuration profiles for different performance scenarios
export interface PerformanceProfile {
  name: string;
  description: string;
  config: VirtualRenderConfig;
  targetFPS: number;
  maxShapes: number;
  memoryLimit: number;
  useCase: "mobile" | "desktop" | "high-end" | "low-end";
}

// Real-time performance monitoring
export interface PerformanceMonitor {
  start(): void;
  stop(): void;
  recordMetric(name: string, value: number): void;
  getAverageMetric(name: string, timeWindow?: number): number;
  getMetricTrend(name: string): "increasing" | "decreasing" | "stable";
  subscribe(callback: (metrics: PerformanceStats) => void): () => void;
  exportReport(): string;
}
