/**
 * Component Test Suite
 *
 * Provides utilities for testing React components with proper type safety.
 */

import { ReactElement, ComponentType } from "react";
import { TestUtils } from "../utils/TestUtils";
import {
  KumoShape,
  BoardComponentProps,
  ShapeComponentProps,
} from "../../types";

export interface ComponentTestOptions {
  props?: Record<string, any>;
  providers?: ComponentType<any>[];
  mocks?: Record<string, any>;
}

export interface ComponentTestResult {
  container: HTMLElement;
  rerender: (element: ReactElement) => void;
  unmount: () => void;
  debug: () => void;
}

/**
 * Component Test Suite for React components
 */
export class ComponentTestSuite {
  private testUtils: TestUtils;

  constructor() {
    this.testUtils = new TestUtils();
  }

  /**
   * Test a shape component
   */
  async testShapeComponent(
    Component: ComponentType<ShapeComponentProps>,
    shape: KumoShape,
    options: ComponentTestOptions = {}
  ): Promise<ComponentTestResult> {
    const defaultProps: ShapeComponentProps = {
      shape,
      isSelected: false,
      isHovered: false,
      ...options.props,
    };

    return this.testUtils.renderComponent(
      () => <Component {...defaultProps} />,
      {
        providers: options.providers || [],
        wrappers: [],
      }
    );
  }

  /**
   * Test a board component
   */
  async testBoardComponent(
    Component: ComponentType<BoardComponentProps>,
    options: ComponentTestOptions = {}
  ): Promise<ComponentTestResult> {
    const board = this.testUtils.createTestBoard();
    const defaultProps: BoardComponentProps = {
      board,
      readonly: false,
      ...options.props,
    };

    return this.testUtils.renderComponent(
      () => <Component {...defaultProps} />,
      {
        providers: options.providers || [],
        wrappers: [],
      }
    );
  }
}

export function createComponentTestSuite(): ComponentTestSuite {
  return new ComponentTestSuite();
}
