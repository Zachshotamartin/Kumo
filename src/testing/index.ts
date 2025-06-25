/**
 * Testing Infrastructure Entry Point
 *
 * Comprehensive testing utilities for the Kumo application.
 * Provides everything needed for unit, integration, component,
 * performance, and E2E testing.
 */

// Core utilities
export { testUtils, TestUtils } from "./utils/TestUtils";
export { MockTracker } from "./utils/MockTracker";
export { FixtureManager } from "./utils/FixtureManager";
export {
  PerformanceTester,
  PerformanceTestSuite,
} from "./utils/PerformanceTester";
export { DataGenerator } from "./utils/DataGenerator";

// Architecture-specific test utilities
export { createArchitectureTestSuite } from "./suites/ArchitectureTestSuite";
export { createComponentTestSuite } from "./suites/ComponentTestSuite";
export { createIntegrationTestSuite } from "./suites/IntegrationTestSuite";

// Custom matchers and assertions
export { setupCustomMatchers } from "./matchers/CustomMatchers";

// Test configuration
export { TestConfig } from "./config/TestConfig";

// All types
export * from "./types";

// Common test patterns and helpers
export * from "./patterns";
