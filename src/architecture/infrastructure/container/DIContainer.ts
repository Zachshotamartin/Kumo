// Domain
import { Shape } from "../../domain/entities/Shape";

// Application Interfaces
import { IShapeRepository } from "../../application/interfaces/IShapeRepository";
import { IIdGenerator } from "../../application/interfaces/IIdGenerator";
import { IEventBus } from "../../application/interfaces/IEventBus";

// Application Use Cases
import { ShapeManagementUseCase } from "../../application/useCases/ShapeManagementUseCase";

// Infrastructure Implementations
import { InMemoryShapeRepository } from "../repositories/InMemoryShapeRepository";
import { UuidGenerator } from "../services/UuidGenerator";
import { InMemoryEventBus } from "../services/InMemoryEventBus";

/**
 * Dependency Injection Container
 *
 * Centralized configuration and wiring of all dependencies.
 * Implements the Composition Root pattern.
 * Provides clean separation of concerns and easy testing.
 */

export interface ApplicationServices {
  shapeManagement: ShapeManagementUseCase;
  eventBus: IEventBus;
}

export interface InfrastructureServices {
  shapeRepository: IShapeRepository;
  idGenerator: IIdGenerator;
  eventBus: IEventBus;
}

export type DIContainerConfig = {
  // Repository configuration
  repository?: {
    type: "memory" | "firebase" | "localStorage";
    config?: any;
  };

  // ID generator configuration
  idGenerator?: {
    type: "uuid" | "nanoid" | "custom";
    config?: any;
  };

  // Event bus configuration
  eventBus?: {
    type: "memory" | "redis" | "custom";
    config?: any;
  };

  // Development/testing options
  development?: {
    enableEventLogging?: boolean;
    enablePerformanceTracking?: boolean;
  };
};

export class DIContainer {
  private static instance: DIContainer;
  private _infrastructure: InfrastructureServices;
  private _application: ApplicationServices;
  private _config: DIContainerConfig;

  private constructor(config: DIContainerConfig = {}) {
    this._config = config;
    this._infrastructure = this.createInfrastructureServices();
    this._application = this.createApplicationServices();

    if (config.development?.enableEventLogging) {
      this.enableEventLogging();
    }
  }

  // ===================
  // SINGLETON MANAGEMENT
  // ===================

  static getInstance(config?: DIContainerConfig): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer(config);
    }
    return DIContainer.instance;
  }

  static reset(): void {
    DIContainer.instance = null as any;
  }

  // ===================
  // SERVICE ACCESS
  // ===================

  get application(): ApplicationServices {
    return this._application;
  }

  get infrastructure(): InfrastructureServices {
    return this._infrastructure;
  }

  get config(): DIContainerConfig {
    return this._config;
  }

  // ===================
  // INFRASTRUCTURE FACTORY
  // ===================

  private createInfrastructureServices(): InfrastructureServices {
    // Create Event Bus
    const eventBus = this.createEventBus();

    // Create ID Generator
    const idGenerator = this.createIdGenerator();

    // Create Repository
    const shapeRepository = this.createShapeRepository();

    return {
      shapeRepository,
      idGenerator,
      eventBus,
    };
  }

  private createEventBus(): IEventBus {
    const config = this._config.eventBus || { type: "memory" };

    switch (config.type) {
      case "memory":
        return new InMemoryEventBus();

      // Future implementations
      case "redis":
        throw new Error("Redis event bus not implemented yet");

      case "custom":
        if (!config.config?.implementation) {
          throw new Error("Custom event bus implementation not provided");
        }
        return config.config.implementation;

      default:
        throw new Error(`Unknown event bus type: ${config.type}`);
    }
  }

  private createIdGenerator(): IIdGenerator {
    const config = this._config.idGenerator || { type: "uuid" };

    switch (config.type) {
      case "uuid":
        return new UuidGenerator();

      // Future implementations
      case "nanoid":
        throw new Error("Nanoid generator not implemented yet");

      case "custom":
        if (!config.config?.implementation) {
          throw new Error("Custom ID generator implementation not provided");
        }
        return config.config.implementation;

      default:
        throw new Error(`Unknown ID generator type: ${config.type}`);
    }
  }

  private createShapeRepository(): IShapeRepository {
    const config = this._config.repository || { type: "memory" };

    switch (config.type) {
      case "memory":
        return new InMemoryShapeRepository();

      // Future implementations
      case "firebase":
        throw new Error("Firebase repository not implemented yet");

      case "localStorage":
        throw new Error("LocalStorage repository not implemented yet");

      default:
        throw new Error(`Unknown repository type: ${config.type}`);
    }
  }

  // ===================
  // APPLICATION FACTORY
  // ===================

  private createApplicationServices(): ApplicationServices {
    const shapeManagement = new ShapeManagementUseCase(
      this._infrastructure.shapeRepository,
      this._infrastructure.idGenerator,
      this._infrastructure.eventBus
    );

    return {
      shapeManagement,
      eventBus: this._infrastructure.eventBus,
    };
  }

  // ===================
  // DEVELOPMENT UTILITIES
  // ===================

  private enableEventLogging(): void {
    const originalEmit = this._infrastructure.eventBus.emit.bind(
      this._infrastructure.eventBus
    );

    this._infrastructure.eventBus.emit = function <T>(
      eventName: string,
      data: T
    ): void {
      console.log(`[EVENT] ${eventName}:`, data);
      originalEmit(eventName, data);
    };
  }

  enablePerformanceTracking(): void {
    // Wrap use case methods with performance tracking
    const shapeManagement = this._application.shapeManagement;
    const methods = [
      "createShape",
      "updateShape",
      "deleteShape",
      "moveShape",
    ] as const;

    methods.forEach((methodName) => {
      const originalMethod = shapeManagement[methodName].bind(shapeManagement);

      (shapeManagement as any)[methodName] = async function (...args: any[]) {
        const start = performance.now();
        const result = await (originalMethod as any).apply(this, args);
        const duration = performance.now() - start;

        console.log(`[PERF] ${methodName}: ${duration.toFixed(2)}ms`);
        return result;
      };
    });
  }

  // ===================
  // TESTING UTILITIES
  // ===================

  /**
   * Create a test instance with clean state
   */
  static createTestInstance(config?: Partial<DIContainerConfig>): DIContainer {
    return new DIContainer({
      repository: { type: "memory" },
      idGenerator: { type: "uuid" },
      eventBus: { type: "memory" },
      development: {
        enableEventLogging: false,
        enablePerformanceTracking: false,
      },
      ...config,
    });
  }

  /**
   * Seed the repository with test data
   */
  async seedTestData(shapes: Shape[]): Promise<void> {
    if (
      this._infrastructure.shapeRepository instanceof InMemoryShapeRepository
    ) {
      this._infrastructure.shapeRepository.loadFromSnapshot(shapes);
    } else {
      // For other repositories, save individually
      await Promise.all(
        shapes.map((shape) => this._infrastructure.shapeRepository.save(shape))
      );
    }
  }

  /**
   * Clear all data (useful for testing)
   */
  async clearData(): Promise<void> {
    await this._infrastructure.shapeRepository.clear();
    this._infrastructure.eventBus.clear();
  }

  /**
   * Get current state snapshot (useful for testing)
   */
  async getStateSnapshot(): Promise<{
    shapes: Shape[];
    eventHandlers: string[];
  }> {
    return {
      shapes: await this._infrastructure.shapeRepository.findAll(),
      eventHandlers: this._infrastructure.eventBus.getEventNames(),
    };
  }
}
