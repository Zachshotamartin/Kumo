import React, { useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "../../store";
import {
  KeyboardShortcutManager,
  ShortcutContext,
} from "../../utils/KeyboardShortcutManager";
import ContextMenu from "../ui/ContextMenu";
import { Shape, ShapeFunctions } from "../../classes/shape";

// Redux actions
import { setSelectedTool } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  clearSelectedShapes,
  setSelectedShapes,
} from "../../features/selected/selectedSlice";
import { setWindow } from "../../features/window/windowSlice";
import {
  undo,
  redo,
  updateHistory,
} from "../../features/shapeHistory/shapeHistorySlice";

// Helpers
import { handleBoardChange } from "../../helpers/handleBoardChange";

interface EnhancedKeyboardHandlerProps {
  children?: React.ReactNode;
}

const EnhancedKeyboardHandler: React.FC<EnhancedKeyboardHandlerProps> = ({
  children,
}) => {
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);
  const history = useSelector((state: any) => state.shapeHistory);
  const window = useSelector((state: any) => state.window);
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);

  // Context menu state
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    items: [],
  });

  // Shortcut manager instance
  const shortcutManager = useRef<KeyboardShortcutManager | null>(null);

  // Internal clipboard for reliable copy/paste
  const clipboard = useRef<Shape[]>([]);

  // Helper function to update board with history
  const updateBoardWithHistory = (
    newShapes: Shape[],
    shouldAddToHistory = true
  ) => {
    const data = { ...board, shapes: newShapes };
    dispatch(setWhiteboardData(data));
    handleBoardChange(data);

    // Add to history after state update
    if (shouldAddToHistory) {
      setTimeout(() => {
        dispatch(updateHistory(newShapes));
      }, 0);
    }
  };

  // Initialize shortcut manager
  useEffect(() => {
    shortcutManager.current = new KeyboardShortcutManager();
    const manager = shortcutManager.current;

    // Register all action handlers
    manager.on("undo", handleUndo);
    manager.on("redo", handleRedo);
    manager.on("copy", handleCopy);
    manager.on("cut", handleCut);
    manager.on("paste", handlePaste);
    manager.on("duplicate", handleDuplicate);
    manager.on("delete", handleDelete);
    manager.on("selectAll", handleSelectAll);
    manager.on("group", handleGroup);
    manager.on("ungroup", handleUngroup);
    manager.on("escape", handleEscape);

    // View controls
    manager.on("zoomIn", handleZoomIn);
    manager.on("zoomOut", handleZoomOut);
    manager.on("zoom100", handleZoom100);
    manager.on("fitToScreen", handleFitToScreen);

    // Tool switching
    manager.on("toolPointer", () => handleToolSwitch("pointer"));
    manager.on("toolRectangle", () => handleToolSwitch("rectangle"));
    manager.on("toolEllipse", () => handleToolSwitch("ellipse"));
    manager.on("toolText", () => handleToolSwitch("text"));
    manager.on("toolImage", () => handleToolSwitch("image"));
    manager.on("cycleTools", handleCycleTools);

    // Navigation
    manager.on("moveUp", (context: ShortcutContext) =>
      handleMoveSelected(0, -1, context)
    );
    manager.on("moveDown", (context: ShortcutContext) =>
      handleMoveSelected(0, 1, context)
    );
    manager.on("moveLeft", (context: ShortcutContext) =>
      handleMoveSelected(-1, 0, context)
    );
    manager.on("moveRight", (context: ShortcutContext) =>
      handleMoveSelected(1, 0, context)
    );
    manager.on("moveUpLarge", (context: ShortcutContext) =>
      handleMoveSelected(0, -10, context)
    );
    manager.on("moveDownLarge", (context: ShortcutContext) =>
      handleMoveSelected(0, 10, context)
    );
    manager.on("moveLeftLarge", (context: ShortcutContext) =>
      handleMoveSelected(-10, 0, context)
    );
    manager.on("moveRightLarge", (context: ShortcutContext) =>
      handleMoveSelected(10, 0, context)
    );

    // File operations (placeholders)
    manager.on("save", handleSave);
    manager.on("new", handleNew);
    manager.on("open", handleOpen);

    return () => {
      // Cleanup listeners
      if (manager) {
        manager.off("undo", handleUndo);
        manager.off("redo", handleRedo);
        // ... (other cleanup would be here in production)
      }
    };
  }, [selectedShapes, shapes, board, history, window, selectedTool]);

  // Action handlers - these receive context with current state
  const handleUndo = (context?: ShortcutContext) => {
    console.log("Undo triggered");
    const currentHistory = context?.canUndo ? history : history;
    if (currentHistory.currentIndex > 0) {
      dispatch(undo());
    }
  };

  const handleRedo = (context?: ShortcutContext) => {
    console.log("Redo triggered");
    const currentHistory = context?.canRedo ? history : history;
    if (currentHistory.currentIndex < currentHistory.history.length - 1) {
      dispatch(redo());
    }
  };

  const handleCopy = (context?: ShortcutContext) => {
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;
    const currentShapes = context?.shapes || shapes;

    console.log("Copy triggered with context:", {
      contextSelectedShapes: context?.selectedShapes?.length || 0,
      fallbackSelectedShapes: selectedShapes.length,
      finalSelectedShapes: currentSelectedShapes.length,
      contextProvided: !!context,
    });

    if (currentSelectedShapes.length > 0) {
      const selectedShapesData = currentShapes.filter((shape: Shape) =>
        currentSelectedShapes.includes(shape.id)
      );

      // Store in internal clipboard
      clipboard.current = JSON.parse(JSON.stringify(selectedShapesData));

      // Also try to store in system clipboard
      try {
        navigator.clipboard.writeText(JSON.stringify(selectedShapesData));
        console.log("Copied to system clipboard");
      } catch (error) {
        console.warn("Could not copy to system clipboard:", error);
      }
    }
  };

  const handleCut = (context?: ShortcutContext) => {
    console.log("Cut triggered");
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;
    if (currentSelectedShapes.length > 0) {
      handleCopy(context);
      handleDelete(context);
    }
  };

  const handlePaste = (context?: ShortcutContext) => {
    console.log(
      "Paste triggered, clipboard has",
      clipboard.current?.length || 0,
      "shapes"
    );

    if (clipboard.current && clipboard.current.length > 0) {
      // Generate new shapes with new IDs and offset positions
      const pasteOffset = 20;
      const newShapes = clipboard.current.map((shape: Shape) => ({
        ...shape,
        id:
          Math.random().toString(36).substring(2, 10) +
          new Date().getTime().toString(36),
        x1: shape.x1 + pasteOffset,
        y1: shape.y1 + pasteOffset,
        x2: shape.x2 + pasteOffset,
        y2: shape.y2 + pasteOffset,
      }));

      const updatedShapes = [...shapes, ...newShapes];
      const data = { ...board, shapes: updatedShapes };

      dispatch(setWhiteboardData(data));
      handleBoardChange(data);

      // Select the newly pasted shapes
      dispatch(setSelectedShapes(newShapes.map((shape: Shape) => shape.id)));

      // Update history after state changes
      setTimeout(() => {
        dispatch(updateHistory(updatedShapes));
      }, 0);

      console.log("Pasted", newShapes.length, "shapes");
    } else {
      console.log("No shapes in clipboard to paste");
    }
  };

  const handleDuplicate = (context?: ShortcutContext) => {
    console.log("Duplicate triggered");
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;
    const currentShapes = context?.shapes || shapes;

    if (currentSelectedShapes.length > 0) {
      const selectedShapesData = currentShapes.filter((shape: Shape) =>
        currentSelectedShapes.includes(shape.id)
      );

      // Generate new shapes with new IDs and offset positions
      const pasteOffset = 20;
      const newShapes = selectedShapesData.map((shape: Shape) => ({
        ...shape,
        id:
          Math.random().toString(36).substring(2, 10) +
          new Date().getTime().toString(36),
        x1: shape.x1 + pasteOffset,
        y1: shape.y1 + pasteOffset,
        x2: shape.x2 + pasteOffset,
        y2: shape.y2 + pasteOffset,
      }));

      const updatedShapes = [...shapes, ...newShapes];
      const data = { ...board, shapes: updatedShapes };

      dispatch(setWhiteboardData(data));
      handleBoardChange(data);

      // Select the newly duplicated shapes
      dispatch(setSelectedShapes(newShapes.map((shape: Shape) => shape.id)));

      // Update history after state changes
      setTimeout(() => {
        dispatch(updateHistory(updatedShapes));
      }, 0);
    }
  };

  const handleDelete = (context?: ShortcutContext) => {
    console.log("Delete triggered");
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;

    if (currentSelectedShapes.length > 0) {
      const remainingShapes = shapes.filter(
        (shape: Shape) => !currentSelectedShapes.includes(shape.id)
      );

      const data = { ...board, shapes: remainingShapes };
      dispatch(setWhiteboardData(data));
      handleBoardChange(data);
      dispatch(clearSelectedShapes());

      // Update history after state changes
      setTimeout(() => {
        dispatch(updateHistory(remainingShapes));
      }, 0);
    }
  };

  const handleSelectAll = (context?: ShortcutContext) => {
    console.log("Select All triggered");
    const currentShapes = context?.shapes || shapes;
    const allShapeIds = currentShapes.map((shape: Shape) => shape.id);
    dispatch(setSelectedShapes(allShapeIds));
  };

  const handleGroup = (context?: ShortcutContext) => {
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;
    const currentShapes = context?.shapes || shapes;

    if (currentSelectedShapes.length > 1) {
      const selectedShapesArray = currentShapes.filter((shape: Shape) =>
        currentSelectedShapes.includes(shape.id)
      );
      const newShapes = ShapeFunctions.createComponent(
        selectedShapesArray,
        currentSelectedShapes,
        currentShapes
      );

      const data = { ...board, shapes: newShapes };
      dispatch(setWhiteboardData(data));
      handleBoardChange(data);

      // Select the new component
      const component = newShapes.find((shape) => shape.type === "component");
      if (component) {
        dispatch(setSelectedShapes([component.id]));
      }

      // Update history after state changes
      setTimeout(() => {
        dispatch(updateHistory(newShapes));
      }, 0);
    }
  };

  const handleUngroup = (context?: ShortcutContext) => {
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;
    const currentShapes = context?.shapes || shapes;

    if (currentSelectedShapes.length === 1) {
      const shape = currentShapes.find(
        (s: Shape) => s.id === currentSelectedShapes[0]
      );
      if (shape && ShapeFunctions.canUngroup(shape)) {
        const newShapes = ShapeFunctions.ungroupComponent(shape, currentShapes);

        const data = { ...board, shapes: newShapes };
        dispatch(setWhiteboardData(data));
        handleBoardChange(data);

        // Select the ungrouped shapes
        const extractedShapeIds = shape.shapes?.map((s: Shape) => s.id) || [];
        dispatch(setSelectedShapes(extractedShapeIds));

        // Update history after state changes
        setTimeout(() => {
          dispatch(updateHistory(newShapes));
        }, 0);
      }
    }
  };

  const handleEscape = () => {
    dispatch(clearSelectedShapes());
    setContextMenu({ visible: false, x: 0, y: 0, items: [] });
  };

  // View controls
  const handleZoomIn = () => {
    const newZoom = Math.min(window.percentZoomed * 1.2, 4);
    const centerX = (window.x1 + window.x2) / 2;
    const centerY = (window.y1 + window.y2) / 2;
    const scaleFactor = newZoom / window.percentZoomed;

    const newWindow = {
      x1: Math.round(centerX - (centerX - window.x1) * scaleFactor),
      y1: Math.round(centerY - (centerY - window.y1) * scaleFactor),
      x2: Math.round(centerX + (window.x2 - centerX) * scaleFactor),
      y2: Math.round(centerY + (window.y2 - centerY) * scaleFactor),
      percentZoomed: newZoom,
    };
    dispatch(setWindow(newWindow));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(window.percentZoomed / 1.2, 0.1);
    const centerX = (window.x1 + window.x2) / 2;
    const centerY = (window.y1 + window.y2) / 2;
    const scaleFactor = newZoom / window.percentZoomed;

    const newWindow = {
      x1: Math.round(centerX - (centerX - window.x1) * scaleFactor),
      y1: Math.round(centerY - (centerY - window.y1) * scaleFactor),
      x2: Math.round(centerX + (window.x2 - centerX) * scaleFactor),
      y2: Math.round(centerY + (window.y2 - centerY) * scaleFactor),
      percentZoomed: newZoom,
    };
    dispatch(setWindow(newWindow));
  };

  const handleZoom100 = () => {
    const centerX = (window.x1 + window.x2) / 2;
    const centerY = (window.y1 + window.y2) / 2;
    const scaleFactor = 1 / window.percentZoomed;

    const newWindow = {
      x1: Math.round(centerX - (centerX - window.x1) * scaleFactor),
      y1: Math.round(centerY - (centerY - window.y1) * scaleFactor),
      x2: Math.round(centerX + (window.x2 - centerX) * scaleFactor),
      y2: Math.round(centerY + (window.y2 - centerY) * scaleFactor),
      percentZoomed: 1,
    };
    dispatch(setWindow(newWindow));
  };

  const handleFitToScreen = () => {
    if (shapes.length === 0) return;

    // Calculate bounds of all shapes
    const minX = Math.min(...shapes.map((s: Shape) => Math.min(s.x1, s.x2)));
    const maxX = Math.max(...shapes.map((s: Shape) => Math.max(s.x1, s.x2)));
    const minY = Math.min(...shapes.map((s: Shape) => Math.min(s.y1, s.y2)));
    const maxY = Math.max(...shapes.map((s: Shape) => Math.max(s.y1, s.y2)));

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const padding = 100;

    // Calculate zoom to fit content
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const zoomX = (viewportWidth - padding * 2) / contentWidth;
    const zoomY = (viewportHeight - padding * 2) / contentHeight;
    const zoom = Math.min(zoomX, zoomY, 2); // Cap at 200%

    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const halfViewportWidth = viewportWidth / 2 / zoom;
    const halfViewportHeight = viewportHeight / 2 / zoom;

    const newWindow = {
      x1: Math.round(centerX - halfViewportWidth),
      y1: Math.round(centerY - halfViewportHeight),
      x2: Math.round(centerX + halfViewportWidth),
      y2: Math.round(centerY + halfViewportHeight),
      percentZoomed: zoom,
    };
    dispatch(setWindow(newWindow));
  };

  // Tool switching
  const handleToolSwitch = (tool: string) => {
    dispatch(setSelectedTool(tool));
  };

  const handleCycleTools = () => {
    const tools = ["pointer", "rectangle", "ellipse", "text", "image"];
    const currentIndex = Math.max(0, tools.indexOf(selectedTool || "pointer"));
    const nextIndex = (currentIndex + 1) % tools.length;
    const nextTool = tools[nextIndex] || "pointer";
    dispatch(setSelectedTool(nextTool));
  };

  // Navigation
  const handleMoveSelected = (
    deltaX: number,
    deltaY: number,
    context?: ShortcutContext
  ) => {
    const currentSelectedShapes = context?.selectedShapes || selectedShapes;
    const currentShapes = context?.shapes || shapes;

    if (currentSelectedShapes.length === 0) return;

    const selectedShapesData = currentShapes.filter((shape: Shape) =>
      currentSelectedShapes.includes(shape.id)
    );

    const movedShapes = selectedShapesData.map((shape: Shape) =>
      ShapeFunctions.moveShape(shape, deltaX, deltaY)
    );

    const updatedShapes = currentShapes.map((shape: Shape) => {
      const movedShape = movedShapes.find((ms: Shape) => ms.id === shape.id);
      return movedShape || shape;
    });

    const data = { ...board, shapes: updatedShapes };
    dispatch(setWhiteboardData(data));
    handleBoardChange(data);

    // Update history after state changes
    setTimeout(() => {
      dispatch(updateHistory(updatedShapes));
    }, 0);
  };

  // File operations (placeholder implementations)
  const handleSave = () => {
    console.log("Save shortcut triggered");
    // Implement save functionality
  };

  const handleNew = () => {
    console.log("New board shortcut triggered");
    // Implement new board functionality
  };

  const handleOpen = () => {
    console.log("Open board shortcut triggered");
    // Implement open board functionality
  };

  // Context menu handlers
  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();

    if (!shortcutManager.current) return;

    const context: ShortcutContext = {
      selectedShapes,
      shapes,
      canUndo: history.currentIndex > 0,
      canRedo: history.currentIndex < history.history.length - 1,
      clipboard: clipboard.current,
      zoom: window.percentZoomed,
      isInputFocused: false,
    };

    const items = shortcutManager.current.generateContextMenu(context);

    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      items: items as any,
    });
  };

  const handleContextMenuAction = (action: string) => {
    if (!shortcutManager.current) return;

    console.log("Context menu action:", action);

    const context: ShortcutContext = {
      selectedShapes,
      shapes,
      canUndo: history.currentIndex > 0,
      canRedo: history.currentIndex < history.history.length - 1,
      clipboard: clipboard.current,
      zoom: window.percentZoomed,
      isInputFocused: false,
    };

    // Use triggerAction instead of private executeAction
    shortcutManager.current.triggerAction(action, context);
  };

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shortcutManager.current) return;

      // Check if we're in an input element
      const target = event.target as HTMLElement;
      const isInputFocused =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const context: ShortcutContext = {
        selectedShapes,
        shapes,
        canUndo: history.currentIndex > 0,
        canRedo: history.currentIndex < history.history.length - 1,
        clipboard: clipboard.current,
        zoom: window.percentZoomed,
        isInputFocused,
      };

      const handled = shortcutManager.current.handleKeyDown(event, context);

      if (handled) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedShapes, shapes, history, window, clipboard.current]);

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        style={{ width: "100%", height: "100%" }}
      >
        {children}
      </div>

      <ContextMenu
        items={contextMenu.items}
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onItemClick={handleContextMenuAction}
        onClose={() =>
          setContextMenu({ visible: false, x: 0, y: 0, items: [] })
        }
      />
    </>
  );
};

export default EnhancedKeyboardHandler;
