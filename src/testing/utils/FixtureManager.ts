import { TestFixture, FixtureManager as IFixtureManager } from "../types";

/**
 * Fixture Manager Implementation
 *
 * Manages test fixtures for consistent test data.
 * Handles loading, caching, and dependency resolution of test fixtures.
 */
export class FixtureManager implements IFixtureManager {
  private fixtures = new Map<string, TestFixture>();
  private loadedData = new Map<string, any>();
  private setupPromises = new Map<string, Promise<void>>();

  /**
   * Register a new fixture
   */
  register<T>(fixture: TestFixture<T>): void {
    if (this.fixtures.has(fixture.name)) {
      console.warn(
        `Fixture '${fixture.name}' is already registered. Overwriting.`
      );
    }

    this.fixtures.set(fixture.name, fixture);
    console.debug(`Registered fixture: ${fixture.name}`);
  }

  /**
   * Get a fixture by name
   */
  get<T>(name: string): TestFixture<T> | undefined {
    return this.fixtures.get(name) as TestFixture<T> | undefined;
  }

  /**
   * Load fixture data with dependency resolution
   */
  async load<T>(name: string): Promise<T> {
    // Return cached data if available
    if (this.loadedData.has(name)) {
      return this.loadedData.get(name) as T;
    }

    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(
        `Fixture '${name}' not found. Available fixtures: ${Array.from(
          this.fixtures.keys()
        ).join(", ")}`
      );
    }

    // Load dependencies first
    await this.loadDependencies(fixture);

    // Set up the fixture
    await this.setup(name);

    // Return the fixture data
    const data = fixture.data as T;
    this.loadedData.set(name, data);

    return data;
  }

  /**
   * Set up a fixture (run setup function)
   */
  async setup(fixtureName: string): Promise<void> {
    // Check if setup is already in progress
    if (this.setupPromises.has(fixtureName)) {
      return this.setupPromises.get(fixtureName)!;
    }

    const fixture = this.fixtures.get(fixtureName);
    if (!fixture) {
      throw new Error(`Fixture '${fixtureName}' not found`);
    }

    // Create setup promise
    const setupPromise = this.executeSetup(fixture);
    this.setupPromises.set(fixtureName, setupPromise);

    try {
      await setupPromise;
    } finally {
      this.setupPromises.delete(fixtureName);
    }
  }

  /**
   * Tear down a fixture (run teardown function)
   */
  async teardown(fixtureName: string): Promise<void> {
    const fixture = this.fixtures.get(fixtureName);
    if (!fixture) {
      throw new Error(`Fixture '${fixtureName}' not found`);
    }

    if (fixture.teardown) {
      try {
        await fixture.teardown();
        console.debug(`Teardown completed for fixture: ${fixtureName}`);
      } catch (error) {
        console.error(`Teardown failed for fixture ${fixtureName}:`, error);
        throw error;
      }
    }

    // Remove from loaded data
    this.loadedData.delete(fixtureName);
  }

  /**
   * Clear all fixtures and loaded data
   */
  clear(): void {
    this.fixtures.clear();
    this.loadedData.clear();
    this.setupPromises.clear();
    console.debug("All fixtures cleared");
  }

  /**
   * Create a fixture with data
   */
  create<T>(name: string, data: T): TestFixture<T> {
    const fixture: TestFixture<T> = {
      name,
      description: `Auto-generated fixture for ${name}`,
      data,
      dependencies: [],
    };

    this.register(fixture);
    return fixture;
  }

  /**
   * Create fixture from JSON file path
   */
  createFromFile<T>(name: string, filePath: string): TestFixture<T> {
    const fixture: TestFixture<T> = {
      name,
      description: `Fixture loaded from ${filePath}`,
      data: {} as T, // Will be loaded when accessed
      dependencies: [],
      setup: async () => {
        try {
          // In a real implementation, this would load from file system
          // For now, we'll simulate loading from a mock file system
          const fileContent = await this.loadFile(filePath);
          fixture.data = JSON.parse(fileContent);
        } catch (error) {
          throw new Error(
            `Failed to load fixture from ${filePath}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      },
    };

    this.register(fixture);
    return fixture;
  }

  /**
   * Create fixture with factory function
   */
  createWithFactory<T>(
    name: string,
    factory: () => T | Promise<T>,
    dependencies: string[] = []
  ): TestFixture<T> {
    const fixture: TestFixture<T> = {
      name,
      description: `Factory-generated fixture for ${name}`,
      data: {} as T, // Will be generated when accessed
      dependencies,
      setup: async () => {
        fixture.data = await factory();
      },
    };

    this.register(fixture);
    return fixture;
  }

  /**
   * Get all fixture names
   */
  getFixtureNames(): string[] {
    return Array.from(this.fixtures.keys());
  }

  /**
   * Check if a fixture exists
   */
  has(name: string): boolean {
    return this.fixtures.has(name);
  }

  /**
   * Get fixture statistics
   */
  getStats(): { total: number; loaded: number; pending: number } {
    return {
      total: this.fixtures.size,
      loaded: this.loadedData.size,
      pending: this.setupPromises.size,
    };
  }

  /**
   * Load dependencies for a fixture
   */
  private async loadDependencies(fixture: TestFixture): Promise<void> {
    if (fixture.dependencies.length === 0) {
      return;
    }

    const dependencyPromises = fixture.dependencies.map(async (depName) => {
      if (!this.loadedData.has(depName)) {
        await this.load(depName);
      }
    });

    await Promise.all(dependencyPromises);
  }

  /**
   * Execute fixture setup
   */
  private async executeSetup(fixture: TestFixture): Promise<void> {
    if (fixture.setup) {
      try {
        await fixture.setup();
        console.debug(`Setup completed for fixture: ${fixture.name}`);
      } catch (error) {
        console.error(`Setup failed for fixture ${fixture.name}:`, error);
        throw error;
      }
    }
  }

  /**
   * Mock file loading (in real implementation, this would use fs)
   */
  private async loadFile(filePath: string): Promise<string> {
    // Simulate file loading delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Mock file content based on file path
    if (filePath.includes("users")) {
      return JSON.stringify([
        { id: "1", name: "Test User 1", email: "user1@test.com" },
        { id: "2", name: "Test User 2", email: "user2@test.com" },
      ]);
    } else if (filePath.includes("shapes")) {
      return JSON.stringify([
        {
          id: "1",
          type: "rectangle",
          bounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
        },
        {
          id: "2",
          type: "ellipse",
          bounds: { x1: 50, y1: 50, x2: 150, y2: 150 },
        },
      ]);
    } else {
      return JSON.stringify({ message: "Mock file content" });
    }
  }

  /**
   * Tear down all fixtures
   */
  async teardownAll(): Promise<void> {
    const fixtureNames = Array.from(this.fixtures.keys());

    // Teardown in reverse order to handle dependencies
    for (const name of fixtureNames.reverse()) {
      if (this.loadedData.has(name)) {
        try {
          await this.teardown(name);
        } catch (error) {
          console.error(`Failed to teardown fixture ${name}:`, error);
          // Continue with other fixtures
        }
      }
    }
  }

  /**
   * Create a scoped fixture manager for isolated tests
   */
  createScope(): FixtureManager {
    const scopedManager = new FixtureManager();

    // Copy all fixtures to the scoped manager
    this.fixtures.forEach((fixture) => {
      scopedManager.register({ ...fixture });
    });

    return scopedManager;
  }

  /**
   * Merge fixtures from another manager
   */
  merge(other: FixtureManager): void {
    other.fixtures.forEach((fixture) => {
      this.register({ ...fixture });
    });
  }
}
