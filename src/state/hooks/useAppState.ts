import { useSelector, useDispatch } from "react-redux";
import { useCallback, useEffect, useMemo } from "react";
import {
  RootState,
  AppDispatch,
  appActions,
  whiteboardActions,
  performanceActions,
  getComputedState,
} from "../store/simplifiedStore";
import {
  StateMachineContext,
  StateEvent,
  Point,
  AppMode,
  ToolState,
  InteractionState,
} from "../types";

/**
 * Simplified React Hooks for Kumo State Management
 *
 * Provides clean, type-safe access to:
 * - State machine context
 * - Consolidated data domains
 * - Computed state
 * - Action dispatchers
 */

// ===================
// CORE STATE HOOKS
// ===================

/**
 * Main hook for application state machine
 */
export const useAppState = () => {
  const dispatch = useDispatch<AppDispatch>();
  const appState = useSelector((state: RootState) => state.app);
  const computedState = useSelector((state: RootState) => {
    // Create a simple computed state object
    const selectedShapes = state.app.selectedShapes;
    return {
      selectionBounds: null, // TODO: Calculate from selected shapes
      canUndo: false, // TODO: Implement undo/redo logic
      canRedo: false,
      selectionCenter: { x: 0, y: 0 },
      selectionSize: { width: 0, height: 0 },
      isEditing: false,
      hasUnsavedChanges: false,
    };
  });

  const fullAppState = {
    app: appState,
    whiteboard: useSelector((state: RootState) => state.whiteboard),
    auth: useSelector((state: RootState) => state.auth),
    collaboration: useSelector((state: RootState) => state.collaboration),
    performance: useSelector((state: RootState) => state.performance),
    computed: computedState,
  };

  const actions = useMemo(
    () => ({
      // Tool selection
      selectTool: (tool: ToolState) => {
        dispatch(appActions.selectTool(tool));
      },

      // Mouse events
      handleMouseDown: (position: Point, target?: string) => {
        dispatch(appActions.mouseDown({ position, target }));
      },

      handleMouseMove: (position: Point, delta: Point = { x: 0, y: 0 }) => {
        dispatch(appActions.mouseMove({ position, delta }));
      },

      handleMouseUp: (position: Point) => {
        dispatch(appActions.mouseUp(position));
      },

      // Keyboard events
      handleKeyDown: (key: string, modifiers: any = {}) => {
        dispatch(appActions.keyDown({ key, modifiers }));
      },

      // Shape selection
      selectShapes: (shapeIds: string[]) => {
        dispatch(appActions.selectShapes(shapeIds));
      },

      // Viewport
      panViewport: (delta: Point) => {
        dispatch(appActions.panViewport(delta));
      },

      zoomViewport: (scale: number, center: Point) => {
        dispatch(appActions.zoomViewport({ scale, center }));
      },

      // UI controls
      toggleUI: (element: keyof StateMachineContext["ui"]) => {
        dispatch(appActions.toggleUI(element));
      },

      // Custom event
      sendEvent: (event: StateEvent) => {
        dispatch(appActions.sendEvent(event));
      },
    }),
    [dispatch]
  );

  return {
    // Current state
    mode: appState.mode,
    tool: appState.tool,
    interaction: appState.interaction,
    selectedShapes: appState.selectedShapes,
    hoveredShape: appState.hoveredShape,
    mousePosition: appState.mousePosition,
    mouseDown: appState.mouseDown,
    viewport: appState.viewport,
    ui: appState.ui,
    operation: appState.operation,

    // Computed state
    computed: computedState,

    // Actions
    actions,

    // Convenience getters
    isDrawing: appState.mode === "drawing",
    isDragging: appState.mode === "dragging",
    isResizing: appState.mode === "resizing",
    isSelecting: appState.mode === "selecting",
    isEditing: appState.mode === "editing",
    hasSelection: appState.selectedShapes.length > 0,
    canUndo: computedState.canUndo,
    canRedo: computedState.canRedo,
  };
};

/**
 * Hook for whiteboard data
 */
export const useWhiteboard = () => {
  const dispatch = useDispatch<AppDispatch>();
  const whiteboard = useSelector((state: RootState) => state.whiteboard);

  const actions = useMemo(
    () => ({
      updateShapes: (shapes: any[]) => {
        dispatch(whiteboardActions.updateShapes(shapes));
      },

      addShape: (shape: any) => {
        dispatch(whiteboardActions.addShape(shape));
      },

      updateShape: (id: string, updates: any) => {
        dispatch(whiteboardActions.updateShape({ id, updates }));
      },

      deleteShapes: (shapeIds: string[]) => {
        dispatch(whiteboardActions.deleteShapes(shapeIds));
      },

      undo: () => {
        dispatch(whiteboardActions.undo());
      },

      redo: () => {
        dispatch(whiteboardActions.redo());
      },

      updateSettings: (settings: Partial<typeof whiteboard.settings>) => {
        dispatch(whiteboardActions.updateSettings(settings));
      },
    }),
    [dispatch]
  );

  return {
    ...whiteboard,
    actions,
  };
};

/**
 * Hook for performance monitoring
 */
export const usePerformance = () => {
  const dispatch = useDispatch<AppDispatch>();
  const performance = useSelector((state: RootState) => state.performance);

  const actions = useMemo(
    () => ({
      updateMetrics: (metrics: Partial<typeof performance>) => {
        dispatch(performanceActions.updatePerformanceMetrics(metrics));
      },

      addWarning: (warning: string) => {
        dispatch(performanceActions.addWarning(warning));
      },

      clearWarnings: () => {
        dispatch(performanceActions.clearWarnings());
      },
    }),
    [dispatch]
  );

  return {
    ...performance,
    actions,
  };
};

// ===================
// SPECIALIZED HOOKS
// ===================

/**
 * Hook for mouse and keyboard interactions
 */
export const useInteractions = () => {
  const { actions, mode, tool, mousePosition, mouseDown } = useAppState();

  const handleMouseEvent = useCallback(
    (event: React.MouseEvent, eventType: "down" | "move" | "up") => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const position: Point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const target = (event.target as HTMLElement).id || undefined;

      switch (eventType) {
        case "down":
          actions.handleMouseDown(position, target);
          break;
        case "move":
          const delta = mouseDown
            ? {
                x: position.x - mousePosition.x,
                y: position.y - mousePosition.y,
              }
            : { x: 0, y: 0 };
          actions.handleMouseMove(position, delta);
          break;
        case "up":
          actions.handleMouseUp(position);
          break;
      }
    },
    [actions, mousePosition, mouseDown]
  );

  const handleKeyEvent = useCallback(
    (event: React.KeyboardEvent) => {
      const modifiers = {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
      };

      actions.handleKeyDown(event.key, modifiers);
    },
    [actions]
  );

  return {
    handleMouseDown: (event: React.MouseEvent) =>
      handleMouseEvent(event, "down"),
    handleMouseMove: (event: React.MouseEvent) =>
      handleMouseEvent(event, "move"),
    handleMouseUp: (event: React.MouseEvent) => handleMouseEvent(event, "up"),
    handleKeyDown: handleKeyEvent,

    // Current interaction state
    mode,
    tool,
    mousePosition,
    mouseDown,
  };
};

/**
 * Hook for viewport controls
 */
export const useViewport = () => {
  const { viewport, actions } = useAppState();

  const pan = useCallback(
    (deltaX: number, deltaY: number) => {
      actions.panViewport({ x: deltaX, y: deltaY });
    },
    [actions]
  );

  const zoom = useCallback(
    (
      scale: number,
      centerX: number = viewport.width / 2,
      centerY: number = viewport.height / 2
    ) => {
      actions.zoomViewport(scale, { x: centerX, y: centerY });
    },
    [actions, viewport]
  );

  const zoomIn = useCallback(() => {
    zoom(viewport.scale * 1.2);
  }, [zoom, viewport.scale]);

  const zoomOut = useCallback(() => {
    zoom(viewport.scale / 1.2);
  }, [zoom, viewport.scale]);

  const resetZoom = useCallback(() => {
    zoom(1);
  }, [zoom]);

  const fitToScreen = useCallback(() => {
    // TODO: Calculate fit based on shapes
    zoom(1);
  }, [zoom]);

  return {
    viewport,
    actions: {
      pan,
      zoom,
      zoomIn,
      zoomOut,
      resetZoom,
      fitToScreen,
    },
  };
};

/**
 * Hook for shape selection and manipulation
 */
export const useShapeSelection = () => {
  const { selectedShapes, computed, actions } = useAppState();
  const { shapes } = useWhiteboard();

  const selectedShapeObjects = useMemo(() => {
    return shapes.filter((shape) => selectedShapes.includes(shape.id));
  }, [shapes, selectedShapes]);

  const selectShape = useCallback(
    (shapeId: string, addToSelection = false) => {
      if (addToSelection) {
        const newSelection = selectedShapes.includes(shapeId)
          ? selectedShapes.filter((id) => id !== shapeId)
          : [...selectedShapes, shapeId];
        actions.selectShapes(newSelection);
      } else {
        actions.selectShapes([shapeId]);
      }
    },
    [selectedShapes, actions]
  );

  const selectMultiple = useCallback(
    (shapeIds: string[]) => {
      actions.selectShapes(shapeIds);
    },
    [actions]
  );

  const clearSelection = useCallback(() => {
    actions.selectShapes([]);
  }, [actions]);

  const selectAll = useCallback(() => {
    actions.selectShapes(shapes.map((s) => s.id));
  }, [actions, shapes]);

  return {
    selectedShapes,
    selectedShapeObjects,
    selectionBounds: computed.selectionBounds,
    hasSelection: selectedShapes.length > 0,
    isMultiSelection: selectedShapes.length > 1,

    actions: {
      selectShape,
      selectMultiple,
      clearSelection,
      selectAll,
    },
  };
};

// ===================
// LEGACY COMPATIBILITY HOOKS
// ===================

/**
 * Legacy compatibility hook - provides old action interface
 *
 * @deprecated Use useAppState instead
 */
export const useLegacyActions = () => {
  const dispatch = useDispatch<AppDispatch>();

  console.warn("useLegacyActions is deprecated. Use useAppState instead.");

  return {
    // Boolean flag setters (deprecated)
    setDrawing: (value: boolean) => {
      if (value) {
        dispatch(appActions.selectTool("rectangle"));
      } else {
        dispatch(appActions.sendEvent({ type: "ESC_PRESSED" }));
      }
    },

    setDragging: (value: boolean) => {
      console.warn("setDragging is deprecated - state managed automatically");
    },

    setResizing: (value: boolean) => {
      console.warn("setResizing is deprecated - state managed automatically");
    },

    setHighlighting: (value: boolean) => {
      console.warn("setHighlighting is deprecated - use selectShapes");
    },

    setMouseDown: (value: boolean) => {
      console.warn("setMouseDown is deprecated - use mouse event handlers");
    },

    // Tool selection (compatible)
    setSelectedTool: (tool: string) => {
      dispatch(appActions.selectTool(tool as ToolState));
    },

    // Shape selection (compatible)
    setSelectedShapes: (shapes: string[]) => {
      dispatch(appActions.selectShapes(shapes));
    },
  };
};

/**
 * Legacy selector hook - provides old state structure
 *
 * @deprecated Use useAppState instead
 */
export const useLegacySelectors = () => {
  const appState = useSelector((state: RootState) => state.app);

  console.warn("useLegacySelectors is deprecated. Use useAppState instead.");

  return {
    // Legacy boolean flags (derived from state machine)
    drawing: appState.mode === "drawing",
    dragging: appState.mode === "dragging",
    resizing: appState.mode === "resizing",
    highlighting: appState.mode === "selecting",
    mouseDown: appState.mouseDown,

    // Tool and selection (compatible)
    selectedTool: appState.tool,
    selectedShapes: appState.selectedShapes,

    // UI state (compatible)
    grid: appState.ui.grid,
    settingsOpen: appState.ui.settingsPanel,
    userOpen: appState.ui.userPanel,
  };
};

// ===================
// UTILITY HOOKS
// ===================

/**
 * Hook for debugging state machine transitions
 */
export const useStateDebug = () => {
  const appState = useSelector((state: RootState) => state.app);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[State Debug]", {
        mode: appState.mode,
        tool: appState.tool,
        interaction: appState.interaction,
        hasSelection: appState.selectedShapes.length > 0,
        operation: appState.operation?.type,
      });
    }
  }, [
    appState.mode,
    appState.tool,
    appState.interaction,
    appState.selectedShapes.length,
    appState.operation,
  ]);

  return {
    currentState: {
      mode: appState.mode,
      tool: appState.tool,
      interaction: appState.interaction,
    },
    selectedCount: appState.selectedShapes.length,
    hasOperation: !!appState.operation,
  };
};

/**
 * Hook that provides performance optimizations based on app state
 */
export const usePerformanceOptimizations = () => {
  const { mode, tool, selectedShapes } = useAppState();
  const { fps, shapesTotal } = usePerformance();

  const shouldOptimize = useMemo(
    () => ({
      // Reduce updates during intensive operations
      reduceUpdates:
        mode === "drawing" || mode === "dragging" || mode === "resizing",

      // Use simplified rendering when appropriate
      useSimpleRendering: fps < 30 || shapesTotal > 1000,

      // Disable expensive features during interactions
      disableSnapGuides: mode === "drawing" && shapesTotal > 100,
      disableHoverEffects: fps < 45,

      // Batch operations
      batchShapeUpdates: selectedShapes.length > 10,

      // Memory management
      enableGarbageCollection: mode === "viewing" && fps > 50,
    }),
    [mode, tool, selectedShapes.length, fps, shapesTotal]
  );

  return shouldOptimize;
};
