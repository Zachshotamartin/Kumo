import {
  ConfigurationProvider,
  ApplicationConfig,
  DeepPartial,
} from "../types";

/**
 * Local Storage Configuration Provider
 *
 * Stores user preferences in browser localStorage.
 * Provides persistence for user customizations across sessions.
 */
export class LocalStorageConfigurationProvider
  implements ConfigurationProvider
{
  readonly name = "localStorage";
  readonly priority = 70; // Higher priority than file/environment
  readonly canWrite = true;

  private readonly storageKey = "kumo-configuration";
  private watchers: Array<(config: Partial<ApplicationConfig>) => void> = [];
  private storageListener: ((event: StorageEvent) => void) | null = null;

  constructor(storageKey?: string) {
    if (storageKey) {
      (this as any).storageKey = storageKey;
    }
  }

  async load(): Promise<Partial<ApplicationConfig>> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return {};
      }

      const config = JSON.parse(stored);

      // Validate that we have a valid configuration object
      if (typeof config !== "object" || config === null) {
        console.warn("Invalid configuration in localStorage, resetting");
        localStorage.removeItem(this.storageKey);
        return {};
      }

      // Remove metadata to avoid conflicts
      delete config.metadata;

      return config;
    } catch (error) {
      console.error("Failed to load configuration from localStorage:", error);
      // Clear corrupted data
      localStorage.removeItem(this.storageKey);
      return {};
    }
  }

  async save(config: Partial<ApplicationConfig>): Promise<void> {
    try {
      // Get existing config and merge with new config
      const existing = await this.load();
      const merged = this.deepMerge(existing, config);

      // Add metadata
      const configToSave = {
        ...merged,
        metadata: {
          source: "user" as const,
          level: "user" as const,
          timestamp: new Date(),
          version: "1.0.0",
        },
      };

      localStorage.setItem(
        this.storageKey,
        JSON.stringify(configToSave, null, 2)
      );
    } catch (error) {
      console.error("Failed to save configuration to localStorage:", error);
      throw error;
    }
  }

  watch(callback: (config: Partial<ApplicationConfig>) => void): () => void {
    // Add to watchers list
    this.watchers.push(callback);

    // Set up storage event listener if not already set
    if (!this.storageListener) {
      this.storageListener = (event: StorageEvent) => {
        if (event.key === this.storageKey && event.newValue) {
          try {
            const config = JSON.parse(event.newValue);
            delete config.metadata;

            // Notify all watchers
            this.watchers.forEach((watcher) => {
              try {
                watcher(config);
              } catch (error) {
                console.error("Error in configuration watcher:", error);
              }
            });
          } catch (error) {
            console.error(
              "Error parsing configuration from storage event:",
              error
            );
          }
        }
      };

      window.addEventListener("storage", this.storageListener);
    }

    // Return unsubscribe function
    return () => {
      const index = this.watchers.indexOf(callback);
      if (index > -1) {
        this.watchers.splice(index, 1);
      }

      // Remove storage listener if no more watchers
      if (this.watchers.length === 0 && this.storageListener) {
        window.removeEventListener("storage", this.storageListener);
        this.storageListener = null;
      }
    };
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Clear all stored configuration
   */
  async clear(): Promise<void> {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Get the raw stored configuration (for debugging)
   */
  getRawConfig(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  /**
   * Check if localStorage is available
   */
  isAvailable(): boolean {
    try {
      const testKey = "__kumo_storage_test__";
      localStorage.setItem(testKey, "test");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage usage information
   */
  getStorageInfo(): {
    used: number;
    available: number;
    configSize: number;
  } {
    const configData = localStorage.getItem(this.storageKey) || "";
    const configSize = new Blob([configData]).size;

    // Estimate total localStorage usage
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }

    // Most browsers allow ~5-10MB of localStorage
    const estimated = 5 * 1024 * 1024; // 5MB estimate

    return {
      used: totalSize,
      available: estimated - totalSize,
      configSize,
    };
  }

  /**
   * Export configuration as downloadable file
   */
  exportConfiguration(): void {
    const config = localStorage.getItem(this.storageKey);
    if (!config) {
      throw new Error("No configuration to export");
    }

    const blob = new Blob([config], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `kumo-config-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  /**
   * Import configuration from JSON string
   */
  async importConfiguration(configJson: string): Promise<void> {
    try {
      const config = JSON.parse(configJson);

      // Validate basic structure
      if (typeof config !== "object" || config === null) {
        throw new Error("Invalid configuration format");
      }

      // Remove metadata to avoid conflicts
      delete config.metadata;

      await this.save(config);
    } catch (error) {
      throw new Error(
        `Failed to import configuration: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ===================
  // PRIVATE METHODS
  // ===================

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
}
