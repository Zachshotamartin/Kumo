/**
 * Test Configuration Management
 *
 * Centralized configuration for all testing scenarios.
 * Provides environment-specific settings and test customization.
 */

export interface TestEnvironmentConfig {
  // Test execution settings
  timeout: number;
  retries: number;
  parallel: boolean;
  verbose: boolean;

  // Mock settings
  mockExternalServices: boolean;
  mockDelay: number;

  // Performance settings
  performanceThresholds: {
    memory: number;
    renderTime: number;
    fps: number;
  };

  // Database settings
  database: {
    type: "memory" | "file" | "mock";
    resetBetweenTests: boolean;
    seedData: boolean;
  };

  // Coverage settings
  coverage: {
    enabled: boolean;
    threshold: {
      lines: number;
      functions: number;
      branches: number;
      statements: number;
    };
    exclude: string[];
  };
}

export class TestConfig {
  private static instance: TestConfig | null = null;
  private config: TestEnvironmentConfig;

  private constructor() {
    this.config = this.createDefaultConfig();
    this.loadEnvironmentOverrides();
  }

  static getInstance(): TestConfig {
    if (!TestConfig.instance) {
      TestConfig.instance = new TestConfig();
    }
    return TestConfig.instance;
  }

  /**
   * Get configuration for specific test environment
   */
  getConfig(
    environment: "unit" | "integration" | "e2e" = "unit"
  ): TestEnvironmentConfig {
    const baseConfig = { ...this.config };

    // Environment-specific overrides
    switch (environment) {
      case "integration":
        return {
          ...baseConfig,
          timeout: baseConfig.timeout * 2,
          mockExternalServices: false,
          database: {
            ...baseConfig.database,
            type: "file",
            resetBetweenTests: true,
          },
        };

      case "e2e":
        return {
          ...baseConfig,
          timeout: baseConfig.timeout * 5,
          parallel: false,
          mockExternalServices: false,
          database: {
            ...baseConfig.database,
            type: "file",
            resetBetweenTests: true,
            seedData: true,
          },
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TestEnvironmentConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = this.createDefaultConfig();
    this.loadEnvironmentOverrides();
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): TestEnvironmentConfig {
    return {
      timeout: 5000,
      retries: 2,
      parallel: true,
      verbose: false,

      mockExternalServices: true,
      mockDelay: 0,

      performanceThresholds: {
        memory: 50 * 1024 * 1024, // 50MB
        renderTime: 16.67, // 60fps
        fps: 30,
      },

      database: {
        type: "memory",
        resetBetweenTests: true,
        seedData: false,
      },

      coverage: {
        enabled: true,
        threshold: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
        exclude: [
          "**/*.test.ts",
          "**/*.spec.ts",
          "**/node_modules/**",
          "**/coverage/**",
        ],
      },
    };
  }

  /**
   * Load environment-specific overrides
   */
  private loadEnvironmentOverrides(): void {
    const env = process.env.NODE_ENV || "development";

    // CI environment optimizations
    if (process.env.CI) {
      this.config.timeout *= 2;
      this.config.retries = 3;
      this.config.verbose = true;
    }

    // Development environment settings
    if (env === "development") {
      this.config.verbose = true;
      this.config.coverage.enabled = false;
    }

    // Test environment settings
    if (env === "test") {
      this.config.parallel = false; // For deterministic testing
      this.config.mockExternalServices = true;
    }

    // Load from environment variables
    this.loadFromEnvironmentVariables();
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironmentVariables(): void {
    // Timeout
    if (process.env.TEST_TIMEOUT) {
      this.config.timeout = parseInt(process.env.TEST_TIMEOUT, 10);
    }

    // Retries
    if (process.env.TEST_RETRIES) {
      this.config.retries = parseInt(process.env.TEST_RETRIES, 10);
    }

    // Parallel execution
    if (process.env.TEST_PARALLEL) {
      this.config.parallel = process.env.TEST_PARALLEL === "true";
    }

    // Verbose output
    if (process.env.TEST_VERBOSE) {
      this.config.verbose = process.env.TEST_VERBOSE === "true";
    }

    // Mock external services
    if (process.env.TEST_MOCK_EXTERNAL) {
      this.config.mockExternalServices =
        process.env.TEST_MOCK_EXTERNAL === "true";
    }

    // Coverage threshold
    if (process.env.TEST_COVERAGE_THRESHOLD) {
      const threshold = parseInt(process.env.TEST_COVERAGE_THRESHOLD, 10);
      this.config.coverage.threshold = {
        lines: threshold,
        functions: threshold,
        branches: threshold - 5,
        statements: threshold,
      };
    }
  }

  /**
   * Get Jest configuration
   */
  getJestConfig(): any {
    const config = this.getConfig();

    return {
      testTimeout: config.timeout,
      verbose: config.verbose,
      maxWorkers: config.parallel ? "50%" : 1,

      // Coverage settings
      collectCoverage: config.coverage.enabled,
      coverageThreshold: {
        global: config.coverage.threshold,
      },
      coveragePathIgnorePatterns: config.coverage.exclude,

      // Setup files
      setupFilesAfterEnv: ["<rootDir>/src/testing/setup/jest.setup.ts"],

      // Test environment
      testEnvironment: "jsdom",

      // Module mapping
      moduleNameMapping: {
        "^@/(.*)$": "<rootDir>/src/$1",
        "^@testing/(.*)$": "<rootDir>/src/testing/$1",
      },

      // Transform files
      transform: {
        "^.+\\.(ts|tsx)$": "ts-jest",
      },

      // Test patterns
      testMatch: [
        "<rootDir>/src/**/__tests__/**/*.(ts|tsx)",
        "<rootDir>/src/**/*.(test|spec).(ts|tsx)",
      ],

      // Module file extensions
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
    };
  }

  /**
   * Get Playwright configuration for E2E tests
   */
  getPlaywrightConfig(): any {
    const config = this.getConfig("e2e");

    return {
      timeout: config.timeout,
      retries: config.retries,
      workers: config.parallel ? 2 : 1,

      use: {
        headless: !config.verbose,
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        trace: "on-first-retry",
      },

      projects: [
        {
          name: "chromium",
          use: { ...require("@playwright/test").devices["Desktop Chrome"] },
        },
        {
          name: "firefox",
          use: { ...require("@playwright/test").devices["Desktop Firefox"] },
        },
        {
          name: "webkit",
          use: { ...require("@playwright/test").devices["Desktop Safari"] },
        },
      ],

      webServer: {
        command: "npm start",
        port: 3000,
        reuseExistingServer: !process.env.CI,
      },
    };
  }

  /**
   * Create test-specific configuration
   */
  createTestConfig(
    overrides: Partial<TestEnvironmentConfig> = {}
  ): TestEnvironmentConfig {
    return {
      ...this.config,
      ...overrides,
    };
  }
}
