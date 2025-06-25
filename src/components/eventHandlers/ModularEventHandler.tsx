import React, { useRef, useCallback, useEffect } from "react";
import { throttle } from "lodash";
import { useSelector, useDispatch } from "react-redux";

// Import tool system
import { ToolRegistryImpl } from "../../tools/core/ToolRegistry";
import { EventBusImpl } from "../../tools/core/EventBus";
import { PointerToolHandler } from "../../tools/handlers/PointerToolHandler";
import {
  createRectangleToolHandler,
  createEllipseToolHandler,
  createTextToolHandler,
  createCalendarToolHandler,
  createImageToolHandler,
} from "../../tools/handlers/ShapeCreationToolHandler";

import {
  ToolType,
  MouseEventData,
  WheelEventData,
  ToolContext,
  InteractionState,
} from "../../tools/types";

// Import existing utilities and actions
import { setWindow, WindowState } from "../../features/window/windowSlice";
import { Shape, ShapeFunctions } from "../../classes/shape";
import { changeCursor } from "../../helpers/cursorHelper";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import {
  setSelectedShapes,
  clearSelectedShapes,
  setSelectedTool,
} from "../../features/selected/selectedSlice";

import WhiteBoard from "../whiteBoard/whiteBoard";
import ContextMenu from "../ui/ContextMenu";
import {
  KeyboardShortcutManager,
  ShortcutContext,
} from "../../utils/KeyboardShortcutManager";

// Initialize tool system
const eventBus = new EventBusImpl();
const toolRegistry = new ToolRegistryImpl(eventBus);
const shortcutManager = new KeyboardShortcutManager();

// Register all tool handlers
toolRegistry.register(new PointerToolHandler());
toolRegistry.register(createRectangleToolHandler());
toolRegistry.register(createEllipseToolHandler());
toolRegistry.register(createTextToolHandler());
toolRegistry.register(createCalendarToolHandler());
toolRegistry.register(createImageToolHandler());

// Set default active tool
toolRegistry.setActiveHandler(ToolType.POINTER);

const ModularEventHandler: React.FC = () => {
  const dispatch = useDispatch();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Selectors
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);
  const window = useSelector((state: any) => state.window);
  const user = useSelector((state: any) => state.auth);

  // Context menu state
  const [contextMenuState, setContextMenuState] = React.useState({
    visible: false,
    x: 0,
    y: 0,
    items: [] as any[],
  });

  // Register action handlers for context menu functionality
  React.useEffect(() => {
    // These action handlers are now handled by EnhancedKeyboardHandler
    // to avoid conflicts and ensure consistent behavior

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Create tool context
  const createToolContext = useCallback(
    (): ToolContext => ({
      shapes,
      selectedShapes,
      window,
      user,
      board,
      dispatch,

      gridSnapping: {
        enabled: false,
        snapToGrid: (point) => point,
        getSnapDistance: () => 20,
      },

      shapeUtils: {
        createShape: (type: string, point) => {
          return ShapeFunctions.createShape(type, point.x, point.y, shapes);
        },
        moveShape: (shape, offset) => {
          return ShapeFunctions.moveShape(shape, offset.x, offset.y);
        },
        resizeShape: (shape, bounds, offset, direction) => {
          return shape;
        },
        findShapeAt: (point) => {
          return shapes
            .slice()
            .reverse()
            .find(
              (shape: Shape) =>
                point.x >= Math.min(shape.x1, shape.x2) &&
                point.x <= Math.max(shape.x1, shape.x2) &&
                point.y >= Math.min(shape.y1, shape.y2) &&
                point.y <= Math.max(shape.y1, shape.y2)
            );
        },
        findShapesInBounds: (bounds) => {
          return shapes.filter((shape: Shape) => {
            const shapeCenter = {
              x: (shape.x1 + shape.x2) / 2,
              y: (shape.y1 + shape.y2) / 2,
            };
            return (
              shapeCenter.x >= bounds.startX &&
              shapeCenter.x <= bounds.endX &&
              shapeCenter.y >= bounds.startY &&
              shapeCenter.y <= bounds.endY
            );
          });
        },
        getShapeBounds: (shapes) => {
          if (shapes.length === 0) {
            return { startX: 0, startY: 0, endX: 0, endY: 0 };
          }

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          shapes.forEach((shape: Shape) => {
            minX = Math.min(minX, Math.min(shape.x1, shape.x2));
            minY = Math.min(minY, Math.min(shape.y1, shape.y2));
            maxX = Math.max(maxX, Math.max(shape.x1, shape.x2));
            maxY = Math.max(maxY, Math.max(shape.y1, shape.y2));
          });

          return { startX: minX, startY: minY, endX: maxX, endY: maxY };
        },
      },

      cursorUtils: {
        setCursor: (cursor) => {
          if (canvasRef.current) {
            canvasRef.current.style.cursor = cursor;
          }
        },
        resetCursor: () => {
          if (canvasRef.current) {
            canvasRef.current.style.cursor = "default";
          }
        },
      },

      historyUtils: {
        saveSnapshot: () => {
          // TODO: Implement history saving
        },
        undo: () => {
          // TODO: Implement undo
        },
        redo: () => {
          // TODO: Implement redo
        },
      },

      contextMenu: {
        show: (point, items) => {
          setContextMenuState({
            visible: true,
            x: point.x,
            y: point.y,
            items,
          });
        },
        hide: () => {
          setContextMenuState((prev) => ({ ...prev, visible: false }));
        },
      },
    }),
    [shapes, selectedShapes, window, user, board, dispatch]
  );

  // Update tool context when dependencies change
  useEffect(() => {
    const context = createToolContext();
    toolRegistry.setContext(context);
  }, [createToolContext]);

  // Update active tool when selected tool changes
  useEffect(() => {
    if (selectedTool && toolRegistry.isRegistered(selectedTool as ToolType)) {
      toolRegistry.setActiveHandler(selectedTool as ToolType);
    }
  }, [selectedTool]);

  // Utility functions
  const getMousePosition = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const boundingRect = canvasRef.current?.getBoundingClientRect();
      const x = Math.round(
        (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
          window.x1
      );
      const y = Math.round(
        (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
          window.y1
      );
      return { x, y };
    },
    [window]
  );

  const getAbsoluteMousePosition = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const boundingRect = canvasRef.current?.getBoundingClientRect();
      const x = Math.round(
        (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed
      );
      const y = Math.round(
        (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed
      );
      return { x, y };
    },
    [window]
  );

  const createMouseEventData = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): MouseEventData => {
      const point = getMousePosition(e);
      const absolutePoint = getAbsoluteMousePosition(e);

      return {
        point,
        absolutePoint,
        button: e.button,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      };
    },
    [getMousePosition, getAbsoluteMousePosition]
  );

  // Event handlers using tool system
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const activeHandler = toolRegistry.getActiveHandler();
      if (!activeHandler) return;

      const context = createToolContext();
      const eventData = createMouseEventData(e);
      const result = activeHandler.onMouseDown(eventData, context);

      if (result.handled) {
        if (result.preventDefault) e.preventDefault();
        if (result.stopPropagation) e.stopPropagation();
        if (result.cursor) {
          context.cursorUtils.setCursor(result.cursor);
        }

        // Process actions
        result.actions?.forEach((action) => {
          dispatch(action);
        });
      }
    },
    [createToolContext, createMouseEventData, dispatch]
  );

  const handleMouseMove = useCallback(
    throttle((e: React.MouseEvent<HTMLDivElement>) => {
      const activeHandler = toolRegistry.getActiveHandler();
      if (!activeHandler) return;

      const context = createToolContext();
      const eventData = createMouseEventData(e);
      const result = activeHandler.onMouseMove(eventData, context);

      if (result.handled) {
        if (result.cursor) {
          context.cursorUtils.setCursor(result.cursor);
        }

        // Process actions
        result.actions?.forEach((action) => {
          dispatch(action);
        });
      }
    }, 16),
    [createToolContext, createMouseEventData, dispatch]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const activeHandler = toolRegistry.getActiveHandler();
      if (!activeHandler) return;

      const context = createToolContext();
      const eventData = createMouseEventData(e);
      const result = activeHandler.onMouseUp(eventData, context);

      if (result.handled) {
        if (result.cursor) {
          context.cursorUtils.setCursor(result.cursor);
        }

        // Process actions
        result.actions?.forEach((action) => {
          dispatch(action);
        });
      }
    },
    [createToolContext, createMouseEventData, dispatch]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const activeHandler = toolRegistry.getActiveHandler();
      if (!activeHandler?.onDoubleClick) return;

      const context = createToolContext();
      const eventData = createMouseEventData(e);
      const result = activeHandler.onDoubleClick(eventData, context);

      if (result.handled) {
        // Process actions
        result.actions?.forEach((action) => {
          dispatch(action);
        });
      }
    },
    [createToolContext, createMouseEventData, dispatch]
  );

  // Wheel handler for zoom/pan
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const deltaY = e.deltaY;
      const { x, y } = getMousePosition(e);

      if (e.metaKey || e.ctrlKey) {
        // Zoom logic
        const zoomFactor = deltaY > 0 ? 1.1 : 0.9;
        const cursorX = x;
        const cursorY = y;

        if (
          window.percentZoomed * zoomFactor < 4 &&
          window.percentZoomed * zoomFactor > 0.05
        ) {
          const newWindow: WindowState = {
            x1: Math.round(cursorX - (cursorX - window.x1) * zoomFactor),
            y1: Math.round(cursorY - (cursorY - window.y1) * zoomFactor),
            x2: Math.round(cursorX + (window.x2 - cursorX) * zoomFactor),
            y2: Math.round(cursorY + (window.y2 - cursorY) * zoomFactor),
            percentZoomed: window.percentZoomed * zoomFactor,
          };
          dispatch(setWindow(newWindow));
        }
      } else {
        // Pan logic
        const deltaX = e.deltaX * window.percentZoomed;
        const deltaYScaled = deltaY * window.percentZoomed;

        const newWindow: WindowState = {
          x1: window.x1 + deltaX,
          y1: window.y1 + deltaYScaled,
          x2: window.x2 + deltaX,
          y2: window.y2 + deltaYScaled,
          percentZoomed: window.percentZoomed,
        };
        dispatch(setWindow(newWindow));
      }
    },
    [getMousePosition, window, dispatch]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
    },
    []
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenuState((prev) => ({ ...prev, visible: false }));
  }, []);

  return (
    <div
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          color: "white",
          fontSize: "12px",
          pointerEvents: "none",
        }}
      >
        <p>
          Position: {window.x1}, {window.y1}
        </p>
        <p>Zoom: {Math.round(window.percentZoomed * 100)}%</p>
        <p>
          Active Tool: {toolRegistry.getActiveHandler()?.toolType || "None"}
        </p>
      </div>

      {contextMenuState.visible && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuState.items.map((labelObj) => ({
            ...labelObj,
            action: labelObj.label, // Use label as action for now
          }))}
          visible={contextMenuState.visible}
          onItemClick={(action) => {
            // Build context for KeyboardShortcutManager
            const context: ShortcutContext = {
              selectedShapes,
              shapes,
              canUndo: false, // Add real undo/redo state if available
              canRedo: false,
              clipboard: null, // If you have a clipboard ref, use it here
              zoom: window.percentZoomed,
              isInputFocused: false,
            };
            // Use the new public triggerAction method
            shortcutManager.triggerAction(action, context);
            handleContextMenuClose();
          }}
          onClose={handleContextMenuClose}
        />
      )}

      <WhiteBoard />
    </div>
  );
};

export default ModularEventHandler;
