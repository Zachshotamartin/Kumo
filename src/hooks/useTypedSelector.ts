/**
 * Type-Safe Redux Hooks
 *
 * Provides strongly typed access to Redux state, replacing all
 * `(state: any)` useSelector calls with proper TypeScript types.
 */

import { useSelector, TypedUseSelectorHook } from "react-redux";
import { createSelector } from "@reduxjs/toolkit";
import {
  RootState,
  KumoShape,
  User,
  BoardInfo,
  ToolType,
  ToolOptions,
  Point,
  BoundingBox,
  SelectionState,
  WindowState,
  SideBarState,
  ActionState,
  BoardImagesSliceState,
} from "../types";

// ===================
// TYPED SELECTOR HOOK
// ===================

/**
 * Type-safe useSelector hook
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ===================
// MEMOIZED SELECTORS
// ===================

// Authentication selectors
export const selectAuth = createSelector(
  [(state: RootState) => state.auth],
  (auth) => auth
);

export const selectUser = createSelector(
  [(state: RootState) => state.auth.user],
  (user) => user
);

export const selectIsAuthenticated = createSelector(
  [(state: RootState) => state.auth.isAuthenticated],
  (isAuthenticated) => isAuthenticated
);

export const selectUserPermissions = createSelector(
  [(state: RootState) => state.auth.permissions],
  (permissions) => permissions
);

// Whiteboard selectors
export const selectWhiteBoard = createSelector(
  [(state: RootState) => state.whiteBoard],
  (whiteBoard) => whiteBoard
);

export const selectBoard = createSelector(
  [(state: RootState) => state.whiteBoard.board],
  (board) => board
);

export const selectShapes = createSelector(
  [(state: RootState) => state.whiteBoard.shapes],
  (shapes) => shapes
);

export const selectSortedShapes = createSelector([selectShapes], (shapes) =>
  [...shapes].sort((a, b) => a.zIndex - b.zIndex)
);

export const selectReverseSortedShapes = createSelector(
  [selectSortedShapes],
  (shapes) => [...shapes].reverse()
);

// Selection selectors
export const selectSelected = createSelector(
  [(state: RootState) => state.selected],
  (selected) => selected
);

export const selectSelectedShapes = createSelector(
  [(state: RootState) => state.selected.selectedShapes],
  (selectedShapes) => selectedShapes
);

export const selectSelectedTool = createSelector(
  [(state: RootState) => state.selected.selectedTool],
  (selectedTool) => selectedTool
);

export const selectToolOptions = createSelector(
  [(state: RootState) => state.selected.toolOptions],
  (toolOptions) => toolOptions
);

export const selectClipboard = createSelector(
  [(state: RootState) => state.selected.clipboard],
  (clipboard) => clipboard
);

// Selection bounds
export const selectSelectionBounds = createSelector(
  [selectSelectedShapes, selectShapes],
  (selectedIds, shapes): BoundingBox | null => {
    if (selectedIds.length === 0) return null;

    const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    selectedShapes.forEach((shape) => {
      minX = Math.min(minX, Math.min(shape.bounds.x1, shape.bounds.x2));
      minY = Math.min(minY, Math.min(shape.bounds.y1, shape.bounds.y2));
      maxX = Math.max(maxX, Math.max(shape.bounds.x1, shape.bounds.x2));
      maxY = Math.max(maxY, Math.max(shape.bounds.y1, shape.bounds.y2));
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
);

// Border selectors
export const selectBorderStartX = createSelector(
  [(state: RootState) => state.selected.borderStartX],
  (borderStartX) => borderStartX
);

export const selectBorderStartY = createSelector(
  [(state: RootState) => state.selected.borderStartY],
  (borderStartY) => borderStartY
);

export const selectBorderEndX = createSelector(
  [(state: RootState) => state.selected.borderEndX],
  (borderEndX) => borderEndX
);

export const selectBorderEndY = createSelector(
  [(state: RootState) => state.selected.borderEndY],
  (borderEndY) => borderEndY
);

// Window selectors
export const selectWindow = createSelector(
  [(state: RootState) => state.window],
  (window) => window
);

export const selectWindowDimensions = createSelector(
  [(state: RootState) => state.window],
  (window) => ({
    width: window.width,
    height: window.height,
    centerX: window.centerX,
    centerY: window.centerY,
  })
);

// Sidebar selectors
export const selectSideBar = createSelector(
  [(state: RootState) => state.sideBar],
  (sideBar) => sideBar
);

export const selectHideOptions = createSelector(
  [(state: RootState) => state.sideBar.hideOptions],
  (hideOptions) => hideOptions
);

// Actions selectors
export const selectActions = createSelector(
  [(state: RootState) => state.actions],
  (actions) => actions
);

export const selectDragging = createSelector(
  [(state: RootState) => state.actions.dragging],
  (dragging) => dragging
);

export const selectResizing = createSelector(
  [(state: RootState) => state.actions.resizing],
  (resizing) => resizing
);

export const selectDrawing = createSelector(
  [(state: RootState) => state.actions.drawing],
  (drawing) => drawing
);

export const selectSharing = createSelector(
  [(state: RootState) => state.actions.sharing],
  (sharing) => sharing
);

export const selectDeleting = createSelector(
  [(state: RootState) => state.actions.deleting],
  (deleting) => deleting
);

export const selectSearchTerm = createSelector(
  [(state: RootState) => state.actions.searchTerm],
  (searchTerm) => searchTerm
);

// Boards selectors
export const selectBoards = createSelector(
  [(state: RootState) => state.boards],
  (boards) => boards
);

export const selectPrivateBoards = createSelector(
  [(state: RootState) => state.boards.privateBoards],
  (privateBoards) => privateBoards
);

export const selectPublicBoards = createSelector(
  [(state: RootState) => state.boards.publicBoards],
  (publicBoards) => publicBoards
);

export const selectSharedBoards = createSelector(
  [(state: RootState) => state.boards.sharedBoards],
  (sharedBoards) => sharedBoards
);

export const selectSearchableBoards = createSelector(
  [(state: RootState) => state.boards.searchableBoards],
  (searchableBoards) => searchableBoards
);

export const selectResultsBoards = createSelector(
  [(state: RootState) => state.boards.resultsBoards],
  (resultsBoards) => resultsBoards
);

// Board images selectors
export const selectBoardImages = createSelector(
  [(state: RootState) => state.boardImages.boardImages],
  (boardImages) => boardImages
);

// Shape history selectors
export const selectShapeHistory = createSelector(
  [(state: RootState) => state.shapeHistory],
  (shapeHistory) => shapeHistory
);

export const selectShapeHistoryData = createSelector(
  [(state: RootState) => state.shapeHistory.history],
  (history) => history
);

export const selectCurrentHistoryIndex = createSelector(
  [(state: RootState) => state.shapeHistory.currentIndex],
  (currentIndex) => currentIndex
);

// ===================
// COMPOSITE SELECTORS
// ===================

// Get shape by ID
export const selectShapeById = createSelector(
  [selectShapes, (_: RootState, shapeId: string) => shapeId],
  (shapes, shapeId) => shapes.find((shape) => shape.id === shapeId) || null
);

// Get selected shape objects
export const selectSelectedShapeObjects = createSelector(
  [selectSelectedShapes, selectShapes],
  (selectedIds, shapes) =>
    shapes.filter((shape) => selectedIds.includes(shape.id))
);

// Get board image by ID
export const selectBoardImageById = createSelector(
  [selectBoardImages, (_: RootState, boardId: string) => boardId],
  (boardImages, boardId) =>
    boardImages.find((image) => image.id === boardId) || null
);

// Get filtered boards by search term
export const selectFilteredBoards = createSelector(
  [selectSearchableBoards, selectSearchTerm],
  (boards, searchTerm) => {
    if (!searchTerm.trim()) return boards;

    const term = searchTerm.toLowerCase();
    return boards.filter(
      (board) =>
        board?.title.toLowerCase().includes(term) ||
        board?.id.toLowerCase().includes(term)
    );
  }
);

// Get shapes count by type
export const selectShapeCountByType = createSelector(
  [selectShapes],
  (shapes) => {
    const counts: Record<string, number> = {};
    shapes.forEach((shape) => {
      counts[shape.type] = (counts[shape.type] || 0) + 1;
    });
    return counts;
  }
);

// ===================
// CONVENIENCE HOOKS
// ===================

/**
 * Hook for authentication state
 */
export const useAuth = () => useAppSelector(selectAuth);

/**
 * Hook for current user
 */
export const useUser = () => useAppSelector(selectUser);

/**
 * Hook for authentication status
 */
export const useIsAuthenticated = () => useAppSelector(selectIsAuthenticated);

/**
 * Hook for whiteboard state
 */
export const useWhiteBoard = () => useAppSelector(selectWhiteBoard);

/**
 * Hook for current board
 */
export const useBoard = () => useAppSelector(selectBoard);

/**
 * Hook for shapes
 */
export const useShapes = () => useAppSelector(selectShapes);

/**
 * Hook for sorted shapes (by z-index)
 */
export const useSortedShapes = () => useAppSelector(selectSortedShapes);

/**
 * Hook for reverse sorted shapes (for rendering)
 */
export const useReverseSortedShapes = () =>
  useAppSelector(selectReverseSortedShapes);

/**
 * Hook for selection state
 */
export const useSelection = () => useAppSelector(selectSelected);

/**
 * Hook for selected shapes IDs
 */
export const useSelectedShapes = () => useAppSelector(selectSelectedShapes);

/**
 * Hook for selected shape objects
 */
export const useSelectedShapeObjects = () =>
  useAppSelector(selectSelectedShapeObjects);

/**
 * Hook for selected tool
 */
export const useSelectedTool = () => useAppSelector(selectSelectedTool);

/**
 * Hook for tool options
 */
export const useToolOptions = () => useAppSelector(selectToolOptions);

/**
 * Hook for selection bounds
 */
export const useSelectionBounds = () => useAppSelector(selectSelectionBounds);

/**
 * Hook for border coordinates
 */
export const useBorderCoordinates = () =>
  useAppSelector((state) => ({
    startX: selectBorderStartX(state),
    startY: selectBorderStartY(state),
    endX: selectBorderEndX(state),
    endY: selectBorderEndY(state),
  }));

/**
 * Hook for window state
 */
export const useWindow = () => useAppSelector(selectWindow);

/**
 * Hook for window dimensions
 */
export const useWindowDimensions = () => useAppSelector(selectWindowDimensions);

/**
 * Hook for sidebar state
 */
export const useSideBar = () => useAppSelector(selectSideBar);

/**
 * Hook for actions state
 */
export const useActions = () => useAppSelector(selectActions);

/**
 * Hook for interaction states
 */
export const useInteractionStates = () =>
  useAppSelector((state) => ({
    dragging: selectDragging(state),
    resizing: selectResizing(state),
    drawing: selectDrawing(state),
    sharing: selectSharing(state),
    deleting: selectDeleting(state),
  }));

/**
 * Hook for boards
 */
export const useBoards = () => useAppSelector(selectBoards);

/**
 * Hook for board images
 */
export const useBoardImages = () => useAppSelector(selectBoardImages);

/**
 * Hook for shape history
 */
export const useShapeHistory = () => useAppSelector(selectShapeHistory);

/**
 * Hook for search functionality
 */
export const useSearch = () => {
  const searchTerm = useAppSelector(selectSearchTerm);
  const filteredBoards = useAppSelector(selectFilteredBoards);

  return {
    searchTerm,
    filteredBoards,
  };
};

/**
 * Hook for shape analytics
 */
export const useShapeAnalytics = () => {
  const shapes = useShapes();
  const selectedShapes = useSelectedShapes();
  const shapeCountByType = useAppSelector(selectShapeCountByType);

  return {
    totalShapes: shapes.length,
    selectedCount: selectedShapes.length,
    shapeCountByType,
    hasSelection: selectedShapes.length > 0,
    isMultiSelection: selectedShapes.length > 1,
  };
};

/**
 * Hook for shape by ID
 */
export const useShapeById = (shapeId: string) =>
  useAppSelector((state) => selectShapeById(state, shapeId));

/**
 * Hook for board image by ID
 */
export const useBoardImageById = (boardId: string) =>
  useAppSelector((state) => selectBoardImageById(state, boardId));

/**
 * Hook for performance-related state
 */
export const usePerformanceState = () => {
  const shapes = useShapes();
  const selectedShapes = useSelectedShapes();

  return {
    totalShapes: shapes.length,
    selectedShapes: selectedShapes.length,
    shouldOptimize: shapes.length > 100,
    shouldUseLOD: shapes.length > 500,
  };
};
