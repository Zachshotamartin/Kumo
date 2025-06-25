import {
  doc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
  orderBy,
  Timestamp,
  enableNetwork,
  disableNetwork,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import {
  ref,
  set,
  update,
  remove,
  onValue,
  off,
  serverTimestamp,
  onDisconnect,
} from "firebase/database";
import { throttle, debounce } from "lodash";

import { db, realtimeDb } from "../../config/firebase";
import {
  FirebaseService,
  WhiteboardDocument,
  ShapeDocument,
  CursorData,
  SelectionState,
  ShapeUpdate,
  BatchShapeUpdate,
  FirebaseConfig,
  MigrationResult,
  LegacyShape,
  FirebaseMetrics,
} from "../types";

/**
 * Optimized Firebase Service that leverages both Firestore and Realtime Database
 *
 * Architecture:
 * - Firestore: Persistent data (whiteboards, shapes) with efficient partial updates
 * - Realtime Database: Real-time data (cursors, presence, selections) with low latency
 */
export class OptimizedFirebaseService implements FirebaseService {
  private config: FirebaseConfig;
  private metrics: FirebaseMetrics;
  private activeSubscriptions = new Map<string, () => void>();

  // Throttled update functions (initialized in constructor)
  private throttledUpdateCursor!: (
    boardId: string,
    cursorData: CursorData
  ) => Promise<void>;
  private throttledUpdateSelection!: (
    boardId: string,
    selection: SelectionState
  ) => Promise<void>;
  private debouncedBatchUpdate!: (
    boardId: string,
    updates: ShapeUpdate[]
  ) => Promise<void>;

  constructor(config?: Partial<FirebaseConfig>) {
    this.config = {
      firestore: {
        enablePersistence: true,
        cacheSizeBytes: 40 * 1024 * 1024, // 40MB cache
        enableNetwork: true,
      },
      realtimeDb: {
        enableLogging: false,
        enableOffline: true,
      },
      performance: {
        batchSize: 20,
        throttleMs: 16, // ~60fps for cursor updates
        maxRetries: 3,
        enableCompression: true,
      },
      ...config,
    };

    this.metrics = {
      latency: { firestore: 0, realtimeDb: 0 },
      bandwidth: { sent: 0, received: 0 },
      operations: { reads: 0, writes: 0, deletes: 0 },
      errors: [],
      timestamp: new Date(),
    };

    this.initializeOptimizations();
  }

  private initializeOptimizations(): void {
    // Initialize throttled functions
    this.throttledUpdateCursor = throttle(
      this.updateCursorImmediate.bind(this),
      this.config.performance.throttleMs
    );

    this.throttledUpdateSelection = throttle(
      this.updateSelectionImmediate.bind(this),
      this.config.performance.throttleMs * 2
    );

    this.debouncedBatchUpdate = debounce(
      this.updateShapesBatchImmediate.bind(this),
      this.config.performance.throttleMs * 3
    ) as (boardId: string, updates: ShapeUpdate[]) => Promise<void>;

    // Enable Firestore offline persistence
    if (this.config.firestore.enablePersistence) {
      this.enableFirestorePersistence();
    }
  }

  private async enableFirestorePersistence(): Promise<void> {
    try {
      // Enable offline persistence for Firestore
      await enableIndexedDbPersistence(db);
      console.log("Firestore offline persistence enabled");
    } catch (error) {
      console.warn("Could not enable Firestore persistence:", error);
    }
  }

  // ===============================
  // WHITEBOARD MANAGEMENT (Firestore)
  // ===============================

  async createWhiteboard(
    data: Omit<WhiteboardDocument, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    const startTime = Date.now();

    try {
      const whiteboardData: Omit<WhiteboardDocument, "id"> = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await addDoc(
        collection(db, "whiteboards"),
        whiteboardData
      );

      this.updateMetrics("writes", Date.now() - startTime, "firestore");
      return docRef.id;
    } catch (error) {
      this.handleError("createWhiteboard", error);
      throw error;
    }
  }

  async getWhiteboard(id: string): Promise<WhiteboardDocument | null> {
    const startTime = Date.now();

    try {
      const docRef = doc(db, "whiteboards", id);
      const docSnap = await getDoc(docRef);

      this.updateMetrics("reads", Date.now() - startTime, "firestore");

      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as WhiteboardDocument;
      }
      return null;
    } catch (error) {
      this.handleError("getWhiteboard", error);
      throw error;
    }
  }

  async updateWhiteboard(
    id: string,
    updates: Partial<WhiteboardDocument>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const docRef = doc(db, "whiteboards", id);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date(),
      });

      this.updateMetrics("writes", Date.now() - startTime, "firestore");
    } catch (error) {
      this.handleError("updateWhiteboard", error);
      throw error;
    }
  }

  async deleteWhiteboard(id: string): Promise<void> {
    const startTime = Date.now();

    try {
      const batch = writeBatch(db);

      // Delete whiteboard document
      const whiteboardRef = doc(db, "whiteboards", id);
      batch.delete(whiteboardRef);

      // Delete all shapes in the whiteboard
      const shapesSnapshot = await getDocs(
        collection(db, "whiteboards", id, "shapes")
      );
      shapesSnapshot.forEach((shapeDoc) => {
        batch.delete(shapeDoc.ref);
      });

      await batch.commit();

      // Clean up real-time data
      await this.cleanupRealtimeData(id);

      this.updateMetrics("deletes", Date.now() - startTime, "firestore");
    } catch (error) {
      this.handleError("deleteWhiteboard", error);
      throw error;
    }
  }

  // ===============================
  // SHAPE MANAGEMENT (Firestore with Optimization)
  // ===============================

  async createShape(
    boardId: string,
    shape: Omit<ShapeDocument, "id" | "createdAt" | "updatedAt">
  ): Promise<string> {
    const startTime = Date.now();

    try {
      const shapeData: Omit<ShapeDocument, "id"> = {
        ...shape,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = await addDoc(
        collection(db, "whiteboards", boardId, "shapes"),
        shapeData
      );

      this.updateMetrics("writes", Date.now() - startTime, "firestore");
      return docRef.id;
    } catch (error) {
      this.handleError("createShape", error);
      throw error;
    }
  }

  async updateShape(
    boardId: string,
    shapeId: string,
    updates: Partial<ShapeDocument>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const docRef = doc(db, "whiteboards", boardId, "shapes", shapeId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: new Date(),
      });

      this.updateMetrics("writes", Date.now() - startTime, "firestore");
    } catch (error) {
      this.handleError("updateShape", error);
      throw error;
    }
  }

  /**
   * Batch update multiple shapes efficiently
   * This is where Firestore really shines - partial updates at scale
   */
  async updateShapesBatch(
    boardId: string,
    updates: ShapeUpdate[]
  ): Promise<void> {
    // Use debounced batch update for performance
    return this.debouncedBatchUpdate(boardId, updates);
  }

  private async updateShapesBatchImmediate(
    boardId: string,
    updates: ShapeUpdate[]
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const batch = writeBatch(db);
      const now = new Date();

      updates.forEach(({ shapeId, updates: shapeUpdates }) => {
        const docRef = doc(db, "whiteboards", boardId, "shapes", shapeId);
        batch.update(docRef, {
          ...shapeUpdates,
          updatedAt: now,
        });
      });

      await batch.commit();

      this.updateMetrics("writes", Date.now() - startTime, "firestore");
      console.log(
        `Batch updated ${updates.length} shapes in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      this.handleError("updateShapesBatch", error);
      throw error;
    }
  }

  async deleteShape(boardId: string, shapeId: string): Promise<void> {
    const startTime = Date.now();

    try {
      const docRef = doc(db, "whiteboards", boardId, "shapes", shapeId);
      await deleteDoc(docRef);

      this.updateMetrics("deletes", Date.now() - startTime, "firestore");
    } catch (error) {
      this.handleError("deleteShape", error);
      throw error;
    }
  }

  async getShapes(boardId: string): Promise<ShapeDocument[]> {
    const startTime = Date.now();

    try {
      const shapesQuery = query(
        collection(db, "whiteboards", boardId, "shapes"),
        orderBy("zIndex", "asc")
      );

      const snapshot = await getDocs(shapesQuery);
      const shapes = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as ShapeDocument)
      );

      this.updateMetrics("reads", Date.now() - startTime, "firestore");
      return shapes;
    } catch (error) {
      this.handleError("getShapes", error);
      throw error;
    }
  }

  // ===============================
  // REAL-TIME SUBSCRIPTIONS
  // ===============================

  subscribeToShapes(
    boardId: string,
    callback: (shapes: ShapeDocument[]) => void
  ): () => void {
    const shapesQuery = query(
      collection(db, "whiteboards", boardId, "shapes"),
      orderBy("zIndex", "asc")
    );

    const unsubscribe = onSnapshot(
      shapesQuery,
      (snapshot) => {
        const shapes = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as ShapeDocument)
        );

        callback(shapes);
        this.updateMetrics("reads", 0, "firestore");
      },
      (error) => {
        this.handleError("subscribeToShapes", error);
      }
    );

    this.activeSubscriptions.set(`shapes-${boardId}`, unsubscribe);
    return unsubscribe;
  }

  subscribeToPresence(
    boardId: string,
    callback: (presence: CursorData[]) => void
  ): () => void {
    const presenceRef = ref(realtimeDb, `presence/${boardId}`);

    const handlePresence = (snapshot: any) => {
      const presenceData = snapshot.val() || {};
      const cursors = Object.values(presenceData) as CursorData[];
      callback(cursors);
      this.updateMetrics("reads", 0, "realtimeDb");
    };

    onValue(presenceRef, handlePresence, (error) => {
      this.handleError("subscribeToPresence", error);
    });

    const unsubscribe = () => off(presenceRef, "value", handlePresence);
    this.activeSubscriptions.set(`presence-${boardId}`, unsubscribe);
    return unsubscribe;
  }

  // ===============================
  // REAL-TIME PRESENCE (Realtime Database)
  // ===============================

  async updateCursor(boardId: string, cursorData: CursorData): Promise<void> {
    return this.throttledUpdateCursor(boardId, cursorData);
  }

  private async updateCursorImmediate(
    boardId: string,
    cursorData: CursorData
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const cursorRef = ref(
        realtimeDb,
        `presence/${boardId}/${cursorData.uid}`
      );
      await set(cursorRef, {
        ...cursorData,
        timestamp: serverTimestamp(),
      });

      // Clean up cursor on disconnect
      onDisconnect(cursorRef).remove();

      this.updateMetrics("writes", Date.now() - startTime, "realtimeDb");
    } catch (error) {
      this.handleError("updateCursor", error);
      throw error;
    }
  }

  async updateSelection(
    boardId: string,
    selection: SelectionState
  ): Promise<void> {
    return this.throttledUpdateSelection(boardId, selection);
  }

  private async updateSelectionImmediate(
    boardId: string,
    selection: SelectionState
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const selectionRef = ref(
        realtimeDb,
        `selections/${boardId}/${selection.selectedBy}`
      );
      await set(selectionRef, {
        ...selection,
        timestamp: serverTimestamp(),
      });

      this.updateMetrics("writes", Date.now() - startTime, "realtimeDb");
    } catch (error) {
      this.handleError("updateSelection", error);
      throw error;
    }
  }

  // ===============================
  // MIGRATION UTILITIES
  // ===============================

  async migrateFromLegacy(legacyData: any): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migratedShapes: 0,
      errors: [],
      warnings: [],
      migrationTime: 0,
    };

    try {
      const { id: boardId, shapes = [] } = legacyData;

      if (!boardId) {
        throw new Error("No board ID found in legacy data");
      }

      // Migrate shapes to new format
      const batch = writeBatch(db);

      for (const legacyShape of shapes) {
        try {
          const migratedShape = this.migrateLegacyShape(legacyShape);
          const shapeRef = doc(
            db,
            "whiteboards",
            boardId,
            "shapes",
            migratedShape.id
          );
          batch.set(shapeRef, migratedShape);
          result.migratedShapes++;
        } catch (error) {
          result.errors.push(
            `Failed to migrate shape ${legacyShape.id}: ${error}`
          );
        }
      }

      await batch.commit();

      result.success = true;
      result.migrationTime = Date.now() - startTime;

      console.log(
        `Migration completed: ${result.migratedShapes} shapes in ${result.migrationTime}ms`
      );
    } catch (error) {
      result.errors.push(`Migration failed: ${error}`);
      this.handleError("migrateFromLegacy", error);
    }

    return result;
  }

  private migrateLegacyShape(legacyShape: LegacyShape): ShapeDocument {
    return {
      id: legacyShape.id,
      type: legacyShape.type,
      x1: legacyShape.x1,
      y1: legacyShape.y1,
      x2: legacyShape.x2,
      y2: legacyShape.y2,
      width: legacyShape.width,
      height: legacyShape.height,
      zIndex: legacyShape.zIndex,
      level: legacyShape.level,
      rotation: legacyShape.rotation,
      flipX: legacyShape.flipX,
      flipY: legacyShape.flipY,
      borderRadius: legacyShape.borderRadius,
      borderWidth: legacyShape.borderWidth,
      borderStyle: legacyShape.borderStyle,
      borderColor: legacyShape.borderColor,
      backgroundColor: legacyShape.backgroundColor,
      color: legacyShape.color,
      opacity: legacyShape.opacity,
      text: legacyShape.text,
      fontSize: legacyShape.fontSize,
      fontFamily: legacyShape.fontFamily,
      fontWeight: legacyShape.fontWeight,
      textAlign: legacyShape.textAlign,
      alignItems: legacyShape.alignItems,
      textDecoration: legacyShape.textDecoration,
      lineHeight: legacyShape.lineHeight,
      letterSpacing: legacyShape.letterSpacing,
      rows: legacyShape.rows,
      boardId: legacyShape.boardId,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastChangedBy: legacyShape.uid || "system",
      shapes: legacyShape.shapes?.map((child) => child.id) || undefined,
    };
  }

  // ===============================
  // UTILITY METHODS
  // ===============================

  private async cleanupRealtimeData(boardId: string): Promise<void> {
    try {
      const presenceRef = ref(realtimeDb, `presence/${boardId}`);
      const selectionsRef = ref(realtimeDb, `selections/${boardId}`);

      await Promise.all([remove(presenceRef), remove(selectionsRef)]);
    } catch (error) {
      this.handleError("cleanupRealtimeData", error);
    }
  }

  private updateMetrics(
    operation: "reads" | "writes" | "deletes",
    latency: number,
    database: "firestore" | "realtimeDb"
  ): void {
    this.metrics.operations[operation]++;
    this.metrics.latency[database] = latency;
    this.metrics.timestamp = new Date();
  }

  private handleError(operation: string, error: any): void {
    const errorMessage = `Firebase ${operation} error: ${
      error.message || error
    }`;
    this.metrics.errors.push(errorMessage);
    console.error(errorMessage, error);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): FirebaseMetrics {
    return { ...this.metrics };
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup(): void {
    this.activeSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.activeSubscriptions.clear();
  }

  /**
   * Enable/disable network for Firestore
   */
  async setNetworkEnabled(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await enableNetwork(db);
      } else {
        await disableNetwork(db);
      }
    } catch (error) {
      this.handleError("setNetworkEnabled", error);
    }
  }
}
