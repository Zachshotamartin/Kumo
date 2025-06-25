import { IShapeRepository } from "../../application/interfaces/IShapeRepository";
import { Shape } from "../../domain/entities/Shape";

/**
 * In-Memory Shape Repository Implementation
 *
 * Simple in-memory storage for shapes.
 * Suitable for development, testing, and small applications.
 * Can be easily replaced with persistent storage implementations.
 */
export class InMemoryShapeRepository implements IShapeRepository {
  private shapes: Map<string, Shape> = new Map();

  async save(shape: Shape): Promise<void> {
    this.shapes.set(shape.id, shape);
  }

  async findById(id: string): Promise<Shape | null> {
    return this.shapes.get(id) || null;
  }

  async findAll(): Promise<Shape[]> {
    return Array.from(this.shapes.values());
  }

  async findByType(type: Shape["type"]): Promise<Shape[]> {
    return Array.from(this.shapes.values()).filter(
      (shape) => shape.type === type
    );
  }

  async findByZIndexRange(minZ: number, maxZ: number): Promise<Shape[]> {
    return Array.from(this.shapes.values()).filter(
      (shape) => shape.zIndex >= minZ && shape.zIndex <= maxZ
    );
  }

  async delete(id: string): Promise<void> {
    this.shapes.delete(id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    ids.forEach((id) => this.shapes.delete(id));
  }

  async exists(id: string): Promise<boolean> {
    return this.shapes.has(id);
  }

  async count(): Promise<number> {
    return this.shapes.size;
  }

  async clear(): Promise<void> {
    this.shapes.clear();
  }

  // Additional helper methods for testing
  getSnapshot(): Shape[] {
    return Array.from(this.shapes.values());
  }

  loadFromSnapshot(shapes: Shape[]): void {
    this.shapes.clear();
    shapes.forEach((shape) => this.shapes.set(shape.id, shape));
  }
}
