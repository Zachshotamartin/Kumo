import { testUtils } from "../utils/TestUtils";
import { DIContainer } from "../../architecture/infrastructure/container/DIContainer";

/**
 * Architecture Test Suite
 *
 * Comprehensive testing utilities specifically designed for testing
 * the Clean Architecture implementation in Kumo.
 */
export class ArchitectureTestSuite {
  private container: DIContainer;

  constructor(container?: DIContainer) {
    this.container = container || DIContainer.createTestInstance();
  }

  /**
   * Test domain entities
   */
  async testDomainLayer(): Promise<void> {
    const { shapes, state } = this.container.domain;

    // Test shape entities
    describe("Domain Layer - Shape Entities", () => {
      it("should create shapes with valid properties", () => {
        const shapeData = testUtils.createTestShapes(1)[0];
        const shape = shapes.createShape(shapeData);

        expect(shape.id).toBe(shapeData.id);
        expect(shape.type).toBe(shapeData.type);
        expect(shape.bounds).toEqual(shapeData.bounds);
      });

      it("should move shapes correctly", () => {
        const shapeData = testUtils.createTestShapes(1)[0];
        const shape = shapes.createShape(shapeData);
        const moved = shape.move(10, 20);

        expect(moved.bounds.x1).toBe(shape.bounds.x1 + 10);
        expect(moved.bounds.y1).toBe(shape.bounds.y1 + 20);
      });

      it("should resize shapes correctly", () => {
        const shapeData = testUtils.createTestShapes(1)[0];
        const shape = shapes.createShape(shapeData);
        const resized = shape.resize(200, 150);

        expect(resized.bounds.width).toBe(200);
        expect(resized.bounds.height).toBe(150);
      });
    });

    // Test state entities
    describe("Domain Layer - State Management", () => {
      it("should handle state transitions correctly", () => {
        const initialState = state.createInitialState();
        const newState = state.transition(initialState, "SELECT_TOOL", {
          tool: "rectangle",
        });

        expect(newState.currentTool).toBe("rectangle");
      });

      it("should validate state transitions", () => {
        const initialState = state.createInitialState();

        expect(() => {
          state.transition(initialState, "INVALID_ACTION" as any, {});
        }).toThrow();
      });
    });
  }

  /**
   * Test application use cases
   */
  async testApplicationLayer(): Promise<void> {
    const { application } = this.container;

    describe("Application Layer - Use Cases", () => {
      beforeEach(() => {
        // Reset container state
        this.container = DIContainer.createTestInstance();
      });

      it("should create shapes through use case", async () => {
        const result = await application.shapeManagement.createShape({
          type: "rectangle",
          bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
        });

        expect(result.success).toBe(true);
        expect(result.shape).toBeDefined();
        expect(result.shape?.type).toBe("rectangle");
      });

      it("should handle shape creation errors", async () => {
        const result = await application.shapeManagement.createShape({
          type: "invalid" as any,
          bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it("should create components from shapes", async () => {
        // First create some shapes
        await application.shapeManagement.createShape({
          type: "rectangle",
          bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
        });
        await application.shapeManagement.createShape({
          type: "ellipse",
          bounds: { x1: 50, y1: 50, x2: 150, y2: 150, width: 100, height: 100 },
        });

        const shapes = await application.shapeManagement.getAllShapes();
        const shapeIds = shapes.map((s) => s.id);

        const result = await application.shapeManagement.createComponent({
          shapeIds,
          name: "Test Component",
        });

        expect(result.success).toBe(true);
        expect(result.shape?.type).toBe("component");
      });
    });
  }

  /**
   * Test infrastructure layer
   */
  async testInfrastructureLayer(): Promise<void> {
    const { infrastructure } = this.container;

    describe("Infrastructure Layer", () => {
      it("should persist and retrieve shapes", async () => {
        const testShape = testUtils.createTestShapes(1)[0];

        await infrastructure.shapeRepository.save(testShape);
        const retrieved = await infrastructure.shapeRepository.findById(
          testShape.id
        );

        expect(retrieved).toEqual(testShape);
      });

      it("should handle repository errors gracefully", async () => {
        const result = await infrastructure.shapeRepository.findById(
          "non-existent-id"
        );
        expect(result).toBeNull();
      });

      it("should emit and handle events", async () => {
        let eventReceived = false;
        const eventData = { type: "test", payload: { message: "Hello" } };

        infrastructure.eventBus.subscribe("test", () => {
          eventReceived = true;
        });

        await infrastructure.eventBus.publish("test", eventData);

        // Wait a bit for async event processing
        await testUtils.sleep(10);

        expect(eventReceived).toBe(true);
      });
    });
  }

  /**
   * Test dependency injection
   */
  async testDependencyInjection(): Promise<void> {
    describe("Dependency Injection Container", () => {
      it("should create container with all dependencies", () => {
        expect(this.container.domain).toBeDefined();
        expect(this.container.application).toBeDefined();
        expect(this.container.infrastructure).toBeDefined();
        expect(this.container.presentation).toBeDefined();
      });

      it("should provide singleton instances", () => {
        const container1 = DIContainer.getInstance();
        const container2 = DIContainer.getInstance();

        expect(container1).toBe(container2);
      });

      it("should create isolated test instances", () => {
        const testContainer1 = DIContainer.createTestInstance();
        const testContainer2 = DIContainer.createTestInstance();

        expect(testContainer1).not.toBe(testContainer2);
      });

      it("should configure services correctly", () => {
        const config = this.container.getConfiguration();

        expect(config.repository.type).toBe("memory");
        expect(config.eventBus.type).toBe("memory");
        expect(config.idGenerator.type).toBe("uuid");
      });
    });
  }

  /**
   * Test cross-layer integration
   */
  async testIntegration(): Promise<void> {
    describe("Cross-Layer Integration", () => {
      it("should handle complete shape lifecycle", async () => {
        // Create shape through application layer
        const createResult =
          await this.container.application.shapeManagement.createShape({
            type: "rectangle",
            bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
          });

        expect(createResult.success).toBe(true);
        const shapeId = createResult.shape!.id;

        // Retrieve through infrastructure
        const retrieved =
          await this.container.infrastructure.shapeRepository.findById(shapeId);
        expect(retrieved).toBeDefined();

        // Update through application layer
        const updateResult =
          await this.container.application.shapeManagement.updateShape({
            id: shapeId,
            updates: {
              bounds: {
                x1: 10,
                y1: 10,
                x2: 110,
                y2: 110,
                width: 100,
                height: 100,
              },
            },
          });

        expect(updateResult.success).toBe(true);

        // Verify update persisted
        const updated =
          await this.container.infrastructure.shapeRepository.findById(shapeId);
        expect(updated?.bounds.x1).toBe(10);
      });

      it("should handle errors across layers", async () => {
        // Try to update non-existent shape
        const result =
          await this.container.application.shapeManagement.updateShape({
            id: "non-existent",
            updates: {
              bounds: {
                x1: 0,
                y1: 0,
                x2: 100,
                y2: 100,
                width: 100,
                height: 100,
              },
            },
          });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  }

  /**
   * Run all architecture tests
   */
  async runAll(): Promise<void> {
    console.log("Running Architecture Test Suite...");

    await this.testDomainLayer();
    await this.testApplicationLayer();
    await this.testInfrastructureLayer();
    await this.testDependencyInjection();
    await this.testIntegration();

    console.log("Architecture Test Suite completed!");
  }

  /**
   * Clean up test resources
   */
  cleanup(): void {
    this.container = DIContainer.createTestInstance();
  }
}

/**
 * Factory function to create architecture test suite
 */
export function createArchitectureTestSuite(
  container?: DIContainer
): ArchitectureTestSuite {
  return new ArchitectureTestSuite(container);
}
