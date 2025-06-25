import { useState, useEffect, useCallback } from "react";
import { DIContainer } from "../../infrastructure/container/DIContainer";
import { Shape, Point, Bounds } from "../../domain/entities/Shape";
import {
  ShapeManagementUseCase,
  CreateShapeRequest,
  UpdateShapeRequest,
  MoveShapeRequest,
  CreateComponentRequest,
} from "../../application/useCases/ShapeManagementUseCase";

/**
 * Shape Management Hook
 *
 * Provides React components with clean interface to shape business logic.
 * Separates business concerns from UI concerns.
 * Acts as adapter between React and Clean Architecture layers.
 */

export interface UseShapeManagementState {
  shapes: Shape[];
  loading: boolean;
  error: string | null;
  selectedShapes: Set<string>;
}

export interface UseShapeManagementActions {
  // Shape CRUD
  createShape: (request: CreateShapeRequest) => Promise<boolean>;
  updateShape: (request: UpdateShapeRequest) => Promise<boolean>;
  deleteShape: (id: string) => Promise<boolean>;
  deleteSelectedShapes: () => Promise<boolean>;

  // Shape operations
  moveShape: (request: MoveShapeRequest) => Promise<boolean>;
  moveSelectedShapes: (deltaX: number, deltaY: number) => Promise<boolean>;
  reorderShape: (shapeId: string, targetZIndex: number) => Promise<boolean>;

  // Component operations
  createComponent: (request: CreateComponentRequest) => Promise<boolean>;
  flattenComponent: (componentId: string) => Promise<boolean>;

  // Selection operations
  selectShape: (id: string) => void;
  selectShapes: (ids: string[]) => void;
  toggleShapeSelection: (id: string) => void;
  clearSelection: () => void;
  selectShapesAtPoint: (point: Point) => Promise<void>;
  selectShapesInBounds: (bounds: Bounds) => Promise<void>;

  // Query operations
  getShapesAtPoint: (point: Point) => Promise<Shape[]>;
  getShapesInBounds: (bounds: Bounds) => Promise<Shape[]>;

  // State management
  refreshShapes: () => Promise<void>;
  clearError: () => void;
}

export interface UseShapeManagementReturn {
  state: UseShapeManagementState;
  actions: UseShapeManagementActions;
}

export function useShapeManagement(
  container: DIContainer = DIContainer.getInstance()
): UseShapeManagementReturn {
  // ===================
  // STATE
  // ===================

  const [state, setState] = useState<UseShapeManagementState>({
    shapes: [],
    loading: false,
    error: null,
    selectedShapes: new Set(),
  });

  const shapeManagement = container.application.shapeManagement;
  const eventBus = container.application.eventBus;

  // ===================
  // EFFECTS
  // ===================

  // Load initial shapes
  useEffect(() => {
    refreshShapes();
  }, []);

  // Subscribe to domain events
  useEffect(() => {
    const handleShapeCreated = () => refreshShapes();
    const handleShapeUpdated = () => refreshShapes();
    const handleShapeDeleted = () => refreshShapes();
    const handleShapesMoved = () => refreshShapes();
    const handleShapesReordered = () => refreshShapes();
    const handleComponentCreated = () => refreshShapes();
    const handleComponentFlattened = () => refreshShapes();

    eventBus.subscribe("shape.created", handleShapeCreated);
    eventBus.subscribe("shape.updated", handleShapeUpdated);
    eventBus.subscribe("shape.deleted", handleShapeDeleted);
    eventBus.subscribe("shapes.moved", handleShapesMoved);
    eventBus.subscribe("shapes.reordered", handleShapesReordered);
    eventBus.subscribe("component.created", handleComponentCreated);
    eventBus.subscribe("component.flattened", handleComponentFlattened);

    return () => {
      eventBus.unsubscribe("shape.created", handleShapeCreated);
      eventBus.unsubscribe("shape.updated", handleShapeUpdated);
      eventBus.unsubscribe("shape.deleted", handleShapeDeleted);
      eventBus.unsubscribe("shapes.moved", handleShapesMoved);
      eventBus.unsubscribe("shapes.reordered", handleShapesReordered);
      eventBus.unsubscribe("component.created", handleComponentCreated);
      eventBus.unsubscribe("component.flattened", handleComponentFlattened);
    };
  }, [eventBus]);

  // ===================
  // UTILITY FUNCTIONS
  // ===================

  const updateState = useCallback(
    (updates: Partial<UseShapeManagementState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const setLoading = useCallback(
    (loading: boolean) => {
      updateState({ loading });
    },
    [updateState]
  );

  const setError = useCallback(
    (error: string | null) => {
      updateState({ error });
    },
    [updateState]
  );

  const refreshShapes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await shapeManagement.getAllShapes();
      if (result.success && result.shapes) {
        updateState({ shapes: result.shapes });
      } else {
        setError(result.error || "Failed to load shapes");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [shapeManagement, setLoading, setError, updateState]);

  // ===================
  // SHAPE CRUD ACTIONS
  // ===================

  const createShape = useCallback(
    async (request: CreateShapeRequest): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.createShape(request);
        if (!result.success) {
          setError(result.error || "Failed to create shape");
          return false;
        }
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError]
  );

  const updateShape = useCallback(
    async (request: UpdateShapeRequest): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.updateShape(request);
        if (!result.success) {
          setError(result.error || "Failed to update shape");
          return false;
        }
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError]
  );

  const deleteShape = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.deleteShape(id);
        if (!result.success) {
          setError(result.error || "Failed to delete shape");
          return false;
        }

        // Remove from selection if selected
        if (state.selectedShapes.has(id)) {
          const newSelection = new Set(state.selectedShapes);
          newSelection.delete(id);
          updateState({ selectedShapes: newSelection });
        }

        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError, state.selectedShapes, updateState]
  );

  const deleteSelectedShapes = useCallback(async (): Promise<boolean> => {
    if (state.selectedShapes.size === 0) return true;

    setLoading(true);
    setError(null);

    try {
      const result = await shapeManagement.deleteShapes(
        Array.from(state.selectedShapes)
      );
      if (!result.success) {
        setError(result.error || "Failed to delete shapes");
        return false;
      }

      // Clear selection
      updateState({ selectedShapes: new Set() });
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error");
      return false;
    } finally {
      setLoading(false);
    }
  }, [
    shapeManagement,
    setLoading,
    setError,
    state.selectedShapes,
    updateState,
  ]);

  // ===================
  // SHAPE OPERATION ACTIONS
  // ===================

  const moveShape = useCallback(
    async (request: MoveShapeRequest): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.moveShape(request);
        if (!result.success) {
          setError(result.error || "Failed to move shape");
          return false;
        }
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError]
  );

  const moveSelectedShapes = useCallback(
    async (deltaX: number, deltaY: number): Promise<boolean> => {
      if (state.selectedShapes.size === 0) return true;

      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.moveShapes(
          Array.from(state.selectedShapes),
          deltaX,
          deltaY
        );
        if (!result.success) {
          setError(result.error || "Failed to move shapes");
          return false;
        }
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError, state.selectedShapes]
  );

  const reorderShape = useCallback(
    async (shapeId: string, targetZIndex: number): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.reorderShape({
          shapeId,
          targetZIndex,
        });
        if (!result.success) {
          setError(result.error || "Failed to reorder shape");
          return false;
        }
        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError]
  );

  // ===================
  // COMPONENT ACTIONS
  // ===================

  const createComponent = useCallback(
    async (request: CreateComponentRequest): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.createComponent(request);
        if (!result.success) {
          setError(result.error || "Failed to create component");
          return false;
        }

        // Update selection to new component
        if (result.shape) {
          updateState({ selectedShapes: new Set([result.shape.id]) });
        }

        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError, updateState]
  );

  const flattenComponent = useCallback(
    async (componentId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await shapeManagement.flattenComponent(componentId);
        if (!result.success) {
          setError(result.error || "Failed to flatten component");
          return false;
        }

        // Update selection to flattened shapes
        if (result.shapes) {
          updateState({
            selectedShapes: new Set(result.shapes.map((s) => s.id)),
          });
        }

        return true;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [shapeManagement, setLoading, setError, updateState]
  );

  // ===================
  // SELECTION ACTIONS
  // ===================

  const selectShape = useCallback(
    (id: string) => {
      updateState({ selectedShapes: new Set([id]) });
    },
    [updateState]
  );

  const selectShapes = useCallback(
    (ids: string[]) => {
      updateState({ selectedShapes: new Set(ids) });
    },
    [updateState]
  );

  const toggleShapeSelection = useCallback(
    (id: string) => {
      const newSelection = new Set(state.selectedShapes);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      updateState({ selectedShapes: newSelection });
    },
    [state.selectedShapes, updateState]
  );

  const clearSelection = useCallback(() => {
    updateState({ selectedShapes: new Set() });
  }, [updateState]);

  const selectShapesAtPoint = useCallback(
    async (point: Point) => {
      try {
        const result = await shapeManagement.getShapesAtPoint(point);
        if (result.success && result.shapes) {
          updateState({
            selectedShapes: new Set(result.shapes.map((s) => s.id)),
          });
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
      }
    },
    [shapeManagement, updateState, setError]
  );

  const selectShapesInBounds = useCallback(
    async (bounds: Bounds) => {
      try {
        const result = await shapeManagement.getShapesInBounds(bounds);
        if (result.success && result.shapes) {
          updateState({
            selectedShapes: new Set(result.shapes.map((s) => s.id)),
          });
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
      }
    },
    [shapeManagement, updateState, setError]
  );

  // ===================
  // QUERY ACTIONS
  // ===================

  const getShapesAtPoint = useCallback(
    async (point: Point): Promise<Shape[]> => {
      try {
        const result = await shapeManagement.getShapesAtPoint(point);
        return result.success && result.shapes ? result.shapes : [];
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return [];
      }
    },
    [shapeManagement, setError]
  );

  const getShapesInBounds = useCallback(
    async (bounds: Bounds): Promise<Shape[]> => {
      try {
        const result = await shapeManagement.getShapesInBounds(bounds);
        return result.success && result.shapes ? result.shapes : [];
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        return [];
      }
    },
    [shapeManagement, setError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  // ===================
  // RETURN INTERFACE
  // ===================

  return {
    state,
    actions: {
      // CRUD
      createShape,
      updateShape,
      deleteShape,
      deleteSelectedShapes,

      // Operations
      moveShape,
      moveSelectedShapes,
      reorderShape,

      // Components
      createComponent,
      flattenComponent,

      // Selection
      selectShape,
      selectShapes,
      toggleShapeSelection,
      clearSelection,
      selectShapesAtPoint,
      selectShapesInBounds,

      // Queries
      getShapesAtPoint,
      getShapesInBounds,

      // State
      refreshShapes,
      clearError,
    },
  };
}
