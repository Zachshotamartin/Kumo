import { Shape, Point, Bounds } from "../../domain/entities/Shape";
import { IShapeRepository } from "../interfaces/IShapeRepository";
import { IIdGenerator } from "../interfaces/IIdGenerator";
import { IEventBus } from "../interfaces/IEventBus";

/**
 * Application Use Case: Shape Management
 *
 * Contains business logic for shape operations.
 * Orchestrates between domain entities and infrastructure.
 * Pure business logic, no UI or framework dependencies.
 */

export interface ShapeManagementResult {
  success: boolean;
  error?: string;
  shapes?: Shape[];
  shape?: Shape;
}

export interface CreateShapeRequest {
  type: Shape["type"];
  bounds: Bounds;
  style?: Shape["style"];
  text?: string;
  imageUrl?: string;
}

export interface UpdateShapeRequest {
  id: string;
  bounds?: Bounds;
  style?: Partial<Shape["style"]>;
  text?: string;
  zIndex?: number;
}

export interface MoveShapeRequest {
  id: string;
  deltaX: number;
  deltaY: number;
}

export interface ReorderShapeRequest {
  shapeId: string;
  targetZIndex: number;
}

export interface CreateComponentRequest {
  shapeIds: string[];
  name?: string;
}

export class ShapeManagementUseCase {
  constructor(
    private shapeRepository: IShapeRepository,
    private idGenerator: IIdGenerator,
    private eventBus: IEventBus
  ) {}

  // ===================
  // SHAPE CRUD OPERATIONS
  // ===================

  /**
   * Create a new shape
   */
  async createShape(
    request: CreateShapeRequest
  ): Promise<ShapeManagementResult> {
    try {
      // Generate unique ID
      const id = this.idGenerator.generate();

      // Create shape entity
      const shape = new Shape({
        id,
        type: request.type,
        bounds: request.bounds,
        style: request.style,
        text: request.text,
        imageUrl: request.imageUrl,
        zIndex: await this.getNextZIndex(),
      });

      // Validate business rules
      if (!shape.isValid()) {
        return {
          success: false,
          error: "Invalid shape configuration",
        };
      }

      // Save to repository
      await this.shapeRepository.save(shape);

      // Emit domain event
      this.eventBus.emit("shape.created", { shape });

      return {
        success: true,
        shape,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update an existing shape
   */
  async updateShape(
    request: UpdateShapeRequest
  ): Promise<ShapeManagementResult> {
    try {
      // Get existing shape
      const existingShape = await this.shapeRepository.findById(request.id);
      if (!existingShape) {
        return {
          success: false,
          error: "Shape not found",
        };
      }

      // Apply updates using domain methods
      let updatedShape = existingShape;

      if (request.bounds) {
        updatedShape = updatedShape.withBounds(request.bounds);
      }

      if (request.style) {
        updatedShape = updatedShape.withStyle(request.style);
      }

      if (request.text !== undefined) {
        updatedShape = updatedShape.withText(request.text);
      }

      if (request.zIndex !== undefined) {
        updatedShape = updatedShape.withZIndex(request.zIndex);
      }

      // Validate business rules
      if (!updatedShape.isValid()) {
        return {
          success: false,
          error: "Updated shape configuration is invalid",
        };
      }

      // Save to repository
      await this.shapeRepository.save(updatedShape);

      // Emit domain event
      this.eventBus.emit("shape.updated", {
        shape: updatedShape,
        previousShape: existingShape,
      });

      return {
        success: true,
        shape: updatedShape,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Delete a shape
   */
  async deleteShape(id: string): Promise<ShapeManagementResult> {
    try {
      const shape = await this.shapeRepository.findById(id);
      if (!shape) {
        return {
          success: false,
          error: "Shape not found",
        };
      }

      // Business rule: Cannot delete component with children
      if (
        shape.type === "component" &&
        shape.children &&
        shape.children.length > 0
      ) {
        return {
          success: false,
          error: "Cannot delete component with children. Flatten first.",
        };
      }

      await this.shapeRepository.delete(id);

      // Emit domain event
      this.eventBus.emit("shape.deleted", { shape });

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Delete multiple shapes
   */
  async deleteShapes(ids: string[]): Promise<ShapeManagementResult> {
    try {
      const results = await Promise.all(ids.map((id) => this.deleteShape(id)));

      const failed = results.filter((result) => !result.success);
      if (failed.length > 0) {
        return {
          success: false,
          error: `Failed to delete ${failed.length} shapes`,
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===================
  // SHAPE OPERATIONS
  // ===================

  /**
   * Move a shape by delta coordinates
   */
  async moveShape(request: MoveShapeRequest): Promise<ShapeManagementResult> {
    try {
      const shape = await this.shapeRepository.findById(request.id);
      if (!shape) {
        return {
          success: false,
          error: "Shape not found",
        };
      }

      const movedShape = shape.move(request.deltaX, request.deltaY);
      await this.shapeRepository.save(movedShape);

      this.eventBus.emit("shape.moved", {
        shape: movedShape,
        deltaX: request.deltaX,
        deltaY: request.deltaY,
      });

      return {
        success: true,
        shape: movedShape,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Move multiple shapes together
   */
  async moveShapes(
    shapeIds: string[],
    deltaX: number,
    deltaY: number
  ): Promise<ShapeManagementResult> {
    try {
      const shapes = await Promise.all(
        shapeIds.map((id) => this.shapeRepository.findById(id))
      );

      const movedShapes = shapes
        .filter((shape): shape is Shape => shape !== null)
        .map((shape) => shape.move(deltaX, deltaY));

      await Promise.all(
        movedShapes.map((shape) => this.shapeRepository.save(shape))
      );

      this.eventBus.emit("shapes.moved", {
        shapes: movedShapes,
        deltaX,
        deltaY,
      });

      return {
        success: true,
        shapes: movedShapes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Reorder shape in z-index
   */
  async reorderShape(
    request: ReorderShapeRequest
  ): Promise<ShapeManagementResult> {
    try {
      const allShapes = await this.shapeRepository.findAll();
      const targetShape = allShapes.find((s) => s.id === request.shapeId);

      if (!targetShape) {
        return {
          success: false,
          error: "Shape not found",
        };
      }

      // Calculate new z-indices for affected shapes
      const updatedShapes = this.calculateZIndexReordering(
        allShapes,
        targetShape,
        request.targetZIndex
      );

      // Save all updated shapes
      await Promise.all(
        updatedShapes.map((shape) => this.shapeRepository.save(shape))
      );

      this.eventBus.emit("shapes.reordered", { shapes: updatedShapes });

      return {
        success: true,
        shapes: updatedShapes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===================
  // COMPONENT OPERATIONS
  // ===================

  /**
   * Create a component from multiple shapes
   */
  async createComponent(
    request: CreateComponentRequest
  ): Promise<ShapeManagementResult> {
    try {
      if (request.shapeIds.length === 0) {
        return {
          success: false,
          error: "Cannot create component with no shapes",
        };
      }

      // Get all shapes
      const shapes = await Promise.all(
        request.shapeIds.map((id) => this.shapeRepository.findById(id))
      );

      const validShapes = shapes.filter(
        (shape): shape is Shape => shape !== null
      );

      if (validShapes.length !== request.shapeIds.length) {
        return {
          success: false,
          error: "Some shapes not found",
        };
      }

      // Business rule: Cannot create component containing other components
      const hasComponent = validShapes.some(
        (shape) => shape.type === "component"
      );
      if (hasComponent) {
        return {
          success: false,
          error: "Cannot create component containing other components",
        };
      }

      // Create component using domain logic
      const componentId = this.idGenerator.generate();
      const component = new Shape({
        id: componentId,
        type: "component",
        bounds: this.calculateComponentBounds(validShapes),
        style: { backgroundColor: "transparent" },
        zIndex: Math.max(...validShapes.map((s) => s.zIndex)) + 1,
        children: validShapes.map(
          (shape) =>
            new Shape({
              ...shape,
              level: shape.level + 1,
            })
        ),
      });

      // Save component and delete individual shapes
      await this.shapeRepository.save(component);
      await Promise.all(
        request.shapeIds.map((id) => this.shapeRepository.delete(id))
      );

      this.eventBus.emit("component.created", {
        component,
        originalShapes: validShapes,
      });

      return {
        success: true,
        shape: component,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Flatten a component back to individual shapes
   */
  async flattenComponent(componentId: string): Promise<ShapeManagementResult> {
    try {
      const component = await this.shapeRepository.findById(componentId);
      if (!component) {
        return {
          success: false,
          error: "Component not found",
        };
      }

      if (component.type !== "component") {
        return {
          success: false,
          error: "Shape is not a component",
        };
      }

      // Flatten component using domain logic
      const flattenedShapes = component.flatten().map(
        (shape) =>
          new Shape({
            ...shape,
            level: 0,
            id: this.idGenerator.generate(), // New IDs for flattened shapes
          })
      );

      // Save flattened shapes and delete component
      await Promise.all(
        flattenedShapes.map((shape) => this.shapeRepository.save(shape))
      );
      await this.shapeRepository.delete(componentId);

      this.eventBus.emit("component.flattened", {
        component,
        flattenedShapes,
      });

      return {
        success: true,
        shapes: flattenedShapes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===================
  // QUERY OPERATIONS
  // ===================

  /**
   * Get all shapes
   */
  async getAllShapes(): Promise<ShapeManagementResult> {
    try {
      const shapes = await this.shapeRepository.findAll();
      return {
        success: true,
        shapes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get shapes at a specific point
   */
  async getShapesAtPoint(point: Point): Promise<ShapeManagementResult> {
    try {
      const allShapes = await this.shapeRepository.findAll();
      const shapesAtPoint = allShapes.filter((shape) =>
        shape.containsPoint(point)
      );

      // Sort by z-index (highest first)
      shapesAtPoint.sort((a, b) => b.zIndex - a.zIndex);

      return {
        success: true,
        shapes: shapesAtPoint,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get shapes in a bounding box
   */
  async getShapesInBounds(bounds: Bounds): Promise<ShapeManagementResult> {
    try {
      const allShapes = await this.shapeRepository.findAll();
      const shapesInBounds = allShapes.filter((shape) =>
        this.boundsIntersect(shape.bounds, bounds)
      );

      return {
        success: true,
        shapes: shapesInBounds,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===================
  // PRIVATE HELPERS
  // ===================

  private async getNextZIndex(): Promise<number> {
    const allShapes = await this.shapeRepository.findAll();
    if (allShapes.length === 0) return 1;
    return Math.max(...allShapes.map((s) => s.zIndex)) + 1;
  }

  private calculateComponentBounds(shapes: Shape[]): Bounds {
    if (shapes.length === 0) {
      throw new Error("Cannot calculate bounds for empty shapes array");
    }

    const x1 = Math.min(...shapes.map((s) => s.bounds.x1));
    const y1 = Math.min(...shapes.map((s) => s.bounds.y1));
    const x2 = Math.max(...shapes.map((s) => s.bounds.x2));
    const y2 = Math.max(...shapes.map((s) => s.bounds.y2));

    return {
      x1,
      y1,
      x2,
      y2,
      width: x2 - x1,
      height: y2 - y1,
    };
  }

  private calculateZIndexReordering(
    allShapes: Shape[],
    targetShape: Shape,
    newZIndex: number
  ): Shape[] {
    const sortedShapes = [...allShapes].sort((a, b) => a.zIndex - b.zIndex);
    const targetCurrentIndex = sortedShapes.findIndex(
      (s) => s.id === targetShape.id
    );

    // Remove target shape from array
    sortedShapes.splice(targetCurrentIndex, 1);

    // Insert at new position
    sortedShapes.splice(newZIndex, 0, targetShape);

    // Reassign z-indices
    return sortedShapes.map((shape, index) => shape.withZIndex(index + 1));
  }

  private boundsIntersect(bounds1: Bounds, bounds2: Bounds): boolean {
    return !(
      bounds1.x2 < bounds2.x1 ||
      bounds1.x1 > bounds2.x2 ||
      bounds1.y2 < bounds2.y1 ||
      bounds1.y1 > bounds2.y2
    );
  }
}
