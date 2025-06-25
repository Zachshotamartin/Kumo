import {
  ApplicationConfig,
  ConfigurationManager,
  ConfigurationProvider,
  ConfigurationValidationResult,
  ConfigurationError,
  ConfigurationWarning,
  DeepPartial,
} from "../types";
import { getDefaultConfiguration } from "../defaults/DefaultConfiguration";
import { ConfigurationValidator } from "../validation/ConfigurationValidator";

/**
 * Core Configuration Manager Implementation
 *
 * Manages configuration from multiple sources with proper precedence:
 * 1. Runtime overrides (highest priority)
 * 2. User preferences
 * 3. Environment variables
 * 4. Configuration files
 * 5. System defaults (lowest priority)
 */
export class ConfigurationManagerImpl implements ConfigurationManager {
  private currentConfig: ApplicationConfig;
  private providers: Map<string, ConfigurationProvider> = new Map();
  private validator: ConfigurationValidator;
  private listeners: Array<(config: ApplicationConfig) => void> = [];
  private watchUnsubscribers: Array<() => void> = [];

  constructor() {
    this.validator = new ConfigurationValidator();
    this.currentConfig = getDefaultConfiguration();
    this.loadConfiguration();
  }

  // ===================
  // CONFIGURATION ACCESS
  // ===================

  get<T extends keyof ApplicationConfig>(key: T): ApplicationConfig[T] {
    return this.currentConfig[key];
  }

  async set<T extends keyof ApplicationConfig>(
    key: T,
    value: Partial<ApplicationConfig[T]>
  ): Promise<void> {
    const newConfig = {
      ...this.currentConfig,
      [key]: this.deepMerge(this.currentConfig[key], value),
    };

    // Validate the new configuration
    const validation = this.validator.validate(newConfig);
    if (!validation.valid) {
      throw new Error(
        `Configuration validation failed: ${validation.errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    this.currentConfig = validation.normalizedConfig || newConfig;

    // Try to persist to writable providers
    await this.persistConfiguration({ [key]: value });

    // Notify listeners
    this.notifyListeners();
  }

  async merge(config: Partial<ApplicationConfig>): Promise<void> {
    const newConfig = this.deepMerge(this.currentConfig, config);

    // Validate the merged configuration
    const validation = this.validator.validate(newConfig);
    if (!validation.valid) {
      throw new Error(
        `Configuration merge failed: ${validation.errors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    this.currentConfig = validation.normalizedConfig || newConfig;

    // Try to persist to writable providers
    await this.persistConfiguration(config);

    // Notify listeners
    this.notifyListeners();
  }

  async reset(keys?: (keyof ApplicationConfig)[]): Promise<void> {
    const defaults = getDefaultConfiguration();

    if (keys) {
      // Reset only specified keys
      keys.forEach((key) => {
        (this.currentConfig as any)[key] = (defaults as any)[key];
      });
    } else {
      // Reset everything
      this.currentConfig = defaults;
    }

    // Notify listeners
    this.notifyListeners();
  }

  // ===================
  // PROVIDER MANAGEMENT
  // ===================

  addProvider(provider: ConfigurationProvider): void {
    this.providers.set(provider.name, provider);

    // Set up watching if provider supports it
    if (provider.watch) {
      const unsubscribe = provider.watch((config) => {
        this.handleProviderUpdate(provider.name, config);
      });
      this.watchUnsubscribers.push(unsubscribe);
    }

    // Reload configuration with new provider
    this.loadConfiguration();
  }

  removeProvider(name: string): void {
    this.providers.delete(name);

    // Remove watchers for this provider
    this.watchUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.watchUnsubscribers = [];

    // Re-setup watchers for remaining providers
    this.setupWatchers();

    // Reload configuration without removed provider
    this.loadConfiguration();
  }

  getProviders(): ConfigurationProvider[] {
    return Array.from(this.providers.values());
  }

  // ===================
  // VALIDATION
  // ===================

  validate(config?: Partial<ApplicationConfig>): ConfigurationValidationResult {
    const configToValidate = config || this.currentConfig;
    return this.validator.validate(configToValidate);
  }

  // ===================
  // EVENTS
  // ===================

  subscribe(callback: (config: ApplicationConfig) => void): () => void {
    this.listeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // ===================
  // UTILITIES
  // ===================

  export(): string {
    // Export current configuration as JSON
    const exportConfig = {
      ...this.currentConfig,
      metadata: {
        ...this.currentConfig.metadata,
        timestamp: new Date(),
        source: "export" as const,
      },
    };

    return JSON.stringify(exportConfig, null, 2);
  }

  async import(configStr: string): Promise<void> {
    try {
      const config = JSON.parse(configStr) as Partial<ApplicationConfig>;

      // Remove metadata from import
      delete config.metadata;

      await this.merge(config);
    } catch (error) {
      throw new Error(
        `Failed to import configuration: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getDefaults(): ApplicationConfig {
    return getDefaultConfiguration();
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private async loadConfiguration(): Promise<void> {
    // Sort providers by priority (higher priority = later in merge order)
    const sortedProviders = Array.from(this.providers.values()).sort(
      (a, b) => a.priority - b.priority
    );

    // Start with defaults
    let mergedConfig = getDefaultConfiguration();

    // Merge configurations from all providers
    for (const provider of sortedProviders) {
      try {
        const providerConfig = await provider.load();
        if (providerConfig && Object.keys(providerConfig).length > 0) {
          mergedConfig = this.deepMerge(mergedConfig, providerConfig);
        }
      } catch (error) {
        console.warn(
          `Failed to load configuration from provider ${provider.name}:`,
          error
        );
      }
    }

    // Validate final configuration
    const validation = this.validator.validate(mergedConfig);
    if (!validation.valid) {
      console.error("Configuration validation failed:", validation.errors);
      // Use normalized config if available, otherwise keep current
      if (validation.normalizedConfig) {
        this.currentConfig = validation.normalizedConfig;
      }
    } else {
      this.currentConfig = validation.normalizedConfig || mergedConfig;
    }

    // Notify listeners
    this.notifyListeners();
  }

  private async persistConfiguration(
    config: Partial<ApplicationConfig>
  ): Promise<void> {
    // Find writable providers and persist configuration
    const writableProviders = Array.from(this.providers.values()).filter(
      (provider) => provider.canWrite && provider.save
    );

    for (const provider of writableProviders) {
      try {
        await provider.save!(config);
      } catch (error) {
        console.warn(
          `Failed to persist configuration to provider ${provider.name}:`,
          error
        );
      }
    }
  }

  private handleProviderUpdate(
    providerName: string,
    config: Partial<ApplicationConfig>
  ): void {
    console.log(`Configuration updated from provider: ${providerName}`);
    this.loadConfiguration();
  }

  private setupWatchers(): void {
    // Clear existing watchers
    this.watchUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.watchUnsubscribers = [];

    // Setup watchers for all providers that support it
    this.providers.forEach((provider) => {
      if (provider.watch) {
        const unsubscribe = provider.watch((config) => {
          this.handleProviderUpdate(provider.name, config);
        });
        this.watchUnsubscribers.push(unsubscribe);
      }
    });
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.currentConfig);
      } catch (error) {
        console.error("Error in configuration listener:", error);
      }
    });
  }

  private deepMerge<T>(target: T, source: DeepPartial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (this.isObject(sourceValue) && this.isObject(targetValue)) {
          result[key] = this.deepMerge(targetValue, sourceValue);
        } else if (sourceValue !== undefined) {
          result[key] = sourceValue as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  private isObject(item: any): item is Record<string, any> {
    return (
      item && typeof item === "object" && !Array.isArray(item) && item !== null
    );
  }

  // ===================
  // CLEANUP
  // ===================

  destroy(): void {
    // Unsubscribe from all watchers
    this.watchUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.watchUnsubscribers = [];

    // Clear listeners
    this.listeners = [];

    // Clear providers
    this.providers.clear();
  }
}
