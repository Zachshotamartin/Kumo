/**
 * Mock Patterns
 *
 * Common mocking patterns for testing.
 */

export interface MockPattern {
  name: string;
  create: () => any;
  cleanup: () => void;
}

/**
 * Service mock pattern
 */
export function createServiceMockPattern(serviceName: string): MockPattern {
  let mockInstance: any;

  return {
    name: `${serviceName}Mock`,
    create: () => {
      mockInstance = {
        [`${serviceName}Method`]: jest.fn(),
        [`get${serviceName}Data`]: jest.fn(),
        [`update${serviceName}`]: jest.fn(),
      };
      return mockInstance;
    },
    cleanup: () => {
      if (mockInstance) {
        Object.values(mockInstance).forEach((method: any) => {
          if (typeof method?.mockClear === "function") {
            method.mockClear();
          }
        });
      }
    },
  };
}

/**
 * API mock pattern
 */
export function createApiMockPattern(apiName: string): MockPattern {
  let mockFetch: jest.SpyInstance;

  return {
    name: `${apiName}ApiMock`,
    create: () => {
      mockFetch = jest.spyOn(global, "fetch").mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: "mock data" }),
        } as Response)
      );
      return mockFetch;
    },
    cleanup: () => {
      if (mockFetch) {
        mockFetch.mockRestore();
      }
    },
  };
}
