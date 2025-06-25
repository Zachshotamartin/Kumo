import {
  ToolHandler,
  ToolType,
  ToolRegistry,
  ToolContext,
  EventBus,
} from "../types";

/**
 * Central registry for managing tool handlers.
 * Implements the Registry pattern for tool management.
 */
export class ToolRegistryImpl implements ToolRegistry {
  private handlers = new Map<ToolType, ToolHandler>();
  private activeHandler: ToolHandler | null = null;
  private context: ToolContext | null = null;
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Set the tool context for all handlers
   */
  setContext(context: ToolContext): void {
    this.context = context;
  }

  /**
   * Register a new tool handler
   */
  register(handler: ToolHandler): void {
    if (this.handlers.has(handler.toolType)) {
      console.warn(
        `Tool handler for ${handler.toolType} is already registered. Overwriting.`
      );
    }

    this.handlers.set(handler.toolType, handler);
    this.eventBus.emit("tool:registered", {
      toolType: handler.toolType,
      config: handler.config,
    });

    console.log(`Registered tool handler: ${handler.toolType}`);
  }

  /**
   * Unregister a tool handler
   */
  unregister(toolType: ToolType): void {
    const handler = this.handlers.get(toolType);

    if (!handler) {
      console.warn(`No handler found for tool type: ${toolType}`);
      return;
    }

    // If this is the active handler, deactivate it first
    if (this.activeHandler === handler) {
      this.deactivateCurrentHandler();
    }

    this.handlers.delete(toolType);
    this.eventBus.emit("tool:unregistered", { toolType });

    console.log(`Unregistered tool handler: ${toolType}`);
  }

  /**
   * Get a specific tool handler
   */
  getHandler(toolType: ToolType): ToolHandler | undefined {
    return this.handlers.get(toolType);
  }

  /**
   * Get all registered tool handlers
   */
  getAllHandlers(): ToolHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get the currently active tool handler
   */
  getActiveHandler(): ToolHandler | undefined {
    return this.activeHandler || undefined;
  }

  /**
   * Set the active tool handler
   */
  setActiveHandler(toolType: ToolType): void {
    const newHandler = this.handlers.get(toolType);

    if (!newHandler) {
      console.error(`No handler found for tool type: ${toolType}`);
      return;
    }

    if (this.activeHandler === newHandler) {
      // Already active, nothing to do
      return;
    }

    // Deactivate current handler
    this.deactivateCurrentHandler();

    // Activate new handler
    this.activeHandler = newHandler;

    if (this.context && newHandler.onActivate) {
      try {
        newHandler.onActivate(this.context);
      } catch (error) {
        console.error(`Error activating tool ${toolType}:`, error);
      }
    }

    this.eventBus.emit("tool:activated", {
      toolType,
      config: newHandler.config,
    });

    console.log(`Activated tool: ${toolType}`);
  }

  /**
   * Get available tool types
   */
  getAvailableToolTypes(): ToolType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a tool is registered
   */
  isRegistered(toolType: ToolType): boolean {
    return this.handlers.has(toolType);
  }

  /**
   * Get tool configurations for UI rendering
   */
  getToolConfigs() {
    return Array.from(this.handlers.values())
      .map((handler) => ({
        ...handler.config,
        type: handler.toolType, // Override config.type with handler.toolType
      }))
      .filter((config) => config.enabled);
  }

  /**
   * Deactivate the current handler
   */
  private deactivateCurrentHandler(): void {
    if (this.activeHandler && this.context && this.activeHandler.onDeactivate) {
      try {
        this.activeHandler.onDeactivate(this.context);
      } catch (error) {
        console.error(
          `Error deactivating tool ${this.activeHandler.toolType}:`,
          error
        );
      }
    }

    if (this.activeHandler) {
      this.eventBus.emit("tool:deactivated", {
        toolType: this.activeHandler.toolType,
      });
    }

    this.activeHandler = null;
  }

  /**
   * Reset the registry - deactivate current tool and clear context
   */
  reset(): void {
    this.deactivateCurrentHandler();
    this.context = null;
  }

  /**
   * Validate that all required tools are registered
   */
  validateRequiredTools(requiredTools: ToolType[]): boolean {
    const missingTools = requiredTools.filter(
      (toolType) => !this.isRegistered(toolType)
    );

    if (missingTools.length > 0) {
      console.error(`Missing required tools: ${missingTools.join(", ")}`);
      return false;
    }

    return true;
  }

  /**
   * Get registry statistics for debugging
   */
  getStats() {
    return {
      totalHandlers: this.handlers.size,
      activeHandler: this.activeHandler?.toolType || null,
      registeredTools: this.getAvailableToolTypes(),
      enabledTools: this.getToolConfigs().map((config) => config.type),
    };
  }
}
