import {
  PerformanceTestConfig,
  PerformanceTestResult,
  PerformanceMetrics,
  IterationResult,
  PerformanceSummary,
  MemoryProfile,
  MemoryLeak,
} from "../types";

/**
 * Performance Tester Implementation
 *
 * Provides comprehensive performance testing capabilities including
 * memory profiling, FPS measurement, and execution time analysis.
 */
export class PerformanceTester {
  private isMemoryAPIAvailable: boolean;

  constructor() {
    // Check if performance memory API is available
    this.isMemoryAPIAvailable =
      "memory" in performance &&
      typeof (performance as any).memory === "object";
  }

  /**
   * Measure performance of a function over multiple iterations
   */
  async measurePerformance(
    fn: () => Promise<void>,
    config: PerformanceTestConfig
  ): Promise<PerformanceTestResult> {
    const {
      iterations,
      warmupIterations,
      timeout,
      memoryThreshold,
      fpsThreshold,
      renderThreshold,
    } = config;

    const startTime = performance.now();
    const results: IterationResult[] = [];
    let totalMemoryUsed = 0;
    let peakMemoryUsed = 0;
    let fpsValues: number[] = [];

    try {
      // Warmup iterations
      for (let i = 0; i < warmupIterations; i++) {
        await this.runSingleIteration(fn, i, false);

        // Check timeout
        if (performance.now() - startTime > timeout) {
          throw new Error(
            `Performance test timed out during warmup after ${timeout}ms`
          );
        }
      }

      // Force garbage collection if available
      await this.forceGarbageCollection();

      // Actual test iterations
      for (let i = 0; i < iterations; i++) {
        const iterationResult = await this.runSingleIteration(fn, i, true);
        results.push(iterationResult);

        totalMemoryUsed += iterationResult.memoryUsed;
        peakMemoryUsed = Math.max(peakMemoryUsed, iterationResult.memoryUsed);
        fpsValues.push(iterationResult.fps);

        // Check timeout
        if (performance.now() - startTime > timeout) {
          throw new Error(`Performance test timed out after ${timeout}ms`);
        }

        // Allow for garbage collection between iterations
        if (i < iterations - 1) {
          await this.sleep(10);
        }
      }

      const totalDuration = performance.now() - startTime;

      // Calculate metrics
      const metrics = this.calculateMetrics(
        results,
        totalDuration,
        peakMemoryUsed
      );

      // Generate summary
      const summary = this.generateSummary(results, config);

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, config);

      return {
        testName: fn.name || "Anonymous Function",
        passed: this.evaluateResults(metrics, config),
        metrics,
        iterations: results,
        summary,
        recommendations,
      };
    } catch (error) {
      return {
        testName: fn.name || "Anonymous Function",
        passed: false,
        metrics: this.getEmptyMetrics(),
        iterations: results,
        summary: {
          totalPassed: 0,
          totalFailed: results.length,
          passRate: 0,
          bottlenecks: [
            `Test failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          ],
          improvements: [],
        },
        recommendations: [
          `Fix the error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ],
      };
    }
  }

  /**
   * Profile memory usage of a function
   */
  async profileMemory(fn: () => Promise<void>): Promise<MemoryProfile> {
    if (!this.isMemoryAPIAvailable) {
      console.warn("Memory profiling API not available. Returning mock data.");
      return {
        baseline: 0,
        peak: 0,
        final: 0,
        leaks: [],
        gcEvents: 0,
      };
    }

    const baseline = this.getCurrentMemoryUsage();
    let peak = baseline;
    let gcEvents = 0;
    const leaks: MemoryLeak[] = [];

    // Monitor memory during execution
    const memoryMonitor = setInterval(() => {
      const current = this.getCurrentMemoryUsage();
      peak = Math.max(peak, current);
    }, 50);

    try {
      // Force GC before starting
      await this.forceGarbageCollection();

      // Execute function
      await fn();

      // Force GC after execution
      gcEvents++;
      await this.forceGarbageCollection();
    } finally {
      clearInterval(memoryMonitor);
    }

    const final = this.getCurrentMemoryUsage();

    // Detect potential memory leaks
    if (final > baseline * 1.5) {
      leaks.push({
        size: final - baseline,
        type: "potential-leak",
        location: fn.name || "anonymous-function",
        retained: final > baseline * 2,
      });
    }

    return {
      baseline,
      peak,
      final,
      leaks,
      gcEvents,
    };
  }

  /**
   * Run a single test iteration
   */
  private async runSingleIteration(
    fn: () => Promise<void>,
    iteration: number,
    trackMetrics: boolean
  ): Promise<IterationResult> {
    const startTime = performance.now();
    const startMemory = trackMetrics ? this.getCurrentMemoryUsage() : 0;

    // Mock FPS measurement (in real browser, would use requestAnimationFrame)
    let fps = 60; // Default assumption
    let renderTime = 0;

    try {
      // Execute the function
      const renderStart = performance.now();
      await fn();
      renderTime = performance.now() - renderStart;

      // Calculate mock FPS (in real implementation, would measure actual frame rate)
      fps = renderTime > 0 ? Math.min(60, 1000 / renderTime) : 60;
    } catch (error) {
      return {
        iteration,
        duration: performance.now() - startTime,
        memoryUsed: trackMetrics
          ? this.getCurrentMemoryUsage() - startMemory
          : 0,
        fps: 0,
        renderTime: 0,
        passed: false,
      };
    }

    const endTime = performance.now();
    const endMemory = trackMetrics ? this.getCurrentMemoryUsage() : 0;

    return {
      iteration,
      duration: endTime - startTime,
      memoryUsed: trackMetrics ? Math.max(0, endMemory - startMemory) : 0,
      fps,
      renderTime,
      passed: true,
    };
  }

  /**
   * Calculate performance metrics from iteration results
   */
  private calculateMetrics(
    results: IterationResult[],
    totalDuration: number,
    peakMemory: number
  ): PerformanceMetrics {
    const successfulResults = results.filter((r) => r.passed);

    if (successfulResults.length === 0) {
      return this.getEmptyMetrics();
    }

    const durations = successfulResults.map((r) => r.duration);
    const memories = successfulResults.map((r) => r.memoryUsed);
    const fpsValues = successfulResults.map((r) => r.fps);
    const renderTimes = successfulResults.map((r) => r.renderTime);

    return {
      averageMemory: memories.reduce((a, b) => a + b, 0) / memories.length,
      peakMemory,
      averageFPS: fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length,
      minFPS: Math.min(...fpsValues),
      averageRenderTime:
        renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
      maxRenderTime: Math.max(...renderTimes),
      gcPauses: 0, // Would be measured in real implementation
      totalDuration,
    };
  }

  /**
   * Generate performance summary
   */
  private generateSummary(
    results: IterationResult[],
    config: PerformanceTestConfig
  ): PerformanceSummary {
    const passed = results.filter(
      (r) =>
        r.passed &&
        r.fps >= config.fpsThreshold &&
        r.renderTime <= config.renderThreshold
    );

    const failed = results.filter((r) => !r.passed);
    const passRate =
      results.length > 0 ? (passed.length / results.length) * 100 : 0;

    const bottlenecks: string[] = [];
    const improvements: string[] = [];

    // Identify bottlenecks
    const lowFpsResults = results.filter((r) => r.fps < config.fpsThreshold);
    if (lowFpsResults.length > 0) {
      bottlenecks.push(
        `Low FPS detected in ${lowFpsResults.length} iterations`
      );
    }

    const slowRenderResults = results.filter(
      (r) => r.renderTime > config.renderThreshold
    );
    if (slowRenderResults.length > 0) {
      bottlenecks.push(
        `Slow rendering detected in ${slowRenderResults.length} iterations`
      );
    }

    const highMemoryResults = results.filter(
      (r) => r.memoryUsed > config.memoryThreshold
    );
    if (highMemoryResults.length > 0) {
      bottlenecks.push(
        `High memory usage detected in ${highMemoryResults.length} iterations`
      );
    }

    // Generate improvements
    if (passRate < 80) {
      improvements.push(
        "Consider optimizing the function for better performance"
      );
    }

    if (bottlenecks.length > 0) {
      improvements.push(
        "Address identified bottlenecks to improve overall performance"
      );
    }

    return {
      totalPassed: passed.length,
      totalFailed: failed.length,
      passRate,
      bottlenecks,
      improvements,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    metrics: PerformanceMetrics,
    config: PerformanceTestConfig
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.averageFPS < config.fpsThreshold) {
      recommendations.push(
        `Average FPS (${metrics.averageFPS.toFixed(1)}) is below threshold (${
          config.fpsThreshold
        }). Consider optimizing rendering.`
      );
    }

    if (metrics.averageRenderTime > config.renderThreshold) {
      recommendations.push(
        `Average render time (${metrics.averageRenderTime.toFixed(
          2
        )}ms) exceeds threshold (${
          config.renderThreshold
        }ms). Consider reducing complexity.`
      );
    }

    if (metrics.averageMemory > config.memoryThreshold) {
      recommendations.push(
        `Average memory usage (${(metrics.averageMemory / 1024 / 1024).toFixed(
          2
        )}MB) exceeds threshold. Consider memory optimization.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Performance is within acceptable thresholds. Good job!"
      );
    }

    return recommendations;
  }

  /**
   * Evaluate if results pass the performance criteria
   */
  private evaluateResults(
    metrics: PerformanceMetrics,
    config: PerformanceTestConfig
  ): boolean {
    return (
      metrics.averageFPS >= config.fpsThreshold &&
      metrics.averageRenderTime <= config.renderThreshold &&
      metrics.averageMemory <= config.memoryThreshold
    );
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (this.isMemoryAPIAvailable) {
      return (performance as any).memory.usedJSHeapSize;
    }

    // Fallback: estimate based on random factors (for demonstration)
    return Math.random() * 10 * 1024 * 1024; // Random value up to 10MB
  }

  /**
   * Force garbage collection if available
   */
  private async forceGarbageCollection(): Promise<void> {
    // In a real browser environment with --enable-gc flag:
    // if (window.gc) window.gc();

    // Fallback: create and dispose of objects to encourage GC
    const largeArray = new Array(1000).fill(null);
    largeArray.splice(0);

    // Give time for GC
    await this.sleep(10);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get empty metrics for error cases
   */
  private getEmptyMetrics(): PerformanceMetrics {
    return {
      averageMemory: 0,
      peakMemory: 0,
      averageFPS: 0,
      minFPS: 0,
      averageRenderTime: 0,
      maxRenderTime: 0,
      gcPauses: 0,
      totalDuration: 0,
    };
  }

  /**
   * Create a performance test suite
   */
  createSuite(name: string): PerformanceTestSuite {
    return new PerformanceTestSuite(name, this);
  }
}

/**
 * Performance Test Suite for organizing multiple performance tests
 */
export class PerformanceTestSuite {
  private tests: Array<{
    name: string;
    fn: () => Promise<void>;
    config: PerformanceTestConfig;
  }> = [];

  constructor(private name: string, private tester: PerformanceTester) {}

  /**
   * Add a test to the suite
   */
  add(
    name: string,
    fn: () => Promise<void>,
    config: Partial<PerformanceTestConfig> = {}
  ): this {
    const defaultConfig: PerformanceTestConfig = {
      iterations: 10,
      warmupIterations: 2,
      timeout: 30000,
      memoryThreshold: 50 * 1024 * 1024,
      fpsThreshold: 30,
      renderThreshold: 16.67,
    };

    this.tests.push({
      name,
      fn,
      config: { ...defaultConfig, ...config },
    });

    return this;
  }

  /**
   * Run all tests in the suite
   */
  async run(): Promise<{
    suiteName: string;
    results: PerformanceTestResult[];
  }> {
    console.log(`Running performance test suite: ${this.name}`);
    const results: PerformanceTestResult[] = [];

    for (const test of this.tests) {
      console.log(`Running test: ${test.name}`);
      try {
        const result = await this.tester.measurePerformance(
          test.fn,
          test.config
        );
        results.push({ ...result, testName: test.name });
        console.log(`✓ ${test.name}: ${result.passed ? "PASSED" : "FAILED"}`);
      } catch (error) {
        console.error(`✗ ${test.name}: ERROR -`, error);
        results.push({
          testName: test.name,
          passed: false,
          metrics: this.tester["getEmptyMetrics"](),
          iterations: [],
          summary: {
            totalPassed: 0,
            totalFailed: 1,
            passRate: 0,
            bottlenecks: [
              `Test failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            ],
            improvements: [],
          },
          recommendations: [],
        });
      }
    }

    return {
      suiteName: this.name,
      results,
    };
  }
}
