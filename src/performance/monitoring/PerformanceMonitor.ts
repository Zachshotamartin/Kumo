import {
  PerformanceStats,
  RenderMetrics,
  PerformanceEvent,
  PerformanceEventHandler,
  PerformanceMonitor,
  OptimizationHints,
} from "../types";

/**
 * Real-time performance monitoring system for Kumo whiteboard
 *
 * Features:
 * - Real-time FPS and frame time tracking
 * - Memory usage monitoring
 * - Performance trend analysis
 * - Automatic optimization suggestions
 * - Performance warnings and alerts
 */
export class PerformanceMonitorImpl implements PerformanceMonitor {
  private isRunning = false;
  private metrics = new Map<string, number[]>();
  private eventHandlers = new Set<PerformanceEventHandler>();
  private lastUpdate = 0;
  private updateInterval = 1000; // Update every second
  private maxHistorySize = 60; // Keep 60 seconds of history

  // Performance thresholds
  private readonly thresholds = {
    fps: {
      good: 55,
      warning: 45,
      critical: 30,
    },
    frameTime: {
      good: 16.67, // 60fps
      warning: 22.22, // 45fps
      critical: 33.33, // 30fps
    },
    memoryUsage: {
      good: 50, // MB
      warning: 100,
      critical: 200,
    },
  };

  // Current performance state
  private currentStats: PerformanceStats = {
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

  private frameStartTime = 0;
  private frameEndTime = 0;
  private frameCounter = 0;

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastUpdate = Date.now();
    this.frameCounter = 0;

    // Start the monitoring loop
    this.startMonitoringLoop();

    // Emit start event
    this.emitEvent({
      type: "performance_warning",
      data: { message: "Performance monitoring started" },
      timestamp: Date.now(),
      source: "PerformanceMonitor",
    });
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Emit stop event
    this.emitEvent({
      type: "performance_warning",
      data: { message: "Performance monitoring stopped" },
      timestamp: Date.now(),
      source: "PerformanceMonitor",
    });
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(value);

    // Limit history size
    if (values.length > this.maxHistorySize) {
      values.shift();
    }

    // Update current stats based on the metric
    this.updateCurrentStats(name, value);
  }

  /**
   * Get average metric value over a time window
   */
  getAverageMetric(name: string, timeWindow?: number): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;

    let sampleSize = values.length;
    if (timeWindow) {
      // Use only values from the specified time window (in seconds)
      sampleSize = Math.min(timeWindow, values.length);
    }

    const relevantValues = values.slice(-sampleSize);
    return (
      relevantValues.reduce((sum, val) => sum + val, 0) / relevantValues.length
    );
  }

  /**
   * Analyze performance trend for a metric
   */
  getMetricTrend(name: string): "increasing" | "decreasing" | "stable" {
    const values = this.metrics.get(name);
    if (!values || values.length < 10) return "stable";

    // Compare recent values with older values
    const recentValues = values.slice(-5);
    const olderValues = values.slice(-10, -5);

    const recentAvg =
      recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
    const olderAvg =
      olderValues.reduce((sum, val) => sum + val, 0) / olderValues.length;

    const threshold = 0.05; // 5% change threshold
    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > threshold) return "increasing";
    if (change < -threshold) return "decreasing";
    return "stable";
  }

  /**
   * Subscribe to performance events
   */
  subscribe(callback: (metrics: PerformanceStats) => void): () => void {
    const handler: PerformanceEventHandler = (event) => {
      if (event.type === "performance_warning") {
        callback(this.currentStats);
      }
    };

    this.eventHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Export performance report
   */
  exportReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      currentStats: this.currentStats,
      metrics: Object.fromEntries(this.metrics),
      trends: this.analyzeTrends(),
      optimizationHints: this.generateOptimizationHints(),
      performanceScore: this.calculatePerformanceScore(),
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Update stats with new render metrics
   */
  updateWithRenderMetrics(metrics: RenderMetrics): void {
    this.recordMetric("frameTime", metrics.frameTime);
    this.recordMetric("shapesRendered", metrics.shapesRendered);
    this.recordMetric("shapesCulled", metrics.shapesCulled);
    this.recordMetric("memoryUsage", metrics.memoryUsage);
    this.recordMetric("viewportQueries", metrics.viewportQueries);

    // Calculate FPS
    const fps = 1000 / metrics.frameTime;
    this.recordMetric("fps", fps);

    // Update frame counter
    this.frameCounter++;

    // Check for performance warnings
    this.checkPerformanceWarnings();
  }

  /**
   * Get current performance statistics
   */
  getCurrentStats(): PerformanceStats {
    return { ...this.currentStats };
  }

  /**
   * Get optimization hints based on current performance
   */
  getOptimizationHints(): OptimizationHints {
    return this.generateOptimizationHints();
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private startMonitoringLoop(): void {
    const update = () => {
      if (!this.isRunning) return;

      const now = Date.now();
      if (now - this.lastUpdate >= this.updateInterval) {
        this.updatePerformanceStats();
        this.lastUpdate = now;
      }

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }

  private updateCurrentStats(metricName: string, value: number): void {
    const now = Date.now();

    switch (metricName) {
      case "fps":
        this.currentStats.fps = this.getAverageMetric("fps", 5);
        break;
      case "frameTime":
        this.currentStats.avgFrameTime = this.getAverageMetric("frameTime", 5);
        this.updateFrameTimeStats();
        break;
      case "shapesRendered":
        this.currentStats.visibleShapes = value;
        break;
      case "shapesCulled":
        this.updateCullingEfficiency();
        break;
      case "memoryUsage":
        this.updateMemoryEfficiency();
        break;
    }

    this.currentStats.lastUpdate = now;
  }

  private updateFrameTimeStats(): void {
    const frameTimes = this.metrics.get("frameTime") || [];
    if (frameTimes.length === 0) return;

    const recent = frameTimes.slice(-30); // Last 30 frames
    this.currentStats.minFrameTime = Math.min(...recent);
    this.currentStats.maxFrameTime = Math.max(...recent);
  }

  private updateCullingEfficiency(): void {
    const rendered = this.metrics.get("shapesRendered") || [];
    const culled = this.metrics.get("shapesCulled") || [];

    if (rendered.length === 0 || culled.length === 0) return;

    const lastRendered = rendered[rendered.length - 1] || 0;
    const lastCulled = culled[culled.length - 1] || 0;
    const total = lastRendered + lastCulled;

    this.currentStats.totalShapes = total;
    this.currentStats.cullingEfficiency =
      total > 0 ? (lastCulled / total) * 100 : 0;
  }

  private updateMemoryEfficiency(): void {
    const memoryUsage = this.getAverageMetric("memoryUsage", 10);
    const baselineMemory = 10; // MB baseline

    this.currentStats.memoryEfficiency =
      memoryUsage > baselineMemory ? (baselineMemory / memoryUsage) * 100 : 100;
  }

  private updatePerformanceStats(): void {
    // Update all current stats based on recent metrics
    this.currentStats.fps = this.getAverageMetric("fps", 5);
    this.currentStats.avgFrameTime = this.getAverageMetric("frameTime", 5);
    this.updateFrameTimeStats();
    this.updateCullingEfficiency();
    this.updateMemoryEfficiency();

    // Emit performance update event
    this.emitEvent({
      type: "performance_warning",
      data: this.currentStats,
      timestamp: Date.now(),
      source: "PerformanceMonitor",
    });
  }

  private checkPerformanceWarnings(): void {
    const fps = this.currentStats.fps;
    const frameTime = this.currentStats.avgFrameTime;
    const memoryUsage = this.getAverageMetric("memoryUsage", 5);

    // Check FPS warnings
    if (fps < this.thresholds.fps.critical) {
      this.emitWarning("critical", `Critical FPS drop: ${fps.toFixed(1)} FPS`);
    } else if (fps < this.thresholds.fps.warning) {
      this.emitWarning("warning", `Low FPS: ${fps.toFixed(1)} FPS`);
    }

    // Check frame time warnings
    if (frameTime > this.thresholds.frameTime.critical) {
      this.emitWarning(
        "critical",
        `Critical frame time: ${frameTime.toFixed(1)}ms`
      );
    } else if (frameTime > this.thresholds.frameTime.warning) {
      this.emitWarning("warning", `High frame time: ${frameTime.toFixed(1)}ms`);
    }

    // Check memory warnings
    if (memoryUsage > this.thresholds.memoryUsage.critical) {
      this.emitWarning(
        "critical",
        `High memory usage: ${memoryUsage.toFixed(1)}MB`
      );
    } else if (memoryUsage > this.thresholds.memoryUsage.warning) {
      this.emitWarning(
        "warning",
        `Elevated memory usage: ${memoryUsage.toFixed(1)}MB`
      );
    }
  }

  private emitWarning(level: "warning" | "critical", message: string): void {
    this.emitEvent({
      type: "performance_warning",
      data: { level, message, stats: this.currentStats },
      timestamp: Date.now(),
      source: "PerformanceMonitor",
    });
  }

  private emitEvent(event: PerformanceEvent): void {
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error("Error in performance event handler:", error);
      }
    });
  }

  private analyzeTrends(): Record<string, string> {
    const trends: Record<string, string> = {};

    for (const [metricName] of this.metrics) {
      trends[metricName] = this.getMetricTrend(metricName);
    }

    return trends;
  }

  private generateOptimizationHints(): OptimizationHints {
    const fps = this.currentStats.fps;
    const cullingEfficiency = this.currentStats.cullingEfficiency;
    const memoryUsage = this.getAverageMetric("memoryUsage", 5);
    const totalShapes = this.currentStats.totalShapes;

    const hints: OptimizationHints = {
      shouldUseLOD: fps < 45 || totalShapes > 500,
      shouldCullAggressively: cullingEfficiency < 50,
      shouldBatchRender: fps < 30,
      shouldUseSimpleShapes: fps < 30 || memoryUsage > 100,
      recommendedBatchSize: fps < 30 ? 25 : 50,
      estimatedPerformanceGain: this.estimatePerformanceGain(),
    };

    return hints;
  }

  private estimatePerformanceGain(): number {
    const currentFPS = this.currentStats.fps;
    const targetFPS = 60;

    if (currentFPS >= targetFPS) return 0;

    const currentEfficiency = this.currentStats.cullingEfficiency;
    const memoryEfficiency = this.currentStats.memoryEfficiency;

    // Estimate potential gain based on current inefficiencies
    let potentialGain = 0;

    // Culling optimization
    if (currentEfficiency < 70) {
      potentialGain += (70 - currentEfficiency) * 0.5; // 0.5% FPS per % culling
    }

    // Memory optimization
    if (memoryEfficiency < 80) {
      potentialGain += (80 - memoryEfficiency) * 0.3; // 0.3% FPS per % memory efficiency
    }

    // LOD optimization
    if (this.currentStats.totalShapes > 200) {
      potentialGain += Math.min(30, this.currentStats.totalShapes / 10); // Up to 30% gain
    }

    return Math.min(potentialGain, 100); // Cap at 100%
  }

  private calculatePerformanceScore(): number {
    const fps = this.currentStats.fps;
    const cullingEfficiency = this.currentStats.cullingEfficiency;
    const memoryEfficiency = this.currentStats.memoryEfficiency;

    // Calculate score based on different factors
    const fpsScore = Math.min(fps / 60, 1) * 40; // 40% weight for FPS
    const cullingScore = (cullingEfficiency / 100) * 30; // 30% weight for culling
    const memoryScore = (memoryEfficiency / 100) * 30; // 30% weight for memory

    return Math.round(fpsScore + cullingScore + memoryScore);
  }
}
