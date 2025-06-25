/**
 * Testing Infrastructure Types
 *
 * Comprehensive type system for testing utilities, mocks, and infrastructure.
 * Supports unit, integration, component, performance, and E2E testing.
 */

// ===================
// CORE TESTING TYPES
// ===================

export type TestEnvironment =
  | "unit"
  | "integration"
  | "component"
  | "performance"
  | "e2e";

export type TestLevel = "smoke" | "sanity" | "regression" | "acceptance";

export interface TestConfig {
  environment: TestEnvironment;
  level: TestLevel;
  timeout: number;
  retries: number;
  parallel: boolean;
  coverage: boolean;
  verbose: boolean;
}

export interface TestContext {
  testId: string;
  testName: string;
  startTime: number;
  environment: TestEnvironment;
  metadata: Record<string, any>;
}

export interface TestResult {
  testId: string;
  passed: boolean;
  duration: number;
  error?: Error;
  warnings: string[];
  metrics?: TestMetrics;
  artifacts?: TestArtifact[];
}

export interface TestMetrics {
  memoryUsage: number;
  renderTime: number;
  executionTime: number;
  apiCalls: number;
  assertions: number;
}

export interface TestArtifact {
  type: "screenshot" | "video" | "log" | "trace" | "coverage";
  path: string;
  size: number;
  metadata: Record<string, any>;
}

// ===================
// MOCK SYSTEM TYPES
// ===================

export interface MockDefinition<T = any> {
  name: string;
  type: MockType;
  defaultValue: T;
  behaviors: MockBehavior[];
  config: MockConfig;
}

export type MockType = "spy" | "stub" | "fake" | "mock";

export interface MockBehavior {
  method: string;
  arguments?: any[];
  returns?: any;
  throws?: Error;
  calls?: (...args: any[]) => any;
  delay?: number;
}

export interface MockConfig {
  callThrough: boolean;
  autoReset: boolean;
  trackCalls: boolean;
  maxCalls?: number;
}

export interface MockTracker {
  mocks: Map<string, MockDefinition>;
  calls: Map<string, MockCall[]>;
  reset(): void;
  restore(): void;
  getCallHistory(mockName: string): MockCall[];
}

export interface MockCall {
  timestamp: number;
  arguments: any[];
  returnValue?: any;
  threwError?: Error;
  duration: number;
}

// ===================
// TEST FIXTURES TYPES
// ===================

export interface TestFixture<T = any> {
  name: string;
  description: string;
  data: T;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  dependencies: string[];
}

export interface FixtureManager {
  register<T>(fixture: TestFixture<T>): void;
  get<T>(name: string): TestFixture<T> | undefined;
  setup(fixtureName: string): Promise<void>;
  teardown(fixtureName: string): Promise<void>;
  clear(): void;
}

// ===================
// COMPONENT TESTING TYPES
// ===================

export interface ComponentTestOptions {
  props?: Record<string, any>;
  context?: Record<string, any>;
  providers?: React.ComponentType[];
  wrappers?: React.ComponentType[];
  mocks?: string[];
  timeout?: number;
}

export interface ComponentTestResult {
  component: any;
  container: HTMLElement;
  rerender: (props?: Record<string, any>) => void;
  unmount: () => void;
  debug: () => void;
}

export interface HookTestOptions<T = any> {
  initialProps?: T;
  wrapper?: React.ComponentType;
  timeout?: number;
}

export interface HookTestResult<T = any> {
  result: { current: T };
  rerender: (newProps?: any) => void;
  unmount: () => void;
  waitFor: (
    callback: () => boolean,
    options?: { timeout?: number }
  ) => Promise<void>;
}

// ===================
// PERFORMANCE TESTING TYPES
// ===================

export interface PerformanceTestConfig {
  iterations: number;
  warmupIterations: number;
  timeout: number;
  memoryThreshold: number;
  fpsThreshold: number;
  renderThreshold: number;
}

export interface PerformanceTestResult {
  testName: string;
  passed: boolean;
  metrics: PerformanceMetrics;
  iterations: IterationResult[];
  summary: PerformanceSummary;
  recommendations: string[];
}

export interface PerformanceMetrics {
  averageMemory: number;
  peakMemory: number;
  averageFPS: number;
  minFPS: number;
  averageRenderTime: number;
  maxRenderTime: number;
  gcPauses: number;
  totalDuration: number;
}

export interface IterationResult {
  iteration: number;
  duration: number;
  memoryUsed: number;
  fps: number;
  renderTime: number;
  passed: boolean;
}

export interface PerformanceSummary {
  totalPassed: number;
  totalFailed: number;
  passRate: number;
  bottlenecks: string[];
  improvements: string[];
}

// ===================
// INTEGRATION TESTING TYPES
// ===================

export interface IntegrationTestConfig {
  services: string[];
  databases: string[];
  externalAPIs: string[];
  timeout: number;
  retries: number;
  cleanup: boolean;
}

export interface IntegrationTestEnvironment {
  services: Map<string, ServiceMock>;
  databases: Map<string, DatabaseMock>;
  apis: Map<string, APIMock>;
  setup(): Promise<void>;
  teardown(): Promise<void>;
}

export interface ServiceMock {
  name: string;
  url: string;
  status: "running" | "stopped" | "error";
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
}

export interface DatabaseMock {
  name: string;
  type: "memory" | "file" | "container";
  status: "connected" | "disconnected" | "error";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  seed(data: any[]): Promise<void>;
  clear(): Promise<void>;
}

export interface APIMock {
  name: string;
  baseUrl: string;
  endpoints: Map<string, EndpointMock>;
  intercept(pattern: string, response: any): void;
  restore(): void;
}

export interface EndpointMock {
  method: string;
  path: string;
  response: any;
  status: number;
  delay?: number;
  callCount: number;
}

// ===================
// E2E TESTING TYPES
// ===================

export interface E2ETestConfig {
  browser: "chromium" | "firefox" | "webkit";
  headless: boolean;
  viewport: { width: number; height: number };
  timeout: number;
  retries: number;
  screenshots: boolean;
  videos: boolean;
  traces: boolean;
}

export interface E2ETestPage {
  url: string;
  selectors: Record<string, string>;
  actions: Record<string, (...args: any[]) => Promise<void>>;
  assertions: Record<string, (...args: any[]) => Promise<boolean>>;
}

export interface E2ETestScenario {
  name: string;
  description: string;
  pages: string[];
  steps: E2ETestStep[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface E2ETestStep {
  action: string;
  target?: string;
  value?: any;
  timeout?: number;
  screenshot?: boolean;
  description: string;
}

// ===================
// TEST UTILITIES TYPES
// ===================

export interface TestUtils {
  // Mock utilities
  createMock<T>(definition: Partial<MockDefinition<T>>): T;
  resetMocks(): void;
  restoreMocks(): void;

  // Fixture utilities
  loadFixture<T>(name: string): Promise<T>;
  createFixture<T>(name: string, data: T): TestFixture<T>;

  // Async utilities
  waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout?: number
  ): Promise<void>;
  sleep(ms: number): Promise<void>;
  retry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T>;

  // Component utilities
  renderComponent(
    component: React.ComponentType,
    options?: ComponentTestOptions
  ): ComponentTestResult;
  renderHook<T>(hook: () => T, options?: HookTestOptions): HookTestResult<T>;

  // Performance utilities
  measurePerformance(
    fn: () => Promise<void>,
    config?: PerformanceTestConfig
  ): Promise<PerformanceTestResult>;
  profileMemory(fn: () => Promise<void>): Promise<MemoryProfile>;

  // Data utilities
  generateTestData<T>(schema: TestDataSchema<T>): T;
  createTestUser(overrides?: Partial<TestUser>): TestUser;
  createTestWorkspace(overrides?: Partial<TestWorkspace>): TestWorkspace;
}

export interface TestDataSchema<T> {
  fields: Record<keyof T, FieldSchema>;
  constraints?: Constraint[];
}

export interface FieldSchema {
  type: "string" | "number" | "boolean" | "date" | "array" | "object";
  required: boolean;
  default?: any;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
}

export interface Constraint {
  field: string;
  rule: string;
  value: any;
}

export interface MemoryProfile {
  baseline: number;
  peak: number;
  final: number;
  leaks: MemoryLeak[];
  gcEvents: number;
}

export interface MemoryLeak {
  size: number;
  type: string;
  location: string;
  retained: boolean;
}

// ===================
// TEST DATA TYPES
// ===================

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  preferences: Record<string, any>;
  createdAt: Date;
}

export interface TestWorkspace {
  id: string;
  name: string;
  description: string;
  owner: string;
  members: string[];
  shapes: TestShape[];
  settings: Record<string, any>;
  createdAt: Date;
}

export interface TestShape {
  id: string;
  type: string;
  bounds: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    height: number;
  };
  properties: Record<string, any>;
  zIndex: number;
}

// ===================
// COVERAGE TYPES
// ===================

export interface CoverageReport {
  summary: CoverageSummary;
  files: Map<string, FileCoverage>;
  threshold: CoverageThreshold;
  passed: boolean;
}

export interface CoverageSummary {
  lines: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
  statements: CoverageMetric;
}

export interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

export interface FileCoverage {
  path: string;
  lines: number[];
  functions: FunctionCoverage[];
  branches: BranchCoverage[];
  statements: number[];
}

export interface FunctionCoverage {
  name: string;
  line: number;
  called: boolean;
  callCount: number;
}

export interface BranchCoverage {
  line: number;
  taken: boolean[];
  percentage: number;
}

export interface CoverageThreshold {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}
