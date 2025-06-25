import { Shape } from "../../domain/entities/Shape";

/**
 * Shape Repository Interface
 *
 * Defines the contract for shape data persistence.
 * Infrastructure layer implements this interface.
 * Application layer depends on this abstraction, not concrete implementations.
 */
export interface IShapeRepository {
  /**
   * Save a shape (create or update)
   */
  save(shape: Shape): Promise<void>;

  /**
   * Find a shape by ID
   */
  findById(id: string): Promise<Shape | null>;

  /**
   * Find all shapes
   */
  findAll(): Promise<Shape[]>;

  /**
   * Find shapes by type
   */
  findByType(type: Shape["type"]): Promise<Shape[]>;

  /**
   * Find shapes by z-index range
   */
  findByZIndexRange(minZ: number, maxZ: number): Promise<Shape[]>;

  /**
   * Delete a shape by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete multiple shapes by IDs
   */
  deleteMany(ids: string[]): Promise<void>;

  /**
   * Check if a shape exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Get the count of shapes
   */
  count(): Promise<number>;

  /**
   * Clear all shapes
   */
  clear(): Promise<void>;
}
