# 🧪 Testing Architecture

Comprehensive testing infrastructure for the Kumo whiteboard application. This system provides a complete suite of testing utilities designed to work seamlessly with our Clean Architecture implementation.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Testing Types](#testing-types)
- [Core Utilities](#core-utilities)
- [Architecture Testing](#architecture-testing)
- [Performance Testing](#performance-testing)
- [Test Configuration](#test-configuration)
- [Best Practices](#best-practices)
- [Examples](#examples)

## 🎯 Overview

Our testing architecture provides:

- **🏗️ Multi-Layer Testing**: Unit, integration, component, performance, and E2E tests
- **🔧 Rich Utilities**: Mocks, fixtures, data generation, and assertion helpers
- **⚡ Performance Testing**: Memory profiling, FPS measurement, and benchmarking
- **🎨 Component Testing**: React component testing with providers and error boundaries
- **🏛️ Architecture Testing**: Specialized testing for Clean Architecture layers
- **📊 Comprehensive Reporting**: Coverage, performance metrics, and detailed reports

## 🚀 Quick Start

### Basic Setup

```typescript
import { testUtils } from "@testing";

describe("My Feature", () => {
  beforeEach(() => {
    testUtils.resetMocks();
  });

  afterEach(() => {
    testUtils.cleanup();
  });

  it("should work correctly", async () => {
    const user = testUtils.createTestUser();
    const workspace = testUtils.createTestWorkspace({ owner: user.id });

    expect(workspace.owner).toBe(user.id);
  });
});
```

### Component Testing

```typescript
import { testUtils } from "@testing";
import { MyComponent } from "./MyComponent";

describe("MyComponent", () => {
  it("should render correctly", () => {
    const { component, container } = testUtils.renderComponent(MyComponent, {
      props: { title: "Test Title" },
      providers: [ConfigProvider, ThemeProvider],
    });

    expect(container.textContent).toContain("Test Title");
  });

  it("should handle errors gracefully", () => {
    const { hasError, error } = testUtils.renderWithErrorBoundary(MyComponent, {
      props: { invalidProp: null },
    });

    expect(hasError).toBe(true);
    expect(error?.message).toContain("Invalid prop");
  });
});
```

### Performance Testing

```typescript
import { testUtils } from "@testing";

describe("Performance Tests", () => {
  it("should render within performance thresholds", async () => {
    const result = await testUtils.measurePerformance(
      async () => {
        // Simulate heavy operation
        await heavyRenderingOperation();
      },
      {
        iterations: 10,
        memoryThreshold: 100 * 1024 * 1024, // 100MB
        fpsThreshold: 30,
        renderThreshold: 16.67, // 60fps
      }
    );

    expect(result.passed).toBe(true);
    expect(result.metrics.averageFPS).toBeGreaterThan(30);
  });
});
```

## 🧪 Testing Types

### Unit Tests

Test individual functions, classes, and components in isolation.

```typescript
// Domain entity testing
describe('Shape Entity', () => {
  it('should move correctly', () => {
    const shape = new Shape({ id: '1', type: 'rectangle', bounds: {...} });
    const moved = shape.move(10, 20);

    expect(moved.bounds.x1).toBe(shape.bounds.x1 + 10);
  });
});
```

### Integration Tests

Test interactions between different layers and components.

```typescript
// Cross-layer integration
describe("Shape Management Integration", () => {
  it("should persist shapes across layers", async () => {
    const container = DIContainer.createTestInstance();

    const result = await container.application.shapeManagement.createShape({
      type: "rectangle",
      bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
    });

    const persisted = await container.infrastructure.shapeRepository.findById(
      result.shape!.id
    );
    expect(persisted).toBeDefined();
  });
});
```

### Component Tests

Test React components with full rendering and interaction.

```typescript
// Component interaction testing
describe("ShapeSelector", () => {
  it("should select shapes on click", async () => {
    const onSelect = jest.fn();
    const { component } = testUtils.renderComponent(ShapeSelector, {
      props: { shapes: testUtils.createTestShapes(3), onSelect },
    });

    const firstShape = component.getByTestId("shape-1");
    fireEvent.click(firstShape);

    expect(onSelect).toHaveBeenCalledWith("shape-1");
  });
});
```

### Performance Tests

Measure and validate performance characteristics.

```typescript
describe("Rendering Performance", () => {
  it("should render 1000 shapes efficiently", async () => {
    const shapes = testUtils.createTestShapes(1000);

    const result = await testUtils.measureRenderPerformance(
      ShapeCanvas,
      { shapes },
      5 // iterations
    );

    expect(result.averageRenderTime).toBeLessThan(100); // 100ms
  });
});
```

## 🛠️ Core Utilities

### TestUtils

Central hub for all testing utilities.

```typescript
import { testUtils } from "@testing";

// Data generation
const user = testUtils.createTestUser({ role: "admin" });
const shapes = testUtils.createTestShapes(10);
const workspace = testUtils.createTestWorkspace();

// Mock management
const mockFn = testUtils.createMock({
  name: "apiCall",
  type: "mock",
  behaviors: [{ method: "get", returns: { data: "test" } }],
});

// Fixtures
await testUtils.loadFixture("user-data");
testUtils.createFixture("test-shapes", shapes);

// Async utilities
await testUtils.waitFor(() => element.isVisible(), 5000);
await testUtils.retry(() => unstableOperation(), 3);

// Component utilities
const { component } = testUtils.renderComponent(MyComponent);
const { result } = testUtils.renderHook(() => useMyHook());

// Performance utilities
const perfResult = await testUtils.measurePerformance(expensiveFunction);
const memoryProfile = await testUtils.profileMemory(memoryIntensiveFunction);

// Assertions
testUtils.assertDefined(value);
await testUtils.assertThrows(() => invalidOperation());
await testUtils.assertResolvesWithin(promise, 1000);
```

### Mock System

Sophisticated mocking with call tracking and behavior definition.

```typescript
// Create different types of mocks
const spy = testUtils.createSpy(target, "method");
const stub = testUtils.createStub("return value");
const asyncStub = testUtils.createAsyncStub("async return", 100); // 100ms delay

// Advanced mock with behaviors
const complexMock = testUtils.createMock({
  name: "apiService",
  type: "mock",
  behaviors: [
    { method: "get", returns: { success: true } },
    { method: "post", throws: new Error("Network error") },
    { method: "put", calls: (data) => ({ ...data, updated: true }) },
  ],
  config: { trackCalls: true, autoReset: false },
});
```

### Fixture System

Manage test data with dependencies and lifecycle hooks.

```typescript
// Create fixtures
testUtils.createFixture("users", [
  { id: "1", name: "John", role: "admin" },
  { id: "2", name: "Jane", role: "editor" },
]);

// Create fixture from file
testUtils.fixtureManager.createFromFile(
  "workspace-data",
  "./fixtures/workspaces.json"
);

// Create fixture with factory
testUtils.fixtureManager.createWithFactory(
  "dynamic-shapes",
  () => testUtils.createTestShapes(Math.random() * 10),
  ["users"] // dependencies
);

// Load fixtures with dependencies
const userData = await testUtils.loadFixture("users");
const shapes = await testUtils.loadFixture("dynamic-shapes");
```

### Data Generation

Generate realistic test data with customizable schemas.

```typescript
// Generate data from schema
const userData = testUtils.generateTestData({
  fields: {
    id: { type: "string", pattern: /[a-z0-9]{8}/ },
    name: { type: "string", min: 2, max: 50 },
    email: { type: "string", pattern: /.+@.+\..+/ },
    age: { type: "number", min: 18, max: 100 },
    active: { type: "boolean" },
    role: { type: "string", enum: ["admin", "editor", "viewer"] },
  },
  constraints: [
    { field: "email", rule: "unique" },
    { field: "name", rule: "format", value: "name" },
  ],
});

// Create specific entities
const admin = testUtils.createTestUser({ role: "admin" });
const workspace = testUtils.createTestWorkspace({ owner: admin.id });
const shapes = testUtils.createTestShapes(5);

// Create realistic datasets
const dataset = testUtils.dataGenerator.createDataset({
  userCount: 20,
  workspaceCount: 5,
  shapesPerWorkspace: 50,
});
```

## 🏛️ Architecture Testing

Test Clean Architecture layers independently and in integration.

```typescript
import { createArchitectureTestSuite } from "@testing";

describe("Architecture Tests", () => {
  const archSuite = createArchitectureTestSuite();

  describe("Domain Layer", () => {
    it("should test entities", async () => {
      await archSuite.testDomainLayer();
    });
  });

  describe("Application Layer", () => {
    it("should test use cases", async () => {
      await archSuite.testApplicationLayer();
    });
  });

  describe("Infrastructure Layer", () => {
    it("should test repositories and services", async () => {
      await archSuite.testInfrastructureLayer();
    });
  });

  describe("Cross-Layer Integration", () => {
    it("should test complete workflows", async () => {
      await archSuite.testIntegration();
    });
  });
});
```

## ⚡ Performance Testing

Comprehensive performance testing with metrics and thresholds.

```typescript
// Create performance test suite
const perfSuite = testUtils.performanceTester.createSuite(
  "Rendering Performance"
);

perfSuite
  .add(
    "render-100-shapes",
    async () => {
      await renderShapes(100);
    },
    { fpsThreshold: 45 }
  )
  .add(
    "render-1000-shapes",
    async () => {
      await renderShapes(1000);
    },
    { fpsThreshold: 30, memoryThreshold: 200 * 1024 * 1024 }
  )
  .add(
    "complex-interactions",
    async () => {
      await simulateComplexUserInteractions();
    },
    { renderThreshold: 20 }
  );

const results = await perfSuite.run();
```

### Memory Profiling

```typescript
// Profile memory usage
const memoryProfile = await testUtils.profileMemory(async () => {
  const shapes = testUtils.createTestShapes(10000);
  await processShapes(shapes);
});

expect(memoryProfile.leaks).toHaveLength(0);
expect(memoryProfile.peak - memoryProfile.baseline).toBeLessThan(
  100 * 1024 * 1024
);
```

## ⚙️ Test Configuration

Centralized configuration for all testing scenarios.

```typescript
import { TestConfig } from "@testing";

const testConfig = TestConfig.getInstance();

// Environment-specific configuration
const unitConfig = testConfig.getConfig("unit");
const integrationConfig = testConfig.getConfig("integration");
const e2eConfig = testConfig.getConfig("e2e");

// Custom configuration
testConfig.updateConfig({
  timeout: 10000,
  performanceThresholds: {
    memory: 200 * 1024 * 1024,
    renderTime: 20,
    fps: 45,
  },
});

// Jest configuration
const jestConfig = testConfig.getJestConfig();

// Playwright configuration
const playwrightConfig = testConfig.getPlaywrightConfig();
```

### Environment Variables

```bash
# Test execution
TEST_TIMEOUT=10000
TEST_RETRIES=3
TEST_PARALLEL=true
TEST_VERBOSE=true

# Mocking
TEST_MOCK_EXTERNAL=true

# Coverage
TEST_COVERAGE_THRESHOLD=85

# Performance
TEST_PERFORMANCE_ENABLED=true
```

## 📋 Best Practices

### 1. Test Organization

```typescript
describe("Feature: Shape Management", () => {
  describe("Unit: Shape Entity", () => {
    // Unit tests for shape entity
  });

  describe("Integration: Shape Use Cases", () => {
    // Integration tests for shape management
  });

  describe("Component: Shape UI", () => {
    // Component tests for shape-related UI
  });

  describe("Performance: Shape Rendering", () => {
    // Performance tests for shape rendering
  });
});
```

### 2. Test Data Management

```typescript
describe("User Management", () => {
  let testData: ReturnType<typeof createTestDataset>;

  beforeAll(async () => {
    testData = await createTestDataset();
  });

  beforeEach(() => {
    // Use fresh copies of test data
    const user = { ...testData.users[0] };
    const workspace = { ...testData.workspaces[0] };
  });
});
```

### 3. Mock Management

```typescript
describe("API Integration", () => {
  beforeEach(() => {
    testUtils.resetMocks();
  });

  afterEach(() => {
    testUtils.restoreMocks();
  });

  it("should handle API responses", () => {
    const apiMock = testUtils.createMock({
      name: "api",
      behaviors: [{ method: "get", returns: { data: "test" } }],
    });

    // Test implementation
  });
});
```

### 4. Error Testing

```typescript
describe("Error Handling", () => {
  it("should handle network errors", async () => {
    const error = await testUtils.assertThrows(
      () => networkOperation(),
      /network error/i
    );

    expect(error.message).toContain("Network");
  });

  it("should handle component errors", () => {
    const { hasError } = testUtils.renderWithErrorBoundary(BuggyComponent);
    expect(hasError).toBe(true);
  });
});
```

### 5. Performance Testing

```typescript
describe("Performance Requirements", () => {
  it("should meet rendering performance", async () => {
    const result = await testUtils.measurePerformance(
      () => heavyRenderingOperation(),
      {
        iterations: 10,
        fpsThreshold: 30,
        memoryThreshold: 100 * 1024 * 1024,
      }
    );

    expect(result.passed).toBe(true);

    if (!result.passed) {
      console.warn("Performance recommendations:", result.recommendations);
    }
  });
});
```

## 📝 Examples

### Complete Feature Test

```typescript
import { testUtils, createArchitectureTestSuite, DIContainer } from "@testing";

describe("Feature: Shape Creation and Manipulation", () => {
  let container: DIContainer;
  let archSuite: ArchitectureTestSuite;

  beforeAll(async () => {
    // Setup test environment
    container = DIContainer.createTestInstance();
    archSuite = createArchitectureTestSuite(container);

    // Load test fixtures
    await testUtils.loadFixture("shape-templates");
  });

  beforeEach(() => {
    testUtils.resetMocks();
  });

  afterEach(() => {
    testUtils.cleanup();
  });

  describe("Unit: Shape Entity", () => {
    it("should create shape with valid properties", () => {
      const shapeData = testUtils.createTestShapes(1)[0];
      const shape = container.domain.shapes.createShape(shapeData);

      expect(shape.isValid()).toBe(true);
      expect(shape.id).toBe(shapeData.id);
    });

    it("should transform shapes correctly", () => {
      const shape = container.domain.shapes.createShape(
        testUtils.createTestShapes(1)[0]
      );

      const moved = shape.move(10, 20);
      const resized = shape.resize(200, 150);
      const rotated = shape.rotate(45);

      expect(moved.bounds.x1).toBe(shape.bounds.x1 + 10);
      expect(resized.bounds.width).toBe(200);
      expect(rotated.transform.rotation).toBe(45);
    });
  });

  describe("Integration: Shape Management Use Case", () => {
    it("should handle complete shape lifecycle", async () => {
      // Create
      const createResult =
        await container.application.shapeManagement.createShape({
          type: "rectangle",
          bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
        });

      expect(createResult.success).toBe(true);
      const shapeId = createResult.shape!.id;

      // Read
      const shape = await container.application.shapeManagement.getShape(
        shapeId
      );
      expect(shape).toBeDefined();

      // Update
      const updateResult =
        await container.application.shapeManagement.updateShape({
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

      // Delete
      const deleteResult =
        await container.application.shapeManagement.deleteShape(shapeId);
      expect(deleteResult.success).toBe(true);

      // Verify deletion
      const deletedShape = await container.application.shapeManagement.getShape(
        shapeId
      );
      expect(deletedShape).toBeNull();
    });
  });

  describe("Component: Shape Canvas", () => {
    it("should render shapes correctly", () => {
      const shapes = testUtils.createTestShapes(5);
      const { component } = testUtils.renderComponent(ShapeCanvas, {
        props: { shapes },
        providers: [ConfigProvider],
      });

      shapes.forEach((shape) => {
        expect(component.getByTestId(`shape-${shape.id}`)).toBeInTheDocument();
      });
    });

    it("should handle shape selection", async () => {
      const shapes = testUtils.createTestShapes(3);
      const onSelect = jest.fn();

      const { component } = testUtils.renderComponent(ShapeCanvas, {
        props: { shapes, onSelect },
      });

      const firstShape = component.getByTestId(`shape-${shapes[0].id}`);
      fireEvent.click(firstShape);

      expect(onSelect).toHaveBeenCalledWith(shapes[0].id);
    });
  });

  describe("Performance: Shape Rendering", () => {
    it("should render many shapes efficiently", async () => {
      const shapes = testUtils.createTestShapes(1000);

      const result = await testUtils.measureRenderPerformance(
        ShapeCanvas,
        { shapes },
        5
      );

      expect(result.averageRenderTime).toBeLessThan(100);
      expect(result.maxRenderTime).toBeLessThan(200);
    });

    it("should handle complex interactions performantly", async () => {
      const perfResult = await testUtils.measurePerformance(
        async () => {
          // Simulate complex user interactions
          await simulateShapeCreation(10);
          await simulateShapeManipulation(20);
          await simulateShapeSelection(5);
        },
        {
          iterations: 5,
          fpsThreshold: 30,
          memoryThreshold: 150 * 1024 * 1024,
        }
      );

      expect(perfResult.passed).toBe(true);
      expect(perfResult.metrics.averageFPS).toBeGreaterThan(30);
    });
  });
});
```

## 🚀 Getting Started

1. **Install Testing Dependencies**

   ```bash
   npm install --save-dev jest @testing-library/react @testing-library/jest-dom
   npm install --save-dev @playwright/test
   ```

2. **Configure Jest**

   ```javascript
   // jest.config.js
   const { TestConfig } = require("./src/testing/config/TestConfig");
   const testConfig = TestConfig.getInstance();

   module.exports = testConfig.getJestConfig();
   ```

3. **Setup Test Environment**

   ```typescript
   // src/testing/setup/jest.setup.ts
   import { setupCustomMatchers } from "@testing";
   import "@testing-library/jest-dom";

   setupCustomMatchers();
   ```

4. **Write Your First Test**

   ```typescript
   import { testUtils } from "@testing";

   describe("My Feature", () => {
     it("should work", () => {
       const result = myFunction();
       expect(result).toBeDefined();
     });
   });
   ```

This testing architecture provides everything you need to ensure the quality and reliability of your Kumo application across all layers and scenarios. Happy testing! 🎉
