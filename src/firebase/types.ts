// Firebase Architecture Types for Kumo Whiteboard

export interface WhiteboardDocument {
  id: string;
  title: string;
  type: "public" | "private" | "shared";
  uid: string;
  sharedWith: string[];
  backgroundColor: string;
  createdAt: Date;
  updatedAt: Date;
  lastChangedBy: string;
  // Metadata only - shapes stored in subcollection
}

export interface ShapeDocument {
  id: string;
  type: string;

  // Position and dimensions
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;

  // Z-index and hierarchy
  zIndex: number;
  level: number;

  // Transform properties
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;

  // Visual styling
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;
  borderColor?: string;
  backgroundColor?: string;
  color?: string;
  opacity?: number;

  // Text properties
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  rows?: number;

  // Component properties
  shapes?: string[]; // References to child shape IDs

  // Board navigation
  boardId?: string | null;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastChangedBy: string;

  // Collaboration metadata
  isBeingEdited?: boolean;
  editedBy?: string;
  editStartTime?: Date;
}

// Real-time cursor and presence data (stays in Realtime Database)
export interface CursorData {
  uid: string;
  x: number;
  y: number;
  timestamp: number;
  tool?: string;
  isActive: boolean;
}

export interface PresenceData {
  [boardId: string]: {
    [userId: string]: CursorData;
  };
}

// Selection and interaction state (Realtime Database)
export interface SelectionState {
  selectedShapes: string[];
  selectedBy: string;
  timestamp: number;
}

export interface InteractionState {
  drawing: boolean;
  dragging: boolean;
  resizing: boolean;
  tool: string;
  user: string;
  timestamp: number;
}

// Optimized update types for Firestore
export interface ShapeUpdate {
  shapeId: string;
  updates: Partial<ShapeDocument>;
  timestamp: Date;
  userId: string;
}

export interface BatchShapeUpdate {
  updates: ShapeUpdate[];
  boardId: string;
  timestamp: Date;
  userId: string;
}

// Firebase service configuration
export interface FirebaseConfig {
  // Firestore for persistent data
  firestore: {
    enablePersistence: boolean;
    cacheSizeBytes: number;
    enableNetwork: boolean;
  };

  // Realtime Database for real-time data
  realtimeDb: {
    enableLogging: boolean;
    enableOffline: boolean;
  };

  // Performance settings
  performance: {
    batchSize: number;
    throttleMs: number;
    maxRetries: number;
    enableCompression: boolean;
  };
}

// Migration and compatibility types
export interface LegacyShape {
  // Old shape format from classes/shape.ts
  type: string;
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  level: number;
  zIndex: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shapes?: LegacyShape[];
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  rows?: number;
  color?: string;
  opacity?: number;
  backgroundColor?: string;
  borderColor?: string;
  backgroundImage?: string;
  boardId?: string | null;
  title?: string | null;
  uid?: string | null;
}

export interface MigrationResult {
  success: boolean;
  migratedShapes: number;
  errors: string[];
  warnings: string[];
  migrationTime: number;
}

// Service interfaces
export interface FirebaseService {
  // Whiteboard management
  createWhiteboard(
    data: Omit<WhiteboardDocument, "id" | "createdAt" | "updatedAt">
  ): Promise<string>;
  getWhiteboard(id: string): Promise<WhiteboardDocument | null>;
  updateWhiteboard(
    id: string,
    updates: Partial<WhiteboardDocument>
  ): Promise<void>;
  deleteWhiteboard(id: string): Promise<void>;

  // Shape management
  createShape(
    boardId: string,
    shape: Omit<ShapeDocument, "id" | "createdAt" | "updatedAt">
  ): Promise<string>;
  updateShape(
    boardId: string,
    shapeId: string,
    updates: Partial<ShapeDocument>
  ): Promise<void>;
  updateShapesBatch(boardId: string, updates: ShapeUpdate[]): Promise<void>;
  deleteShape(boardId: string, shapeId: string): Promise<void>;
  getShapes(boardId: string): Promise<ShapeDocument[]>;

  // Real-time subscriptions
  subscribeToShapes(
    boardId: string,
    callback: (shapes: ShapeDocument[]) => void
  ): () => void;
  subscribeToPresence(
    boardId: string,
    callback: (presence: CursorData[]) => void
  ): () => void;

  // Presence and cursors
  updateCursor(boardId: string, cursorData: CursorData): Promise<void>;
  updateSelection(boardId: string, selection: SelectionState): Promise<void>;

  // Migration utilities
  migrateFromLegacy(legacyData: any): Promise<MigrationResult>;
}

// Event types for real-time updates
export interface FirebaseEvent {
  type:
    | "shape_added"
    | "shape_updated"
    | "shape_deleted"
    | "cursor_moved"
    | "selection_changed";
  boardId: string;
  data: any;
  timestamp: Date;
  userId: string;
}

export interface FirebaseEventHandler {
  (event: FirebaseEvent): void;
}

// Performance monitoring
export interface FirebaseMetrics {
  latency: {
    firestore: number;
    realtimeDb: number;
  };
  bandwidth: {
    sent: number;
    received: number;
  };
  operations: {
    reads: number;
    writes: number;
    deletes: number;
  };
  errors: string[];
  timestamp: Date;
}
