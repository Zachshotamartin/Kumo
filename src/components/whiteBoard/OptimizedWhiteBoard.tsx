import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { VirtualRendererImpl } from "../../performance/core/VirtualRenderer";
import { PerformanceMonitorImpl } from "../../performance/monitoring/PerformanceMonitor";
import { UniversalShapeRenderer } from "../renderComponents/UniversalShapeRenderer";
import ModularEventHandler from "../eventHandlers/ModularEventHandler";
import {
  Viewport,
  VirtualRenderConfig,
  PerformanceStats,
  OptimizationHints,
} from "../../performance/types";

// Existing render components for fallback
import RenderBoxes from "../renderComponents/renderBoxes";
import RenderEllipses from "../renderComponents/renderEllipses";
import RenderText from "../renderComponents/renderText";
import RenderImages from "../renderComponents/renderImages";
import RenderCalendars from "../renderComponents/renderCalendars";
import RenderComponents from "../renderComponents/renderComponents";
import RenderBorder from "../renderComponents/renderBorder";
import RenderHoverBorder from "../renderComponents/renderHoverBorder";
import RenderHighlighting from "../renderComponents/renderHighlighting";
import RenderSnappingGuides from "../renderComponents/renderSnappingGuides";
import RenderGridLines from "../renderComponents/renderGridLines";

interface OptimizedWhiteBoardProps {
  children?: React.ReactNode;
  performanceMode?: "auto" | "high" | "balanced" | "compatibility";
  showPerformanceStats?: boolean;
  virtualRenderConfig?: Partial<VirtualRenderConfig>;
}

/**
 * High-performance whiteboard component with virtual rendering
 *
 * Features:
 * - Viewport culling: Only renders shapes in view
 * - Level-of-detail rendering for zoom optimization
 * - Real-time performance monitoring
 * - Automatic performance mode switching
 * - Backward compatibility with existing components
 */
const OptimizedWhiteBoard: React.FC<OptimizedWhiteBoardProps> = ({
  children,
  performanceMode = "auto",
  showPerformanceStats = false,
  virtualRenderConfig = {},
}) => {
  // Redux state
  const window = useSelector((state: any) => state.window);
  const shapes = useSelector((state: any) => state.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const actions = useSelector((state: any) => state.actions);
  const dispatch = useDispatch();

  // Refs
  const whiteBoardRef = useRef<HTMLDivElement>(null);
  const virtualRenderer = useRef<VirtualRendererImpl>();
  const performanceMonitor = useRef<PerformanceMonitorImpl>();
  const frameId = useRef<number>();

  // State
  const [currentPerformanceMode, setCurrentPerformanceMode] =
    useState(performanceMode);
  const [performanceStats, setPerformanceStats] =
    useState<PerformanceStats | null>(null);
  const [optimizationHints, setOptimizationHints] =
    useState<OptimizationHints | null>(null);
  const [visibleShapes, setVisibleShapes] = useState<any[]>([]);
  const [renderTime, setRenderTime] = useState(0);

  // Performance configuration based on mode
  const getPerformanceConfig = useCallback(
    (mode: string): VirtualRenderConfig => {
      const baseConfig: VirtualRenderConfig = {
        viewportPadding: 200,
        cullingEnabled: true,
        lodEnabled: true,
        lodThresholds: { simple: 0.3, hidden: 0.1 },
        maxShapesPerFrame: 1000,
        batchSize: 50,
        frameTimeTarget: 16.67,
        enableSpatialIndex: true,
        enableOcclusion: false,
        enableMemoryOptimization: true,
        ...virtualRenderConfig,
      };

      switch (mode) {
        case "high":
          return {
            ...baseConfig,
            viewportPadding: 100,
            maxShapesPerFrame: 500,
            batchSize: 25,
            lodThresholds: { simple: 0.5, hidden: 0.2 },
            enableOcclusion: true,
          };

        case "balanced":
          return baseConfig;

        case "compatibility":
          return {
            ...baseConfig,
            cullingEnabled: false,
            lodEnabled: false,
            enableSpatialIndex: false,
          };

        default: // 'auto'
          return baseConfig;
      }
    },
    [virtualRenderConfig]
  );

  // Initialize virtual renderer and performance monitor
  useEffect(() => {
    const config = getPerformanceConfig(currentPerformanceMode);

    virtualRenderer.current = new VirtualRendererImpl(config);
    performanceMonitor.current = new PerformanceMonitorImpl();

    // Start performance monitoring
    performanceMonitor.current.start();

    // Subscribe to performance updates
    const unsubscribe = performanceMonitor.current.subscribe((stats) => {
      setPerformanceStats(stats);

      // Auto performance mode switching
      if (performanceMode === "auto") {
        autoAdjustPerformanceMode(stats);
      }

      // Update optimization hints
      const hints = performanceMonitor.current?.getOptimizationHints();
      if (hints) {
        setOptimizationHints(hints);
      }
    });

    return () => {
      unsubscribe();
      performanceMonitor.current?.stop();
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, [currentPerformanceMode, getPerformanceConfig, performanceMode]);

  // Auto-adjust performance mode based on performance stats
  const autoAdjustPerformanceMode = useCallback(
    (stats: PerformanceStats) => {
      if (performanceMode !== "auto") return;

      const { fps, totalShapes } = stats;

      if (fps < 30 || totalShapes > 1000) {
        setCurrentPerformanceMode("high");
      } else if (fps < 45 || totalShapes > 500) {
        setCurrentPerformanceMode("balanced");
      } else if (fps > 55 && totalShapes < 200) {
        setCurrentPerformanceMode("compatibility");
      }
    },
    [performanceMode]
  );

  // Create viewport from window state
  const viewport = useMemo(
    (): Viewport => ({
      x: window.x1,
      y: window.y1,
      width: window.x2 - window.x1,
      height: window.y2 - window.y1,
      scale: window.percentZoomed,
    }),
    [window]
  );

  // Update viewport in virtual renderer
  useEffect(() => {
    if (virtualRenderer.current) {
      virtualRenderer.current.updateViewport(viewport);
    }
  }, [viewport]);

  // Virtual rendering loop
  useEffect(() => {
    const renderFrame = () => {
      if (!virtualRenderer.current || !performanceMonitor.current) return;

      const startTime = performance.now();

      // Get visible shapes using virtual renderer
      const visible = virtualRenderer.current.getVisibleShapes(shapes);
      setVisibleShapes(visible);

      // Update performance metrics
      const endTime = performance.now();
      const frameTime = endTime - startTime;
      setRenderTime(frameTime);

      const metrics = virtualRenderer.current.getMetrics();
      performanceMonitor.current.updateWithRenderMetrics(metrics);

      // Schedule next frame
      frameId.current = requestAnimationFrame(renderFrame);
    };

    frameId.current = requestAnimationFrame(renderFrame);

    return () => {
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, [shapes]);

  // Render shapes based on performance mode
  const renderShapes = useCallback(() => {
    const shapesToRender =
      currentPerformanceMode === "compatibility" ? shapes : visibleShapes;

    if (
      currentPerformanceMode === "high" ||
      currentPerformanceMode === "balanced"
    ) {
      // Use optimized universal shape renderer
      return (
        <UniversalShapeRenderer
          shapes={shapesToRender}
          viewport={viewport}
          selectedShapes={selectedShapes}
          performanceMode={currentPerformanceMode}
        />
      );
    } else {
      // Use legacy render components for compatibility
      return (
        <>
          <RenderBoxes shapes={shapesToRender} />
          <RenderEllipses shapes={shapesToRender} />
          <RenderText shapes={shapesToRender} />
          <RenderImages shapes={shapesToRender} />
          <RenderCalendars shapes={shapesToRender} />
          <RenderComponents shapes={shapesToRender} />
        </>
      );
    }
  }, [currentPerformanceMode, shapes, visibleShapes, viewport, selectedShapes]);

  // Performance stats overlay
  const renderPerformanceStats = () => {
    if (!showPerformanceStats || !performanceStats) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "10px",
          borderRadius: "5px",
          fontFamily: "monospace",
          fontSize: "12px",
          zIndex: 1000,
          minWidth: "200px",
        }}
      >
        <div>
          <strong>Performance Stats</strong>
        </div>
        <div>FPS: {performanceStats.fps.toFixed(1)}</div>
        <div>Frame Time: {performanceStats.avgFrameTime.toFixed(1)}ms</div>
        <div>
          Visible Shapes: {performanceStats.visibleShapes}/
          {performanceStats.totalShapes}
        </div>
        <div>Culling: {performanceStats.cullingEfficiency.toFixed(1)}%</div>
        <div>Memory: {performanceStats.memoryEfficiency.toFixed(1)}%</div>
        <div>Mode: {currentPerformanceMode}</div>
        <div>Render Time: {renderTime.toFixed(1)}ms</div>

        {optimizationHints && (
          <div style={{ marginTop: "10px", fontSize: "10px" }}>
            <div>
              <strong>Optimization Hints:</strong>
            </div>
            {optimizationHints.shouldUseLOD && (
              <div>• Enable LOD rendering</div>
            )}
            {optimizationHints.shouldCullAggressively && (
              <div>• Increase culling aggressiveness</div>
            )}
            {optimizationHints.shouldBatchRender && (
              <div>• Enable batch rendering</div>
            )}
            {optimizationHints.shouldUseSimpleShapes && (
              <div>• Use simplified shapes</div>
            )}
            <div>
              Potential Gain:{" "}
              {optimizationHints.estimatedPerformanceGain.toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    );
  };

  // Performance warning overlay
  const renderPerformanceWarning = () => {
    if (!performanceStats || performanceStats.fps > 30) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255, 0, 0, 0.9)",
          color: "white",
          padding: "20px",
          borderRadius: "10px",
          textAlign: "center",
          zIndex: 1001,
        }}
      >
        <div>
          <strong>Performance Warning</strong>
        </div>
        <div>Low FPS detected: {performanceStats.fps.toFixed(1)} FPS</div>
        <div>
          Consider reducing complexity or enabling high performance mode
        </div>
      </div>
    );
  };

  return (
    <div
      ref={whiteBoardRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#1a1a1a",
        userSelect: "none",
      }}
    >
      {/* Grid lines */}
      <RenderGridLines />

      {/* Event handler */}
      <ModularEventHandler />

      {/* Shapes */}
      {renderShapes()}

      {/* UI overlays */}
      <RenderBorder />
      <RenderHoverBorder />
      <RenderHighlighting />
      <RenderSnappingGuides />

      {/* Performance overlays */}
      {renderPerformanceStats()}
      {renderPerformanceWarning()}

      {/* Children */}
      {children}
    </div>
  );
};

export default OptimizedWhiteBoard;
