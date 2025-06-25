/**
 * Comprehensive Testing Utilities
 *
 * Central testing utilities that provide everything needed for testing
 * the Kumo application across all architectural layers.
 */

import {
  ITestUtils,
  TestFixture,
  MockDefinition,
  ComponentTestOptions,
  ComponentTestResult,
  HookTestOptions,
  HookTestResult,
  PerformanceTestConfig,
  PerformanceTestResult,
  MemoryProfile,
  TestDataSchema,
  TestUser,
  TestWorkspace,
  TestShape,
} from "../types";
import { MockTracker } from "./MockTracker";
import { FixtureManager } from "./FixtureManager";
import { PerformanceTester } from "./PerformanceTester";
import { DataGenerator } from "./DataGenerator";
import { render, RenderOptions } from "@testing-library/react";
import { renderHook, RenderHookOptions } from "@testing-library/react";
import React, { ReactElement, ComponentType, ReactNode } from "react";
import { KumoShape, Board, BoardInfo } from "../../types";

export class TestUtils implements ITestUtils {
  private static instance: TestUtils | null = null;

  private mockTracker: MockTracker;
  private fixtureManager: FixtureManager;
  private performanceTester: PerformanceTester;
  private dataGenerator: DataGenerator;

  constructor() {
    this.mockTracker = new MockTracker();
    this.fixtureManager = new FixtureManager();
    this.performanceTester = new PerformanceTester();
    this.dataGenerator = new DataGenerator();
  }

  /**
   * Get singleton instance of TestUtils
   */
  static getInstance(): TestUtils {
    if (!TestUtils.instance) {
      TestUtils.instance = new TestUtils();
    }
    return TestUtils.instance;
  }

  /**
   * Reset all testing utilities (useful for test cleanup)
   */
  static reset(): void {
    if (TestUtils.instance) {
      TestUtils.instance.resetMocks();
      TestUtils.instance.fixtureManager.clear();
    }
  }

  // ===================
  // MOCK UTILITIES
  // ===================

  createMock<T>(definition: Partial<MockDefinition<T>>): T {
    return this.mockTracker.createMock(definition);
  }

  resetMocks(): void {
    this.mockTracker.reset();
  }

  restoreMocks(): void {
    this.mockTracker.restore();
  }

  /**
   * Create a spy mock that tracks calls but doesn't change behavior
   */
  createSpy<T extends object>(target: T, method: keyof T): jest.SpyInstance {
    return jest.spyOn(target, method as any);
  }

  /**
   * Create a stub that replaces method behavior
   */
  createStub<T>(mockValue: T): jest.Mock<T> {
    return jest.fn().mockReturnValue(mockValue);
  }

  /**
   * Create an async stub
   */
  createAsyncStub<T>(mockValue: T, delay: number = 0): jest.Mock<Promise<T>> {
    return jest.fn().mockImplementation(async () => {
      if (delay > 0) {
        await this.sleep(delay);
      }
      return mockValue;
    });
  }

  // ===================
  // FIXTURE UTILITIES
  // ===================

  async loadFixture<T>(name: string): Promise<T> {
    return this.fixtureManager.load<T>(name);
  }

  createFixture<T>(name: string, data: T): TestFixture<T> {
    return this.fixtureManager.create(name, data);
  }

  /**
   * Load multiple fixtures at once
   */
  async loadFixtures<T extends Record<string, any>>(
    names: (keyof T)[]
  ): Promise<T> {
    const fixtures = {} as T;
    for (const name of names) {
      fixtures[name] = await this.loadFixture(name as string);
    }
    return fixtures;
  }

  // ===================
  // ASYNC UTILITIES
  // ===================

  async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await this.sleep(50); // Check every 50ms
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async retry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maxRetries) {
          throw lastError;
        }
        await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
      }
    }

    throw lastError!;
  }

  /**
   * Create a timeout promise for racing with other promises
   */
  createTimeout(ms: number, message?: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(message || `Timeout after ${ms}ms`));
      }, ms);
    });
  }

  // ===================
  // COMPONENT UTILITIES
  // ===================

  renderComponent(
    component: ComponentType<any> | (() => ReactElement),
    options: ComponentTestOptions = {}
  ): ComponentTestResult {
    const {
      props = {},
      providers = [],
      wrappers = [],
      ...renderOptions
    } = options;

    // Create wrapper with providers
    let Wrapper: ComponentType<{ children: ReactNode }> | undefined;

    if (providers.length > 0 || wrappers.length > 0) {
      Wrapper = ({ children }: { children: ReactNode }) => {
        let element = React.createElement(React.Fragment, {}, children);

        // Wrap with providers (innermost first)
        [...providers, ...wrappers].reverse().forEach((Provider) => {
          element = React.createElement(Provider, {}, element);
        });

        return element;
      };
    }

    const componentElement =
      typeof component === "function" && component.length === 0
        ? (component as () => ReactElement)()
        : React.createElement(component as ComponentType<any>, props);

    const renderResult = render(componentElement, {
      wrapper: Wrapper,
      ...renderOptions,
    } as RenderOptions);

    return {
      component: renderResult,
      container: renderResult.container,
      rerender: (newProps = {}) => {
        const newElement =
          typeof component === "function" && component.length === 0
            ? (component as () => ReactElement)()
            : React.createElement(component as ComponentType<any>, {
                ...props,
                ...newProps,
              });
        renderResult.rerender(newElement);
      },
      unmount: renderResult.unmount,
      debug: renderResult.debug,
    };
  }

  renderHook<T>(
    hook: () => T,
    options: HookTestOptions = {}
  ): HookTestResult<T> {
    const { wrapper, ...renderOptions } = options;

    const result = renderHook(hook, {
      wrapper,
      ...renderOptions,
    } as RenderHookOptions<any>);

    return {
      result: result.result,
      rerender: result.rerender,
      unmount: result.unmount,
      waitFor: async (callback, waitOptions = {}) => {
        await this.waitFor(callback, waitOptions.timeout);
      },
    };
  }

  /**
   * Test React component with error boundary
   */
  renderWithErrorBoundary(
    component: ComponentType<any>,
    options: ComponentTestOptions = {}
  ): ComponentTestResult & { hasError: boolean; error?: Error } {
    let hasError = false;
    let capturedError: Error | undefined;

    const ErrorBoundary: ComponentType<{ children: ReactNode }> = ({
      children,
    }) => {
      const [error, setError] = React.useState<Error | null>(null);

      React.useEffect(() => {
        const errorHandler = (event: ErrorEvent) => {
          hasError = true;
          capturedError = new Error(event.message);
          setError(capturedError);
        };

        window.addEventListener("error", errorHandler);
        return () => window.removeEventListener("error", errorHandler);
      }, []);

      if (error) {
        return React.createElement(
          "div",
          { "data-testid": "error-boundary" },
          `Error: ${error.message}`
        );
      }

      return React.createElement(React.Fragment, {}, children);
    };

    const result = this.renderComponent(component, {
      ...options,
      wrappers: [ErrorBoundary, ...(options.wrappers || [])],
    });

    return {
      ...result,
      hasError,
      error: capturedError,
    };
  }

  // ===================
  // PERFORMANCE UTILITIES
  // ===================

  async measurePerformance(
    fn: () => Promise<void>,
    config: PerformanceTestConfig = {
      iterations: 10,
      warmupIterations: 2,
      timeout: 30000,
      memoryThreshold: 50 * 1024 * 1024, // 50MB
      fpsThreshold: 30,
      renderThreshold: 16.67, // 60fps = 16.67ms per frame
    }
  ): Promise<PerformanceTestResult> {
    return this.performanceTester.measurePerformance(fn, config);
  }

  async profileMemory(fn: () => Promise<void>): Promise<MemoryProfile> {
    return this.performanceTester.profileMemory(fn);
  }

  /**
   * Measure render performance of a component
   */
  async measureRenderPerformance(
    component: ComponentType<any>,
    props: any = {},
    iterations: number = 10
  ): Promise<{
    averageRenderTime: number;
    maxRenderTime: number;
    minRenderTime: number;
  }> {
    const renderTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      const result = this.renderComponent(component, { props });

      const endTime = performance.now();
      renderTimes.push(endTime - startTime);

      result.unmount();

      // Allow garbage collection between iterations
      if (i < iterations - 1) {
        await this.sleep(10);
      }
    }

    return {
      averageRenderTime:
        renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
      maxRenderTime: Math.max(...renderTimes),
      minRenderTime: Math.min(...renderTimes),
    };
  }

  // ===================
  // DATA UTILITIES
  // ===================

  generateTestData<T>(schema: TestDataSchema<T>): T {
    return this.dataGenerator.generate(schema);
  }

  createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    return this.dataGenerator.createUser(overrides);
  }

  createTestWorkspace(overrides: Partial<TestWorkspace> = {}): TestWorkspace {
    return this.dataGenerator.createWorkspace(overrides);
  }

  /**
   * Create multiple test users
   */
  createTestUsers(
    count: number,
    baseOverrides: Partial<TestUser> = {}
  ): TestUser[] {
    return Array.from({ length: count }, (_, index) =>
      this.createTestUser({
        ...baseOverrides,
        name: `${baseOverrides.name || "Test User"} ${index + 1}`,
        email: `user${index + 1}@test.com`,
      })
    );
  }

  /**
   * Create test shapes with different types
   */
  createTestShapes(count: number): TestShape[] {
    const types = ["rectangle", "ellipse", "text", "line"];

    return Array.from({ length: count }, (_, index) => ({
      id: `shape-${index + 1}`,
      type: types[index % types.length],
      bounds: {
        x1: Math.random() * 800,
        y1: Math.random() * 600,
        x2: Math.random() * 800 + 100,
        y2: Math.random() * 600 + 100,
        width: 100,
        height: 100,
      },
      properties: {
        fill: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        stroke: "#000000",
        strokeWidth: 1,
      },
      zIndex: index,
    }));
  }

  createTestBoard(): Board {
    const boardInfo: BoardInfo = {
      id: `board-${Date.now()}`,
      title: "Test Board",
      uid: "test-user",
      description: "Test board for unit tests",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: false,
      collaborators: [],
      settings: {
        gridSize: 20,
        gridVisible: true,
        gridSnapping: true,
        background: "#ffffff",
        width: 1920,
        height: 1080,
        zoom: 1,
        maxZoom: 5,
        minZoom: 0.1,
      },
    };

    return {
      info: boardInfo,
      shapes: this.createTestShapes(5) as KumoShape[],
      version: 1,
    };
  }

  // ===================
  // ASSERTION UTILITIES
  // ===================

  /**
   * Assert that a value is defined (not null or undefined)
   */
  assertDefined<T>(value: T | null | undefined): asserts value is T {
    if (value === null || value === undefined) {
      throw new Error("Expected value to be defined");
    }
  }

  /**
   * Assert that an error is thrown
   */
  async assertThrows(
    fn: () => Promise<any> | any,
    expectedError?: string | RegExp
  ): Promise<Error> {
    try {
      await fn();
      throw new Error("Expected function to throw an error");
    } catch (error) {
      const actualError =
        error instanceof Error ? error : new Error(String(error));

      if (expectedError) {
        const errorMessage = actualError.message;
        const matches =
          typeof expectedError === "string"
            ? errorMessage.includes(expectedError)
            : expectedError.test(errorMessage);

        if (!matches) {
          throw new Error(
            `Expected error message to match "${expectedError}", got "${errorMessage}"`
          );
        }
      }

      return actualError;
    }
  }

  /**
   * Assert that a promise resolves within a timeout
   */
  async assertResolvesWithin<T>(
    promise: Promise<T>,
    timeout: number,
    message?: string
  ): Promise<T> {
    return Promise.race([
      promise,
      this.createTimeout(
        timeout,
        message || `Promise did not resolve within ${timeout}ms`
      ),
    ]);
  }

  // ===================
  // CLEANUP UTILITIES
  // ===================

  /**
   * Clean up all testing resources
   */
  cleanup(): void {
    this.resetMocks();
    this.restoreMocks();
    this.fixtureManager.clear();
  }

  /**
   * Create a cleanup function for use in afterEach hooks
   */
  createCleanupHook(): () => void {
    return () => this.cleanup();
  }
}

// Export singleton instance for convenience
export const testUtils = TestUtils.getInstance();
