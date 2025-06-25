/**
 * Common Test Patterns
 *
 * Reusable testing patterns and utilities.
 */

export interface TestPattern {
  name: string;
  setup: () => void;
  teardown: () => void;
  run: () => Promise<void>;
}

/**
 * Async test pattern with timeout
 */
export function createAsyncTestPattern(
  name: string,
  testFn: () => Promise<void>,
  timeout: number = 5000
): TestPattern {
  return {
    name,
    setup: () => {},
    teardown: () => {},
    run: async () => {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test ${name} timed out`)), timeout)
      );

      await Promise.race([testFn(), timeoutPromise]);
    },
  };
}

/**
 * Retry test pattern
 */
export function createRetryTestPattern(
  name: string,
  testFn: () => Promise<void>,
  retries: number = 3
): TestPattern {
  return {
    name,
    setup: () => {},
    teardown: () => {},
    run: async () => {
      let lastError: Error | undefined;

      for (let i = 0; i <= retries; i++) {
        try {
          await testFn();
          return;
        } catch (error) {
          lastError = error as Error;
          if (i < retries) {
            await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
          }
        }
      }

      throw lastError;
    },
  };
}
