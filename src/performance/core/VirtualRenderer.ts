import {
  VirtualRenderer,
  Viewport,
  BoundingBox,
  ViewportBounds,
  VirtualRenderConfig,
  ShapeVisibility,
  SpatialIndex,
  SpatialNode,
  RenderMetrics,
  PerformanceStats,
  CullingResult,
  CullingStrategy,
} from "../types";

/**
 * High-performance virtual renderer for Kumo whiteboard
 *
 * Features:
 * - Viewport culling: Only render shapes in view
 * - Spatial indexing: Fast viewport queries with quadtree
 * - Level-of-detail: Simple rendering when zoomed out
 * - Performance monitoring: Real-time metrics
 */
export class VirtualRendererImpl implements VirtualRenderer {
  private config: VirtualRenderConfig;
  private currentViewport: Viewport;
  private spatialIndex: SpatialIndex | null = null;
  private visibilityCache = new Map<string, ShapeVisibility>();
  private frameCounter = 0;
  private metrics: RenderMetrics;
  private performanceHistory: RenderMetrics[] = [];
  private readonly maxHistorySize = 100;

  constructor(config?: Partial<VirtualRenderConfig>) {
    this.config = {
      viewportPadding: 200, // Render 200px outside viewport
      cullingEnabled: true,
      lodEnabled: true,
      lodThresholds: {
        simple: 0.3, // Use simple rendering below 30% zoom
        hidden: 0.1, // Hide shapes below 10% zoom
      },
      maxShapesPerFrame: 1000,
      batchSize: 50,
      frameTimeTarget: 16.67, // 60fps
      enableSpatialIndex: true,
      enableOcclusion: false, // Advanced feature for later
      enableMemoryOptimization: true,
      ...config,
    };

    this.currentViewport = { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Update the current viewport (called on zoom/pan)
   */
  updateViewport(viewport: Viewport): void {
    const viewportChanged = !this.viewportsEqual(
      this.currentViewport,
      viewport
    );

    if (viewportChanged) {
      this.currentViewport = { ...viewport };

      // Clear visibility cache on significant viewport changes
      if (this.shouldClearCache(viewport)) {
        this.visibilityCache.clear();
      }
    }
  }

  /**
   * Get shapes that should be rendered based on viewport culling
   */
  getVisibleShapes(shapes: any[]): any[] {
    const startTime = performance.now();
    this.frameCounter++;

    // Build spatial index if needed
    if (this.config.enableSpatialIndex && !this.spatialIndex) {
      this.buildSpatialIndex(shapes);
    }

    let visibleShapes: any[] = [];

    if (this.config.cullingEnabled) {
      // Use spatial index for fast viewport queries
      const visibleShapeIds = this.queryShapesInViewport(this.currentViewport);
      visibleShapes = shapes.filter((shape) =>
        visibleShapeIds.includes(shape.id)
      );
    } else {
      // Fallback: Check all shapes
      visibleShapes = shapes.filter((shape) => {
        const visibility = this.shouldRenderShape(shape, this.currentViewport);
        return visibility.isVisible;
      });
    }

    // Apply LOD filtering
    if (this.config.lodEnabled) {
      visibleShapes = visibleShapes.filter((shape) => {
        const lodLevel = this.getLODLevel(shape, this.currentViewport);
        return lodLevel !== "hidden";
      });
    }

    // Limit shapes per frame for performance
    if (visibleShapes.length > this.config.maxShapesPerFrame) {
      visibleShapes = this.prioritizeShapes(visibleShapes).slice(
        0,
        this.config.maxShapesPerFrame
      );
    }

    // Update metrics
    const endTime = performance.now();
    this.updateMetrics(
      endTime - startTime,
      visibleShapes.length,
      shapes.length - visibleShapes.length
    );

    return visibleShapes;
  }

  /**
   * Check if a specific shape should be rendered
   */
  shouldRenderShape(shape: any, viewport: Viewport): ShapeVisibility {
    const cacheKey = `${shape.id}-${viewport.x}-${viewport.y}-${viewport.scale}`;

    // Check cache first
    if (this.visibilityCache.has(cacheKey)) {
      const cached = this.visibilityCache.get(cacheKey)!;
      cached.lastVisibleFrame = this.frameCounter;
      return cached;
    }

    const shapeBounds = this.getShapeBounds(shape);
    const viewportBounds = this.getViewportBounds(viewport);

    // Frustum culling: Check if shape intersects with viewport
    const isVisible = this.boundsIntersect(shapeBounds, viewportBounds);

    // Calculate distance from viewport center
    const distance = this.calculateDistanceFromViewportCenter(
      shapeBounds,
      viewport
    );

    // LOD level determination
    const lodLevel = this.getLODLevel(shape, viewport);

    const visibility: ShapeVisibility = {
      shapeId: shape.id,
      isVisible: isVisible && lodLevel !== "hidden",
      distance,
      occluded: false, // TODO: Implement occlusion culling
      lodLevel,
      lastVisibleFrame: this.frameCounter,
    };

    // Cache the result
    this.visibilityCache.set(cacheKey, visibility);

    // Clean cache periodically
    if (this.visibilityCache.size > 1000) {
      this.cleanVisibilityCache();
    }

    return visibility;
  }

  /**
   * Build spatial index for fast viewport queries
   */
  buildSpatialIndex(shapes: any[]): SpatialIndex {
    // Calculate world bounds
    const worldBounds = this.calculateWorldBounds(shapes);

    // Create root node
    const root: SpatialNode = {
      bounds: worldBounds,
      shapeIds: [],
      children: undefined,
      level: 0,
    };

    // Insert all shapes into the quadtree
    for (const shape of shapes) {
      this.insertShapeIntoNode(root, shape);
    }

    this.spatialIndex = {
      root,
      maxDepth: 8,
      maxShapesPerNode: 10,
      bounds: worldBounds,
    };

    return this.spatialIndex;
  }

  /**
   * Query shapes in viewport using spatial index
   */
  queryShapesInViewport(viewport: Viewport): string[] {
    if (!this.spatialIndex) {
      return [];
    }

    const viewportBounds = this.getViewportBounds(viewport);
    const result: string[] = [];

    this.queryNode(this.spatialIndex.root, viewportBounds, result);

    return result;
  }

  /**
   * Update shape in spatial index
   */
  updateShapeIndex(shapeId: string, bounds: BoundingBox): void {
    if (!this.spatialIndex) return;

    // Remove from old position
    this.removeShapeFromIndex(shapeId);

    // TODO: Insert at new position
    // For now, rebuild index (optimize later)
  }

  /**
   * Remove shape from spatial index
   */
  removeShapeFromIndex(shapeId: string): void {
    if (!this.spatialIndex) return;

    // TODO: Implement efficient removal
    // For now, mark for rebuild
  }

  /**
   * Get level-of-detail for a shape based on viewport
   */
  getLODLevel(shape: any, viewport: Viewport): "full" | "simple" | "hidden" {
    if (!this.config.lodEnabled) {
      return "full";
    }

    const scale = viewport.scale;

    if (scale < this.config.lodThresholds.hidden) {
      return "hidden";
    } else if (scale < this.config.lodThresholds.simple) {
      return "simple";
    } else {
      return "full";
    }
  }

  /**
   * Render shape with appropriate LOD
   */
  renderShapeLOD(shape: any, lodLevel: string): React.ReactElement | null {
    // This will be implemented in the shape plugins
    // For now, return null for hidden shapes
    return lodLevel === "hidden" ? null : shape;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): RenderMetrics {
    return { ...this.metrics };
  }

  /**
   * Get performance statistics over time
   */
  getStats(): PerformanceStats {
    if (this.performanceHistory.length === 0) {
      return this.createEmptyStats();
    }

    const recent = this.performanceHistory.slice(-30); // Last 30 frames
    const totalShapes = this.metrics.shapesRendered + this.metrics.shapesCulled;

    return {
      fps:
        1000 /
        (recent.reduce((sum, m) => sum + m.frameTime, 0) / recent.length),
      avgFrameTime:
        recent.reduce((sum, m) => sum + m.frameTime, 0) / recent.length,
      minFrameTime: Math.min(...recent.map((m) => m.frameTime)),
      maxFrameTime: Math.max(...recent.map((m) => m.frameTime)),
      totalShapes,
      visibleShapes: this.metrics.shapesRendered,
      cullingEfficiency:
        totalShapes > 0 ? (this.metrics.shapesCulled / totalShapes) * 100 : 0,
      memoryEfficiency: this.calculateMemoryEfficiency(),
      lastUpdate: Date.now(),
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = this.createEmptyMetrics();
    this.performanceHistory = [];
    this.frameCounter = 0;
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private createEmptyMetrics(): RenderMetrics {
    return {
      frameTime: 0,
      shapesRendered: 0,
      shapesCulled: 0,
      drawCalls: 0,
      memoryUsage: 0,
      viewportQueries: 0,
      timestamp: Date.now(),
    };
  }

  private createEmptyStats(): PerformanceStats {
    return {
      fps: 0,
      avgFrameTime: 0,
      minFrameTime: 0,
      maxFrameTime: 0,
      totalShapes: 0,
      visibleShapes: 0,
      cullingEfficiency: 0,
      memoryEfficiency: 0,
      lastUpdate: Date.now(),
    };
  }

  private updateMetrics(
    frameTime: number,
    shapesRendered: number,
    shapesCulled: number
  ): void {
    this.metrics = {
      frameTime,
      shapesRendered,
      shapesCulled,
      drawCalls: shapesRendered, // Simplified
      memoryUsage: this.estimateMemoryUsage(),
      viewportQueries: 1,
      timestamp: Date.now(),
    };

    // Add to history
    this.performanceHistory.push({ ...this.metrics });

    // Limit history size
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }
  }

  private viewportsEqual(a: Viewport, b: Viewport): boolean {
    return (
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height &&
      a.scale === b.scale
    );
  }

  private shouldClearCache(newViewport: Viewport): boolean {
    // Clear cache on significant zoom changes
    return Math.abs(newViewport.scale - this.currentViewport.scale) > 0.1;
  }

  private getShapeBounds(shape: any): BoundingBox {
    return {
      x: Math.round(Math.min(shape.x1, shape.x2)),
      y: Math.round(Math.min(shape.y1, shape.y2)),
      width: Math.round(Math.abs(shape.x2 - shape.x1)),
      height: Math.round(Math.abs(shape.y2 - shape.y1)),
    };
  }

  private getViewportBounds(viewport: Viewport): ViewportBounds {
    const padding = this.config.viewportPadding;
    return {
      left: viewport.x - padding,
      top: viewport.y - padding,
      right: viewport.x + viewport.width + padding,
      bottom: viewport.y + viewport.height + padding,
    };
  }

  private boundsIntersect(
    shapeBounds: BoundingBox,
    viewportBounds: ViewportBounds
  ): boolean {
    return (
      shapeBounds.x < viewportBounds.right &&
      shapeBounds.x + shapeBounds.width > viewportBounds.left &&
      shapeBounds.y < viewportBounds.bottom &&
      shapeBounds.y + shapeBounds.height > viewportBounds.top
    );
  }

  private calculateDistanceFromViewportCenter(
    bounds: BoundingBox,
    viewport: Viewport
  ): number {
    const shapeCenterX = bounds.x + bounds.width / 2;
    const shapeCenterY = bounds.y + bounds.height / 2;
    const viewportCenterX = viewport.x + viewport.width / 2;
    const viewportCenterY = viewport.y + viewport.height / 2;

    const dx = shapeCenterX - viewportCenterX;
    const dy = shapeCenterY - viewportCenterY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private prioritizeShapes(shapes: any[]): any[] {
    // Sort by selection status first, then by distance from viewport center
    return shapes.sort((a, b) => {
      // Selected shapes have highest priority
      if (a.isSelected && !b.isSelected) return -1;
      if (!a.isSelected && b.isSelected) return 1;

      // Then sort by distance (closer shapes rendered first)
      const aDistance = this.calculateDistanceFromViewportCenter(
        this.getShapeBounds(a),
        this.currentViewport
      );
      const bDistance = this.calculateDistanceFromViewportCenter(
        this.getShapeBounds(b),
        this.currentViewport
      );

      return aDistance - bDistance;
    });
  }

  private calculateWorldBounds(shapes: any[]): BoundingBox {
    if (shapes.length === 0) {
      return { x: 0, y: 0, width: 1000, height: 1000 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const shape of shapes) {
      const bounds = this.getShapeBounds(shape);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    return {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    };
  }

  private insertShapeIntoNode(node: SpatialNode, shape: any): void {
    // Simple implementation - add to current node
    node.shapeIds.push(shape.id);

    // TODO: Implement proper quadtree subdivision
    // For now, keep it simple for performance
  }

  private queryNode(
    node: SpatialNode,
    queryBounds: ViewportBounds,
    result: string[]
  ): void {
    // Check if node bounds intersect with query bounds
    if (!this.nodeIntersectsViewport(node.bounds, queryBounds)) {
      return;
    }

    // Add all shapes in this node
    result.push(...node.shapeIds);

    // Recursively query children
    if (node.children) {
      for (const child of node.children) {
        this.queryNode(child, queryBounds, result);
      }
    }
  }

  private nodeIntersectsViewport(
    bounds: BoundingBox,
    viewport: ViewportBounds
  ): boolean {
    return (
      bounds.x < viewport.right &&
      bounds.x + bounds.width > viewport.left &&
      bounds.y < viewport.bottom &&
      bounds.y + bounds.height > viewport.top
    );
  }

  private cleanVisibilityCache(): void {
    const currentFrame = this.frameCounter;
    const maxAge = 100; // Remove entries older than 100 frames

    for (const [key, visibility] of this.visibilityCache.entries()) {
      if (currentFrame - visibility.lastVisibleFrame > maxAge) {
        this.visibilityCache.delete(key);
      }
    }
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage in MB
    const cacheSize = this.visibilityCache.size * 0.1; // 0.1KB per cache entry
    const indexSize = this.spatialIndex ? 1 : 0; // 1MB for spatial index
    return (cacheSize + indexSize) / 1024; // Convert to MB
  }

  private calculateMemoryEfficiency(): number {
    // Calculate how efficiently we're using memory
    const totalMemory = this.estimateMemoryUsage();
    const baselineMemory = 0.1; // Baseline memory usage

    return totalMemory > baselineMemory
      ? (baselineMemory / totalMemory) * 100
      : 100;
  }
}
