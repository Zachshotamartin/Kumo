import {
  ShapeRegistry,
  ShapePlugin,
  BaseShape,
  ShapeCreationOptions,
  ShapePluginConfig,
} from "../types";

/**
 * Central registry for managing shape plugins.
 * Implements the Registry pattern for shape plugin management.
 */
export class ShapeRegistryImpl implements ShapeRegistry {
  private plugins = new Map<string, ShapePlugin>();
  private configs = new Map<string, ShapePluginConfig>();

  /**
   * Register a new shape plugin
   */
  register(plugin: ShapePlugin, config?: ShapePluginConfig): void {
    if (this.plugins.has(plugin.type)) {
      console.warn(
        `Shape plugin for type '${plugin.type}' is already registered. Overwriting.`
      );
    }

    // Validate plugin
    if (!this.validatePlugin(plugin)) {
      throw new Error(`Invalid shape plugin: ${plugin.type}`);
    }

    this.plugins.set(plugin.type, plugin);

    // Set default config if not provided
    const pluginConfig: ShapePluginConfig = config || {
      type: plugin.type,
      enabled: true,
      renderOptions: {
        enableHover: true,
        enableSelection: true,
      },
    };

    this.configs.set(plugin.type, pluginConfig);

    console.log(`Registered shape plugin: ${plugin.type}`);
  }

  /**
   * Unregister a shape plugin
   */
  unregister(type: string): void {
    if (!this.plugins.has(type)) {
      console.warn(`No shape plugin found for type: ${type}`);
      return;
    }

    this.plugins.delete(type);
    this.configs.delete(type);

    console.log(`Unregistered shape plugin: ${type}`);
  }

  /**
   * Get a specific shape plugin
   */
  getPlugin(type: string): ShapePlugin | undefined {
    return this.plugins.get(type);
  }

  /**
   * Get all registered shape plugins
   */
  getAllPlugins(): ShapePlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all registered shape types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all enabled shape types
   */
  getEnabledTypes(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Check if a shape type is enabled
   */
  isEnabled(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * Enable a shape type
   */
  enable(type: string): void {
    if (this.plugins.has(type)) {
      const plugin = this.plugins.get(type)!;
      this.plugins.set(type, plugin);
    }
  }

  /**
   * Disable a shape type
   */
  disable(type: string): void {
    this.plugins.delete(type);
  }

  /**
   * Create a shape using registered plugin
   */
  createShape(type: string, options: ShapeCreationOptions): BaseShape | null {
    const plugin = this.plugins.get(type);
    const config = this.configs.get(type);

    if (!plugin) {
      console.error(`No shape plugin found for type: ${type}`);
      return null;
    }

    if (!config?.enabled) {
      console.error(`Shape plugin for type '${type}' is disabled`);
      return null;
    }

    try {
      // Create base shape with plugin
      const shape = plugin.create(options);

      // Apply default properties from config if available
      if (config.defaultProperties) {
        Object.assign(shape, config.defaultProperties);
      }

      // Validate the created shape
      if (!plugin.validate(shape)) {
        console.error(`Created shape failed validation: ${type}`);
        return null;
      }

      return shape;
    } catch (error) {
      console.error(`Error creating shape of type '${type}':`, error);
      return null;
    }
  }

  /**
   * Get plugin configuration
   */
  getPluginConfig(type: string): ShapePluginConfig | undefined {
    return this.configs.get(type);
  }

  /**
   * Update plugin configuration
   */
  updatePluginConfig(type: string, updates: Partial<ShapePluginConfig>): void {
    const currentConfig = this.configs.get(type);
    if (!currentConfig) {
      console.warn(`No configuration found for shape type: ${type}`);
      return;
    }

    const newConfig = { ...currentConfig, ...updates };
    this.configs.set(type, newConfig);
  }

  /**
   * Enable/disable a shape plugin
   */
  setPluginEnabled(type: string, enabled: boolean): void {
    this.updatePluginConfig(type, { enabled });
  }

  /**
   * Check if a shape type is registered
   */
  isRegistered(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * Validate that a shape plugin conforms to the interface
   */
  private validatePlugin(plugin: ShapePlugin): boolean {
    // Check required properties
    if (!plugin.type || typeof plugin.type !== "string") {
      console.error("Plugin must have a valid type string");
      return false;
    }

    if (!plugin.name || typeof plugin.name !== "string") {
      console.error("Plugin must have a valid name string");
      return false;
    }

    if (typeof plugin.create !== "function") {
      console.error("Plugin must implement create method");
      return false;
    }

    if (typeof plugin.render !== "function") {
      console.error("Plugin must implement render method");
      return false;
    }

    if (typeof plugin.validate !== "function") {
      console.error("Plugin must implement validate method");
      return false;
    }

    if (typeof plugin.getDefaultProperties !== "function") {
      console.error("Plugin must implement getDefaultProperties method");
      return false;
    }

    return true;
  }

  /**
   * Get registry statistics for debugging
   */
  getStats() {
    const enabledCount = this.getEnabledTypes().length;
    const totalCount = this.plugins.size;

    return {
      totalPlugins: totalCount,
      enabledPlugins: enabledCount,
      disabledPlugins: totalCount - enabledCount,
      registeredTypes: this.getRegisteredTypes(),
      enabledTypes: this.getEnabledTypes(),
    };
  }

  /**
   * Export registry state for debugging or backup
   */
  exportState() {
    return {
      plugins: Array.from(this.plugins.entries()).map(([type, plugin]) => ({
        type,
        name: plugin.name,
        description: plugin.description,
        icon: plugin.icon,
      })),
      configs: Array.from(this.configs.entries()),
    };
  }

  /**
   * Clear all registered plugins (useful for testing)
   */
  clear(): void {
    this.plugins.clear();
    this.configs.clear();
  }

  /**
   * Batch register multiple plugins
   */
  registerBatch(
    pluginsWithConfigs: Array<{
      plugin: ShapePlugin;
      config?: ShapePluginConfig;
    }>
  ): void {
    pluginsWithConfigs.forEach(({ plugin, config }) => {
      this.register(plugin, config);
    });
  }

  /**
   * Get all plugins that can handle a specific operation
   */
  getPluginsWithOperation(operationName: keyof ShapePlugin): ShapePlugin[] {
    return Array.from(this.plugins.values()).filter(
      (plugin) => typeof plugin[operationName] === "function"
    );
  }
}
