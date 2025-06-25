import {
  MockDefinition,
  MockTracker as IMockTracker,
  MockCall,
  MockBehavior,
} from "../types";

/**
 * Mock Tracker Implementation
 *
 * Manages creation, tracking, and cleanup of mocks for testing.
 * Provides spy, stub, and fake implementations with call tracking.
 */
export class MockTracker implements IMockTracker {
  mocks = new Map<string, MockDefinition>();
  calls = new Map<string, MockCall[]>();
  private originalMethods = new Map<string, any>();

  /**
   * Create a mock object based on definition
   */
  createMock<T>(definition: Partial<MockDefinition<T>>): T {
    const mockName = definition.name || `mock_${Date.now()}_${Math.random()}`;

    const fullDefinition: MockDefinition<T> = {
      name: mockName,
      type: definition.type || "mock",
      defaultValue: definition.defaultValue,
      behaviors: definition.behaviors || [],
      config: {
        callThrough: false,
        autoReset: false,
        trackCalls: true,
        ...definition.config,
      },
    };

    this.mocks.set(mockName, fullDefinition);
    this.calls.set(mockName, []);

    return this.buildMockObject(fullDefinition);
  }

  /**
   * Reset all mock call histories but keep the mocks
   */
  reset(): void {
    this.calls.clear();
    this.mocks.forEach((_, mockName) => {
      this.calls.set(mockName, []);
    });
  }

  /**
   * Restore all original methods and clear all mocks
   */
  restore(): void {
    // Restore original methods
    this.originalMethods.forEach((originalMethod, key) => {
      const [target, method] = key.split(".");
      if (target && method) {
        try {
          (global as any)[target][method] = originalMethod;
        } catch (error) {
          console.warn(`Failed to restore method ${key}:`, error);
        }
      }
    });

    this.mocks.clear();
    this.calls.clear();
    this.originalMethods.clear();
  }

  /**
   * Get call history for a specific mock
   */
  getCallHistory(mockName: string): MockCall[] {
    return this.calls.get(mockName) || [];
  }

  /**
   * Create a spy that watches calls to an existing method
   */
  createSpy<T extends object>(target: T, method: keyof T): T[typeof method] {
    const originalMethod = target[method];
    const spyName = `spy_${String(method)}_${Date.now()}`;

    // Store original method for restoration
    this.originalMethods.set(
      `${target.constructor.name}.${String(method)}`,
      originalMethod
    );

    const spy = (...args: any[]) => {
      const callStart = performance.now();

      try {
        const result =
          typeof originalMethod === "function"
            ? originalMethod.apply(target, args)
            : originalMethod;

        const callEnd = performance.now();

        this.trackCall(spyName, {
          timestamp: Date.now(),
          arguments: args,
          returnValue: result,
          duration: callEnd - callStart,
        });

        return result;
      } catch (error) {
        const callEnd = performance.now();

        this.trackCall(spyName, {
          timestamp: Date.now(),
          arguments: args,
          threwError: error instanceof Error ? error : new Error(String(error)),
          duration: callEnd - callStart,
        });

        throw error;
      }
    };

    // Replace the method with our spy
    (target as any)[method] = spy;

    return spy as T[typeof method];
  }

  /**
   * Track a method call
   */
  private trackCall(mockName: string, call: MockCall): void {
    const calls = this.calls.get(mockName) || [];
    calls.push(call);
    this.calls.set(mockName, calls);
  }

  /**
   * Build a mock object from definition
   */
  private buildMockObject<T>(definition: MockDefinition<T>): T {
    const mock = {} as T;

    // Handle default value
    if (definition.defaultValue !== undefined) {
      if (
        typeof definition.defaultValue === "object" &&
        definition.defaultValue !== null
      ) {
        Object.assign(mock, definition.defaultValue);
      }
    }

    // Apply behaviors
    definition.behaviors.forEach((behavior) => {
      this.applyBehavior(mock, behavior, definition);
    });

    return mock;
  }

  /**
   * Apply a specific behavior to a mock
   */
  private applyBehavior<T>(
    mock: T,
    behavior: MockBehavior,
    definition: MockDefinition<T>
  ): void {
    const { method, returns, throws, calls, delay } = behavior;

    (mock as any)[method] = (...args: any[]) => {
      const callStart = performance.now();

      // Track the call if enabled
      if (definition.config.trackCalls) {
        const call: MockCall = {
          timestamp: Date.now(),
          arguments: args,
          duration: 0, // Will be updated below
        };

        // Apply delay if specified
        if (delay && delay > 0) {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              const callEnd = performance.now();
              call.duration = callEnd - callStart;

              try {
                if (throws) {
                  call.threwError = throws;
                  this.trackCall(definition.name, call);
                  reject(throws);
                } else if (calls) {
                  const result = calls(...args);
                  call.returnValue = result;
                  this.trackCall(definition.name, call);
                  resolve(result);
                } else {
                  call.returnValue = returns;
                  this.trackCall(definition.name, call);
                  resolve(returns);
                }
              } catch (error) {
                const err =
                  error instanceof Error ? error : new Error(String(error));
                call.threwError = err;
                this.trackCall(definition.name, call);
                reject(err);
              }
            }, delay);
          });
        }

        // Synchronous execution
        try {
          let result: any;

          if (throws) {
            call.threwError = throws;
            this.trackCall(definition.name, call);
            throw throws;
          } else if (calls) {
            result = calls(...args);
            call.returnValue = result;
          } else {
            result = returns;
            call.returnValue = result;
          }

          const callEnd = performance.now();
          call.duration = callEnd - callStart;
          this.trackCall(definition.name, call);

          return result;
        } catch (error) {
          const callEnd = performance.now();
          const err = error instanceof Error ? error : new Error(String(error));
          call.duration = callEnd - callStart;
          call.threwError = err;
          this.trackCall(definition.name, call);
          throw err;
        }
      }

      // Simple execution without tracking
      if (throws) {
        throw throws;
      } else if (calls) {
        return calls(...args);
      } else {
        return returns;
      }
    };
  }

  /**
   * Check if a mock has been called
   */
  wasCalled(mockName: string): boolean {
    const calls = this.calls.get(mockName);
    return calls ? calls.length > 0 : false;
  }

  /**
   * Check how many times a mock was called
   */
  getCallCount(mockName: string): number {
    const calls = this.calls.get(mockName);
    return calls ? calls.length : 0;
  }

  /**
   * Get the last call to a mock
   */
  getLastCall(mockName: string): MockCall | undefined {
    const calls = this.calls.get(mockName);
    return calls && calls.length > 0 ? calls[calls.length - 1] : undefined;
  }

  /**
   * Get the first call to a mock
   */
  getFirstCall(mockName: string): MockCall | undefined {
    const calls = this.calls.get(mockName);
    return calls && calls.length > 0 ? calls[0] : undefined;
  }

  /**
   * Check if a mock was called with specific arguments
   */
  wasCalledWith(mockName: string, ...expectedArgs: any[]): boolean {
    const calls = this.calls.get(mockName) || [];
    return calls.some(
      (call) =>
        call.arguments.length === expectedArgs.length &&
        call.arguments.every(
          (arg, index) =>
            JSON.stringify(arg) === JSON.stringify(expectedArgs[index])
        )
    );
  }

  /**
   * Get debug information about all mocks
   */
  getDebugInfo(): { mocks: number; totalCalls: number; mockDetails: any[] } {
    const mockDetails = Array.from(this.mocks.entries()).map(
      ([name, definition]) => ({
        name,
        type: definition.type,
        callCount: this.getCallCount(name),
        lastCall: this.getLastCall(name),
      })
    );

    const totalCalls = Array.from(this.calls.values()).reduce(
      (total, calls) => total + calls.length,
      0
    );

    return {
      mocks: this.mocks.size,
      totalCalls,
      mockDetails,
    };
  }
}
