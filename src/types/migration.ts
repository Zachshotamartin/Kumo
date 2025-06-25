/**
 * TypeScript Migration Utilities
 *
 * Provides utilities and examples for migrating from 'any' types
 * to proper TypeScript types throughout the codebase.
 */

import { RootState } from "./index";
import {
  useAppSelector,
  useShapes,
  useSelectedShapes,
  useUser,
  useBorderCoordinates,
  useWindow,
  useActions,
  useBoardImages,
} from "../hooks/useTypedSelector";

// ===================
// MIGRATION EXAMPLES
// ===================

/**
 * Before: useSelector with 'any' state
 * After: Typed selector hooks
 */

// ❌ BEFORE - Using any types
/*
const userState = useSelector((state: any) => state.auth);
const shapes = useSelector((state: any) => state.whiteBoard.shapes);
const selectedShapes = useSelector((state: any) => state.selected.selectedShapes);
const window = useSelector((state: any) => state.window);
*/

// ✅ AFTER - Using typed hooks
export const MigrationExample = () => {
  // Type-safe state access
  const user = useUser();
  const shapes = useShapes();
  const selectedShapes = useSelectedShapes();
  const window = useWindow();
  const actions = useActions();
  const borderCoords = useBorderCoordinates();
  const boardImages = useBoardImages();

  return {
    user,
    shapes,
    selectedShapes,
    window,
    actions,
    borderCoords,
    boardImages,
  };
};

// ===================
// FUNCTION PARAMETER MIGRATIONS
// ===================

/**
 * Before: Functions accepting 'any' parameters
 * After: Strongly typed function parameters
 */

import {
  KumoShape,
  Board,
  BoardInfo,
  Point,
  BoundingBox,
  FirebaseSnapshot,
  BoardUpdatePayload,
} from "./index";

// ❌ BEFORE - Using any types
/*
const updateBoard = async (newBoard: any) => { ... };
const handleSnapshot = (snapshot: any) => { ... };
const renderComponent = (props: any) => { ... };
*/

// ✅ AFTER - Using typed parameters
export const updateBoard = async (newBoard: Board): Promise<void> => {
  // Implementation with type safety
};

export const handleSnapshot = (
  snapshot: FirebaseSnapshot<BoardUpdatePayload>
): void => {
  // Type-safe snapshot handling
  if (snapshot.exists()) {
    const data = snapshot.val();
    if (data) {
      // data is now typed as BoardUpdatePayload
      console.log("Board update:", data.boardId, data.operation);
    }
  }
};

export const handleBoardChange = async (newBoard: Board): Promise<void> => {
  // Type-safe board change handling
  try {
    await updateBoard(newBoard);
  } catch (error) {
    console.error("Failed to update board:", error);
  }
};

// ===================
// COMPONENT PROP MIGRATIONS
// ===================

import React, { ReactElement } from "react";

// ❌ BEFORE - Using any for props
/*
const RenderEllipses = (props: any) => { ... };
const ViewBoardPreview = (props: { boards: any }) => { ... };
*/

// ✅ AFTER - Using typed props
interface RenderEllipsesProps {
  shapes: KumoShape[];
  isSelected: boolean;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export const RenderEllipses = (props: RenderEllipsesProps): ReactElement => {
  const { shapes, isSelected, viewport } = props;
  // Type-safe component implementation
  return React.createElement("div", {}, "Ellipses");
};

interface ViewBoardPreviewProps {
  boards: BoardInfo[];
}

export const ViewBoardPreview = (
  props: ViewBoardPreviewProps
): ReactElement => {
  const { boards } = props;
  // Type-safe board preview implementation
  return React.createElement("div", {}, "Board Preview");
};

// ===================
// ARRAY AND SORTING MIGRATIONS
// ===================

// ❌ BEFORE - Using any for array operations
/*
const sortedShapes = [...shapes].sort((a: any, b: any) => a.zIndex - b.zIndex);
boards?.map((board: any) => { ... });
*/

// ✅ AFTER - Using typed array operations
export const getSortedShapes = (shapes: KumoShape[]): KumoShape[] => {
  return [...shapes].sort((a, b) => a.zIndex - b.zIndex);
};

export const getReverseSortedShapes = (shapes: KumoShape[]): KumoShape[] => {
  return getSortedShapes(shapes).reverse();
};

export const mapBoards = <T>(
  boards: BoardInfo[],
  mapper: (board: BoardInfo, index: number) => T
): T[] => {
  return boards.map(mapper);
};

// ===================
// EVENT HANDLER MIGRATIONS
// ===================

import { MouseEventContext, KeyboardEventContext } from "./utils";

// ❌ BEFORE - Using any for event handlers
/*
const handleClick = (event: any) => { ... };
const handleKeyDown = (event: any) => { ... };
*/

// ✅ AFTER - Using typed event handlers
export const handleClick = (event: MouseEventContext): void => {
  const { point, button, modifiers, target } = event;

  if (modifiers.ctrl && button === 0) {
    // Handle Ctrl+Click
  }

  if (target) {
    // Handle shape click
    console.log("Clicked shape:", target.id);
  }
};

export const handleKeyDown = (event: KeyboardEventContext): void => {
  const { key, code, modifiers } = event;

  if (modifiers.ctrl && key === "z") {
    // Handle Ctrl+Z (undo)
  }

  if (code === "Delete") {
    // Handle delete key
  }
};

// ===================
// GENERIC FUNCTION MIGRATIONS
// ===================

// ❌ BEFORE - Using any for generic operations
/*
const findItem = (items: any[], predicate: (item: any) => boolean): any => { ... };
const filterItems = (items: any[], filter: (item: any) => boolean): any[] => { ... };
*/

// ✅ AFTER - Using proper generics
export const findItem = <T>(
  items: T[],
  predicate: (item: T) => boolean
): T | undefined => {
  return items.find(predicate);
};

export const filterItems = <T>(
  items: T[],
  filter: (item: T) => boolean
): T[] => {
  return items.filter(filter);
};

export const mapItems = <T, U>(
  items: T[],
  mapper: (item: T, index: number) => U
): U[] => {
  return items.map(mapper);
};

// ===================
// SPECIFIC MIGRATION PATTERNS
// ===================

/**
 * Pattern 1: Firebase snapshot handling
 */
export const migrateFirebaseHandlers = () => {
  // ❌ BEFORE
  /*
  const handleSnapshot = (snapshot: any) => {
    const data = snapshot.val();
    // data is any
  };
  */

  // ✅ AFTER
  const handleTypedSnapshot = (snapshot: FirebaseSnapshot<Board>): void => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (data) {
        // data is now typed as Board
        console.log("Board version:", data.version);
        console.log("Shapes count:", data.shapes.length);
      }
    }
  };

  return { handleTypedSnapshot };
};

/**
 * Pattern 2: Shape operations
 */
export const migrateShapeOperations = () => {
  // ❌ BEFORE
  /*
  const getShapeBounds = (shape: any): any => {
    return {
      x: Math.min(shape.x1, shape.x2),
      y: Math.min(shape.y1, shape.y2),
      width: Math.abs(shape.x2 - shape.x1),
      height: Math.abs(shape.y2 - shape.y1)
    };
  };
  */

  // ✅ AFTER
  const getShapeBounds = (shape: KumoShape): BoundingBox => {
    return {
      x: Math.min(shape.bounds.x1, shape.bounds.x2),
      y: Math.min(shape.bounds.y1, shape.bounds.y2),
      width: Math.abs(shape.bounds.x2 - shape.bounds.x1),
      height: Math.abs(shape.bounds.y2 - shape.bounds.y1),
    };
  };

  const findShapeAt = (shapes: KumoShape[], point: Point): KumoShape | null => {
    return (
      shapes.find((shape) => {
        const bounds = getShapeBounds(shape);
        return (
          point.x >= bounds.x &&
          point.x <= bounds.x + bounds.width &&
          point.y >= bounds.y &&
          point.y <= bounds.y + bounds.height
        );
      }) || null
    );
  };

  return { getShapeBounds, findShapeAt };
};

/**
 * Pattern 3: Board operations
 */
export const migrateBoardOperations = () => {
  // ❌ BEFORE
  /*
  const findBoard = (boards: any[], id: string): any => {
    return boards.find(board => board.id === id);
  };
  */

  // ✅ AFTER
  const findBoard = (
    boards: BoardInfo[],
    id: string
  ): BoardInfo | undefined => {
    return boards.find((board) => board.id === id);
  };

  const filterBoardsByUser = (
    boards: BoardInfo[],
    userId: string
  ): BoardInfo[] => {
    return boards.filter((board) => board.uid === userId);
  };

  const sortBoardsByDate = (boards: BoardInfo[]): BoardInfo[] => {
    return [...boards].sort((a, b) => b.updatedAt - a.updatedAt);
  };

  return { findBoard, filterBoardsByUser, sortBoardsByDate };
};

// ===================
// MIGRATION CHECKLIST
// ===================

/**
 * Type Safety Migration Checklist:
 *
 * ✅ 1. Replace all `(state: any)` with typed selectors
 * ✅ 2. Replace all function parameters `param: any` with proper types
 * ✅ 3. Replace all component props `props: any` with interfaces
 * ✅ 4. Replace all array operations with typed versions
 * ✅ 5. Replace all event handlers with typed versions
 * ✅ 6. Replace all Firebase operations with typed versions
 * ✅ 7. Replace all shape operations with typed versions
 * ✅ 8. Replace all board operations with typed versions
 * ✅ 9. Add proper generics to utility functions
 * ✅ 10. Enable strict TypeScript configuration
 *
 * Files that need migration:
 * - src/effects/intersections.tsx
 * - src/effects/visibilityEffects.tsx
 * - src/effects/generatePreview.tsx
 * - src/effects/history.tsx
 * - src/effects/dbListener.tsx
 * - src/helpers/handleBoardChange.ts
 * - src/helpers/deleteHelper.ts
 * - src/components/leftBar/leftBar.tsx
 * - src/components/bottomBar/bottomBar.tsx
 * - src/components/viewBoardPreview/viewBoardPreview.tsx
 * - src/components/components/components.tsx
 * - src/components/share/share.tsx
 * - src/components/optionsBar/optionsBar.tsx
 * - src/components/workSpace/workSpace.tsx
 * - src/components/renderComponents/renderGridLines.tsx
 * - src/components/renderComponents/renderEllipses.tsx
 * - src/components/renderComponents/renderBorder.tsx
 * - src/performance/core/VirtualRenderer.ts
 * - src/firebase/services/OptimizedFirebaseService.ts
 * - src/architecture/infrastructure/container/DIContainer.ts
 * - src/architecture/domain/entities/Shape.ts
 */
