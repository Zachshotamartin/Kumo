import {
  configureStore,
  createSlice,
  PayloadAction,
  createSelector,
} from "@reduxjs/toolkit";
import {
  AppState,
  StateMachineContext,
  WhiteboardState,
  AuthState,
  CollaborationState,
  PerformanceState,
  ComputedState,
  StateEvent,
  Point,
  User,
  ResizeDirection,
  BoardInfo,
} from "../types";
import { AppStateMachine } from "../machines/AppStateMachine";

/**
 * Simplified Redux Store for Kumo Whiteboard
 *
 * Replaces the complex multi-slice architecture with:
 * - State machine for application logic
 * - Consolidated data domains
 * - Computed selectors
 * - Migration utilities
 */

// ===================
// STATE MACHINE INTEGRATION
// ===================

// Global state machine instance
let globalStateMachine: AppStateMachine | null = null;

const getStateMachine = (): AppStateMachine => {
  if (!globalStateMachine) {
    globalStateMachine = new AppStateMachine();
  }
  return globalStateMachine;
};

// ===================
// APP SLICE (State Machine Integration)
// ===================

const appSlice = createSlice({
  name: "app",
  initialState: getStateMachine().getContext(),
  reducers: {
    // Send event to state machine
    sendEvent: (state, action: PayloadAction<StateEvent>) => {
      getStateMachine().send(action.payload);
      return getStateMachine().getContext();
    },

    // Direct state updates (for compatibility)
    updateContext: (
      state,
      action: PayloadAction<Partial<StateMachineContext>>
    ) => {
      return { ...state, ...action.payload };
    },

    // Tool selection
    selectTool: (state, action: PayloadAction<StateMachineContext["tool"]>) => {
      getStateMachine().send({ type: "SELECT_TOOL", tool: action.payload });
      return getStateMachine().getContext();
    },

    // Mouse events
    mouseDown: (
      state,
      action: PayloadAction<{ position: Point; target?: string }>
    ) => {
      getStateMachine().send({
        type: "MOUSE_DOWN",
        position: action.payload.position,
        target: action.payload.target,
      });
      return getStateMachine().getContext();
    },

    mouseMove: (
      state,
      action: PayloadAction<{ position: Point; delta: Point }>
    ) => {
      getStateMachine().send({
        type: "MOUSE_MOVE",
        position: action.payload.position,
        delta: action.payload.delta,
      });
      return getStateMachine().getContext();
    },

    mouseUp: (state, action: PayloadAction<Point>) => {
      getStateMachine().send({ type: "MOUSE_UP", position: action.payload });
      return getStateMachine().getContext();
    },

    // Keyboard events
    keyDown: (
      state,
      action: PayloadAction<{ key: string; modifiers: any }>
    ) => {
      getStateMachine().send({
        type: "KEY_DOWN",
        key: action.payload.key,
        modifiers: action.payload.modifiers,
      });
      return getStateMachine().getContext();
    },

    // Shape events
    selectShapes: (state, action: PayloadAction<string[]>) => {
      getStateMachine().send({
        type: "SHAPE_SELECTED",
        shapeIds: action.payload,
      });
      return getStateMachine().getContext();
    },

    // Viewport events
    panViewport: (state, action: PayloadAction<Point>) => {
      getStateMachine().send({ type: "VIEWPORT_PAN", delta: action.payload });
      return getStateMachine().getContext();
    },

    zoomViewport: (
      state,
      action: PayloadAction<{ scale: number; center: Point }>
    ) => {
      getStateMachine().send({
        type: "VIEWPORT_ZOOM",
        scale: action.payload.scale,
        center: action.payload.center,
      });
      return getStateMachine().getContext();
    },

    // UI events
    toggleUI: (
      state,
      action: PayloadAction<keyof StateMachineContext["ui"]>
    ) => {
      getStateMachine().send({ type: "TOGGLE_UI", element: action.payload });
      return getStateMachine().getContext();
    },
  },
});

// ===================
// WHITEBOARD SLICE
// ===================

const whiteboardSlice = createSlice({
  name: "whiteboard",
  initialState: {
    id: "",
    title: "Untitled Board",
    description: "",
    shapes: [],
    background: {
      color: "#1a1a1a",
      image: undefined,
      pattern: undefined,
    },
    settings: {
      snapToGrid: true,
      gridSize: 20,
      showRulers: false,
      autoSave: true,
    },
    history: {
      past: [],
      present: [],
      future: [],
      maxHistorySize: 50,
    },
  } as WhiteboardState,
  reducers: {
    setWhiteboardData: (
      state,
      action: PayloadAction<Partial<WhiteboardState>>
    ) => {
      return { ...state, ...action.payload };
    },

    updateShapes: (state, action: PayloadAction<any[]>) => {
      state.shapes = action.payload;
      // Update history
      state.history.past.push(state.history.present);
      state.history.present = action.payload;
      state.history.future = [];

      // Limit history size
      if (state.history.past.length > state.history.maxHistorySize) {
        state.history.past.shift();
      }
    },

    addShape: (state, action: PayloadAction<any>) => {
      state.shapes.push(action.payload);
      state.history.past.push(state.history.present);
      state.history.present = [...state.shapes];
      state.history.future = [];
    },

    updateShape: (
      state,
      action: PayloadAction<{ id: string; updates: any }>
    ) => {
      const index = state.shapes.findIndex((s) => s.id === action.payload.id);
      if (index >= 0) {
        state.shapes[index] = {
          ...state.shapes[index],
          ...action.payload.updates,
        };
        state.history.past.push(state.history.present);
        state.history.present = [...state.shapes];
        state.history.future = [];
      }
    },

    deleteShapes: (state, action: PayloadAction<string[]>) => {
      state.shapes = state.shapes.filter((s) => !action.payload.includes(s.id));
      state.history.past.push(state.history.present);
      state.history.present = [...state.shapes];
      state.history.future = [];
    },

    undo: (state) => {
      if (state.history.past.length > 0) {
        const previous = state.history.past.pop()!;
        state.history.future.unshift(state.history.present);
        state.history.present = previous;
        state.shapes = previous;
      }
    },

    redo: (state) => {
      if (state.history.future.length > 0) {
        const next = state.history.future.shift()!;
        state.history.past.push(state.history.present);
        state.history.present = next;
        state.shapes = next;
      }
    },

    updateSettings: (
      state,
      action: PayloadAction<Partial<WhiteboardState["settings"]>>
    ) => {
      state.settings = { ...state.settings, ...action.payload };
    },
  },
});

// ===================
// AUTH SLICE
// ===================

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null,
    isAuthenticated: false,
    permissions: [],
    boards: {
      owned: [],
      shared: [],
      public: [],
    },
  } as AuthState,
  reducers: {
    login: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },

    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.permissions = [];
      state.boards = { owned: [], shared: [], public: [] };
    },

    updatePermissions: (state, action: PayloadAction<string[]>) => {
      state.permissions = action.payload;
    },

    updateBoards: (
      state,
      action: PayloadAction<Partial<AuthState["boards"]>>
    ) => {
      state.boards = { ...state.boards, ...action.payload };
    },
  },
});

// ===================
// COLLABORATION SLICE
// ===================

const collaborationSlice = createSlice({
  name: "collaboration",
  initialState: {
    users: [],
    cursors: new Map(),
    isConnected: false,
    latency: 0,
    conflictResolution: "last-write-wins",
  } as CollaborationState,
  reducers: {
    setConnectionStatus: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
    },

    updateUsers: (state, action: PayloadAction<User[]>) => {
      state.users = action.payload;
    },

    updateCursor: (
      state,
      action: PayloadAction<{ userId: string; position: Point }>
    ) => {
      // Note: RTK can't serialize Map, so we'll handle cursors differently in practice
      state.cursors = new Map(state.cursors);
      state.cursors.set(action.payload.userId, action.payload.position);
    },

    removeCursor: (state, action: PayloadAction<string>) => {
      state.cursors = new Map(state.cursors);
      state.cursors.delete(action.payload);
    },

    updateLatency: (state, action: PayloadAction<number>) => {
      state.latency = action.payload;
    },
  },
});

// ===================
// PERFORMANCE SLICE
// ===================

const performanceSlice = createSlice({
  name: "performance",
  initialState: {
    fps: 60,
    memoryUsage: 0,
    renderTime: 0,
    shapesVisible: 0,
    shapesTotal: 0,
    cullingEnabled: true,
    lodEnabled: true,
    warnings: [],
  } as PerformanceState,
  reducers: {
    updatePerformanceMetrics: (
      state,
      action: PayloadAction<Partial<PerformanceState>>
    ) => {
      return { ...state, ...action.payload };
    },

    addWarning: (state, action: PayloadAction<string>) => {
      state.warnings.push(action.payload);
      // Keep only last 10 warnings
      if (state.warnings.length > 10) {
        state.warnings.shift();
      }
    },

    clearWarnings: (state) => {
      state.warnings = [];
    },
  },
});

// ===================
// COMPUTED SELECTORS
// ===================

const computedSelectors = {
  // Navigation selectors
  canUndo: createSelector(
    [(state: AppState) => state.whiteboard.history],
    (history) => history.past.length > 0
  ),

  canRedo: createSelector(
    [(state: AppState) => state.whiteboard.history],
    (history) => history.future.length > 0
  ),

  // Selection selectors
  selectionBounds: createSelector(
    [
      (state: AppState) => state.app.selectedShapes,
      (state: AppState) => state.whiteboard.shapes,
    ],
    (selectedIds, shapes) => {
      if (selectedIds.length === 0) return null;

      const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
      if (selectedShapes.length === 0) return null;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      selectedShapes.forEach((shape) => {
        minX = Math.min(minX, Math.min(shape.x1, shape.x2));
        minY = Math.min(minY, Math.min(shape.y1, shape.y2));
        maxX = Math.max(maxX, Math.max(shape.x1, shape.x2));
        maxY = Math.max(maxY, Math.max(shape.y1, shape.y2));
      });

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
  ),

  // Performance selectors
  shouldUseLOD: createSelector(
    [(state: AppState) => state.performance],
    (performance) => performance.fps < 45 || performance.shapesTotal > 500
  ),

  shouldCull: createSelector(
    [(state: AppState) => state.performance],
    (performance) => performance.shapesTotal > 100
  ),

  // UI selectors
  activeResizeHandles: createSelector(
    [
      (state: AppState) => state.app.selectedShapes,
      (state: AppState) => state.app.mode,
    ],
    (selectedShapes, mode): ResizeDirection[] => {
      if (selectedShapes.length !== 1 || mode !== "editing") return [];
      return ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeDirection[];
    }
  ),

  // Collaboration selectors
  otherCursors: createSelector(
    [
      (state: AppState) => state.collaboration.users,
      (state: AppState) => state.collaboration.cursors,
      (state: AppState) => state.auth.user,
    ],
    (users, cursors, currentUser) => {
      return users
        .filter((user) => user.id !== currentUser?.id)
        .map((user) => ({
          user,
          position: cursors.get(user.id) || { x: 0, y: 0 },
        }));
    }
  ),
};

// ===================
// STORE CONFIGURATION
// ===================

export const simplifiedStore = configureStore({
  reducer: {
    app: appSlice.reducer,
    whiteboard: whiteboardSlice.reducer,
    auth: authSlice.reducer,
    collaboration: collaborationSlice.reducer,
    performance: performanceSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore cursors Map in collaboration slice
        ignoredPaths: ["collaboration.cursors"],
      },
    }),
  devTools: process.env.NODE_ENV !== "production",
});

// ===================
// COMPUTED STATE PROVIDER
// ===================

// Computed state slice (read-only)
export const getComputedState = (state: AppState): ComputedState => ({
  canUndo: computedSelectors.canUndo(state),
  canRedo: computedSelectors.canRedo(state),
  selectionBounds: computedSelectors.selectionBounds(state),
  visibleShapes: [], // Populated by virtual renderer
  shouldUseLOD: computedSelectors.shouldUseLOD(state),
  shouldCull: computedSelectors.shouldCull(state),
  recommendedBatchSize: state.performance.fps < 30 ? 25 : 50,
  activeResizeHandles: computedSelectors.activeResizeHandles(state),
  snapPoints: [], // TODO: Calculate snap points
  otherCursors: computedSelectors.otherCursors(state),
});

// ===================
// ACTIONS & TYPES
// ===================

export const appActions = appSlice.actions;
export const whiteboardActions = whiteboardSlice.actions;
export const authActions = authSlice.actions;
export const collaborationActions = collaborationSlice.actions;
export const performanceActions = performanceSlice.actions;

export type RootState = ReturnType<typeof simplifiedStore.getState>;
export type AppDispatch = typeof simplifiedStore.dispatch;

// ===================
// MIGRATION UTILITIES
// ===================

/**
 * Migrate from old Redux structure to new simplified structure
 */
export const migrateFromLegacyState = (legacyState: any): Partial<AppState> => {
  const migrated: Partial<AppState> = {};

  // Migrate actions slice to state machine context
  if (legacyState.actions) {
    const actions = legacyState.actions;

    // Determine mode from boolean flags
    let mode: StateMachineContext["mode"] = "viewing";
    if (actions.drawing) mode = "drawing";
    else if (actions.dragging) mode = "dragging";
    else if (actions.resizing) mode = "resizing";
    else if (actions.highlighting) mode = "selecting";

    // Determine interaction state
    let interaction: StateMachineContext["interaction"] = "idle";
    if (actions.mouseDown) interaction = "pressing";
    if (actions.dragging || actions.drawing) interaction = "dragging";
    if (actions.resizing) interaction = "resizing";

    migrated.app = {
      mode,
      tool: legacyState.selected?.selectedTool || "pointer",
      interaction,
      selectedShapes: legacyState.selected?.selectedShapes || [],
      hoveredShape: null,
      editingShape: null,
      resizeDirection: "none",
      mousePosition: { x: 0, y: 0 },
      mouseDown: actions.mouseDown || false,
      dragStart: null,
      viewport: {
        x: legacyState.window?.x1 || 0,
        y: legacyState.window?.y1 || 0,
        width: legacyState.window?.x2 - legacyState.window?.x1 || 1920,
        height: legacyState.window?.y2 - legacyState.window?.y1 || 1080,
        scale: legacyState.window?.percentZoomed || 1,
        minScale: 0.1,
        maxScale: 5,
      },
      ui: {
        sidebar: !legacyState.hide?.hideSideBar,
        toolbar: true,
        optionsPanel: !legacyState.hide?.hideOptions,
        userPanel: actions.userOpen || false,
        settingsPanel: actions.settingsOpen || false,
        grid: actions.grid || true,
        rulers: false,
        snapGuides: true,
      },
      operation: null,
      performanceMode: "auto",
    };
  }

  // Migrate whiteboard data
  if (legacyState.whiteBoard) {
    migrated.whiteboard = {
      id: legacyState.whiteBoard.id || "",
      title: legacyState.whiteBoard.title || "Untitled Board",
      description: legacyState.whiteBoard.description || "",
      shapes: legacyState.whiteBoard.shapes || [],
      background: {
        color: legacyState.whiteBoard.backGroundColor || "#1a1a1a",
      },
      settings: {
        snapToGrid: true,
        gridSize: 20,
        showRulers: false,
        autoSave: true,
      },
      history: {
        past: legacyState.shapeHistory?.history?.slice(0, -1) || [],
        present: legacyState.whiteBoard.shapes || [],
        future: [],
        maxHistorySize: 50,
      },
    };
  }

  // Migrate auth data
  if (legacyState.auth) {
    migrated.auth = {
      user: legacyState.auth.uid
        ? {
            id: legacyState.auth.uid,
            email: legacyState.auth.email || "",
            displayName: legacyState.auth.email?.split("@")[0] || "",
            isActive: legacyState.auth.isAuthenticated || false,
          }
        : null,
      isAuthenticated: legacyState.auth.isAuthenticated || false,
      permissions: [],
      boards: {
        owned: legacyState.boards?.privateBoards || [],
        shared: legacyState.boards?.sharedBoards || [],
        public: legacyState.boards?.publicBoards || [],
      },
    };
  }

  return migrated;
};

/**
 * Create compatibility layer for old action dispatches
 */
export const createLegacyActionCompat = (dispatch: AppDispatch) => ({
  // Old action -> new action mapping
  setDrawing: (value: boolean) => {
    if (value)
      dispatch(
        appActions.sendEvent({ type: "SELECT_TOOL", tool: "rectangle" })
      );
    else dispatch(appActions.sendEvent({ type: "ESC_PRESSED" }));
  },

  setDragging: (value: boolean) => {
    // Dragging state is now managed by state machine
    console.warn("setDragging is deprecated - use state machine events");
  },

  setResizing: (value: boolean) => {
    // Resizing state is now managed by state machine
    console.warn("setResizing is deprecated - use state machine events");
  },

  setSelectedShapes: (shapes: string[]) => {
    dispatch(appActions.selectShapes(shapes));
  },

  setSelectedTool: (tool: string) => {
    dispatch(appActions.selectTool(tool as any));
  },

  // ... other legacy action mappings
});

export default simplifiedStore;
