import { ShapeRegistryImpl } from "./ShapeRegistry";
import { ShapeFactoryImpl } from "./ShapeFactory";
import { BaseShape, ShapePlugin, ShapeSystemConfig } from "../types";

// Import default shape plugins
import { rectangleShapePlugin } from "../plugins/RectangleShapePlugin";
import { ellipseShapePlugin } from "../plugins/EllipseShapePlugin";
import { textShapePlugin } from "../plugins/TextShapePlugin";

/**
 * Main shape system manager that coordinates all shape-related functionality
 */
export class ShapeSystem {
  private registry: ShapeRegistryImpl;
  private factory: ShapeFactoryImpl;
  private config: ShapeSystemConfig;

  constructor(config?: Partial<ShapeSystemConfig>) {
    this.config = {
      enableValidation: true,
      enablePerformanceOptimizations: true,
      maxShapes: 10000,
      defaultZoomLevel: 1,
      enableShapeRegistry: true,
      enableCustomProperties: true,
      ...config,
    };

    this.registry = new ShapeRegistryImpl();
    this.factory = new ShapeFactoryImpl(this.registry);

    this.initializeDefaultPlugins();
  }

  /**
   * Initialize default shape plugins
   */
  private initializeDefaultPlugins(): void {
    // Register core shape types
    this.registry.register(rectangleShapePlugin, {
      type: "rectangle",
      enabled: true,
      defaultProperties: {
        backgroundColor: "#ffffff",
        borderColor: "#000000",
        borderWidth: 1,
      },
      renderOptions: {
        enableHover: true,
        enableSelection: true,
        customCursor: "pointer",
      },
    });

    this.registry.register(ellipseShapePlugin, {
      type: "ellipse",
      enabled: true,
      defaultProperties: {
        backgroundColor: "#ffffff",
        borderColor: "#000000",
        borderWidth: 1,
        borderRadius: 1000,
      },
      renderOptions: {
        enableHover: true,
        enableSelection: true,
        customCursor: "pointer",
      },
    });

    this.registry.register(textShapePlugin, {
      type: "text",
      enabled: true,
      defaultProperties: {
        backgroundColor: "transparent",
        color: "#000000",
        fontSize: 16,
        text: "Double-click to edit",
      },
      renderOptions: {
        enableHover: true,
        enableSelection: true,
        customCursor: "text",
      },
    });

    console.log(
      "Shape system initialized with plugins:",
      this.registry.getRegisteredTypes()
    );
  }

  /**
   * Get the shape registry
   */
  getRegistry(): ShapeRegistryImpl {
    return this.registry;
  }

  /**
   * Get the shape factory
   */
  getFactory(): ShapeFactoryImpl {
    return this.factory;
  }

  /**
   * Get system configuration
   */
  getConfig(): ShapeSystemConfig {
    return { ...this.config };
  }

  /**
   * Update system configuration
   */
  updateConfig(updates: Partial<ShapeSystemConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Register a new shape plugin
   */
  registerPlugin(plugin: ShapePlugin): void {
    this.registry.register(plugin);
  }

  /**
   * Create a shape
   */
  createShape(
    type: string,
    x: number,
    y: number,
    zIndex?: number
  ): BaseShape | null {
    if (!this.config.enableShapeRegistry) {
      console.error("Shape registry is disabled in configuration");
      return null;
    }

    return this.factory.createDefault(type, x, y, zIndex);
  }

  /**
   * Create a shape with dimensions
   */
  createShapeWithDimensions(
    type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex?: number
  ): BaseShape | null {
    return this.factory.createWithDimensions(type, x, y, width, height, zIndex);
  }

  /**
   * Clone a shape
   */
  cloneShape(shape: BaseShape): BaseShape {
    return this.factory.clone(shape);
  }

  /**
   * Update a shape
   */
  updateShape(shape: BaseShape, updates: Partial<BaseShape>): BaseShape {
    const updatedShape = this.factory.updateShape(shape, updates);

    if (
      this.config.enableValidation &&
      !this.factory.validateShape(updatedShape)
    ) {
      console.warn("Updated shape failed validation:", updatedShape);
    }

    return updatedShape;
  }

  /**
   * Validate a shape
   */
  validateShape(shape: BaseShape): boolean {
    if (!this.config.enableValidation) {
      return true;
    }

    return this.factory.validateShape(shape);
  }

  /**
   * Get available shape types
   */
  getAvailableShapeTypes(): string[] {
    return this.factory.getAvailableTypes();
  }

  /**
   * Check if shape type is available
   */
  isShapeTypeAvailable(type: string): boolean {
    return this.factory.isTypeAvailable(type);
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    const registryStats = this.registry.getStats();

    return {
      config: this.config,
      registry: registryStats,
      factory: {
        availableTypes: this.factory.getAvailableTypes(),
      },
      performance: {
        memoryUsage: this.getMemoryUsage(),
        totalPlugins: registryStats.totalPlugins,
      },
    };
  }

  /**
   * Get memory usage estimate
   */
  private getMemoryUsage(): string {
    // Simple memory usage estimation
    const registrySize = this.registry.getAllPlugins().length;
    const estimatedBytes = registrySize * 1024; // Rough estimate

    if (estimatedBytes < 1024) {
      return `${estimatedBytes} bytes`;
    } else if (estimatedBytes < 1024 * 1024) {
      return `${(estimatedBytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.registry.clear();
    console.log("Shape system disposed");
  }

  /**
   * Export system state for debugging
   */
  exportState() {
    return {
      config: this.config,
      registry: this.registry.exportState(),
      stats: this.getSystemStats(),
    };
  }

  /**
   * Enable/disable a shape type
   */
  setShapeTypeEnabled(type: string, enabled: boolean): void {
    this.registry.setPluginEnabled(type, enabled);
  }

  /**
   * Batch create multiple shapes
   */
  createShapeBatch(
    requests: Array<{
      type: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      properties?: Partial<BaseShape>;
    }>
  ): BaseShape[] {
    const shapes: BaseShape[] = [];

    requests.forEach(({ type, x, y, width, height, properties }) => {
      let shape: BaseShape | null;

      if (width !== undefined && height !== undefined) {
        shape = this.createShapeWithDimensions(type, x, y, width, height);
      } else {
        shape = this.createShape(type, x, y);
      }

      if (shape && properties) {
        shape = this.updateShape(shape, properties);
      }

      if (shape) {
        shapes.push(shape);
      }
    });

    return shapes;
  }

  /**
   * Create component from shapes
   */
  createComponent(shapes: BaseShape[], zIndex?: number): BaseShape | null {
    return this.factory.createComponent(shapes, zIndex);
  }

  /**
   * Extract shapes from component
   */
  extractFromComponent(component: BaseShape): BaseShape[] {
    return this.factory.extractFromComponent(component);
  }

  /**
   * Get shape plugin for a specific type
   */
  getPlugin(type: string): ShapePlugin | undefined {
    return this.registry.getPlugin(type);
  }
}

// Global instance
let globalShapeSystem: ShapeSystem | null = null;

/**
 * Get or create the global shape system instance
 */
export function getShapeSystem(
  config?: Partial<ShapeSystemConfig>
): ShapeSystem {
  if (!globalShapeSystem) {
    globalShapeSystem = new ShapeSystem(config);
  }
  return globalShapeSystem;
}

/**
 * Reset the global shape system (useful for testing)
 */
export function resetShapeSystem(): void {
  if (globalShapeSystem) {
    globalShapeSystem.dispose();
    globalShapeSystem = null;
  }
}
