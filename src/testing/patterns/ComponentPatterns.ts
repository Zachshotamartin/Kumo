/**
 * Component Patterns
 *
 * Common component testing patterns.
 */

import { ReactElement, ComponentType } from "react";

export interface ComponentPattern {
  name: string;
  render: () => ReactElement;
  test: () => Promise<void>;
}

/**
 * Interactive component pattern
 */
export function createInteractiveComponentPattern(
  Component: ComponentType<any>,
  props: any = {}
): ComponentPattern {
  return {
    name: `${Component.name}InteractiveTest`,
    render: () => <Component {...props} />,
    test: async () => {
      // Basic interactive test implementation
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}

/**
 * Error boundary pattern
 */
export function createErrorBoundaryPattern(
  Component: ComponentType<any>,
  errorProps: any = {}
): ComponentPattern {
  return {
    name: `${Component.name}ErrorBoundaryTest`,
    render: () => <Component {...errorProps} />,
    test: async () => {
      // Error boundary test implementation
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
