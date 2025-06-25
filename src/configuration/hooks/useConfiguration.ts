import { useState, useEffect, useCallback, useRef } from "react";
import {
  ApplicationConfig,
  ConfigurationPath,
  ConfigurationValue,
  UIConfig,
} from "../types";
import { ConfigurationManagerImpl } from "../core/ConfigurationManager";
import { LocalStorageConfigurationProvider } from "../providers/LocalStorageConfigurationProvider";
import { EnvironmentConfigurationProvider } from "../providers/EnvironmentConfigurationProvider";

/**
 * Configuration Hook State
 */
interface ConfigurationState {
  config: ApplicationConfig;
  loading: boolean;
  error: string | null;
  isInitialized: boolean;
}

/**
 * Configuration Hook Actions
 */
interface ConfigurationActions {
  // Configuration access
  get<K extends keyof ApplicationConfig>(key: K): ApplicationConfig[K];
  set<K extends keyof ApplicationConfig>(
    key: K,
    value: Partial<ApplicationConfig[K]>
  ): Promise<void>;
  merge(config: Partial<ApplicationConfig>): Promise<void>;
  reset(keys?: (keyof ApplicationConfig)[]): Promise<void>;

  // Utilities
  exportConfig(): string;
  importConfig(configJson: string): Promise<void>;
  validate(): { valid: boolean; errors: string[]; warnings: string[] };

  // Presets
  applyPreset(presetName: string): Promise<void>;
  getAvailablePresets(): string[];

  // Providers
  getProviders(): string[];

  // Error handling
  clearError(): void;
}

/**
 * Configuration Hook Return Type
 */
interface UseConfigurationReturn {
  state: ConfigurationState;
  actions: ConfigurationActions;
}

/**
 * Global configuration manager instance
 */
let globalConfigManager: ConfigurationManagerImpl | null = null;

/**
 * Initialize configuration manager with default providers
 */
function initializeConfigurationManager(): ConfigurationManagerImpl {
  if (globalConfigManager) {
    return globalConfigManager;
  }

  const manager = new ConfigurationManagerImpl();

  // Add default providers
  manager.addProvider(new EnvironmentConfigurationProvider());

  // Add localStorage provider if available
  const localStorageProvider = new LocalStorageConfigurationProvider();
  if (localStorageProvider.isAvailable()) {
    manager.addProvider(localStorageProvider);
  }

  globalConfigManager = manager;
  return manager;
}

/**
 * React Hook for Configuration Management
 *
 * Provides type-safe access to application configuration with real-time updates.
 * Handles loading, validation, and persistence automatically.
 */
export function useConfiguration(): UseConfigurationReturn {
  const managerRef = useRef<ConfigurationManagerImpl | null>(null);

  const [state, setState] = useState<ConfigurationState>({
    config: {} as ApplicationConfig,
    loading: true,
    error: null,
    isInitialized: false,
  });

  // Initialize configuration manager
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = initializeConfigurationManager();
    }
    return undefined;
  }, []);

  // ===================
  // CONFIGURATION ACCESS ACTIONS
  // ===================

  const get = useCallback(
    <K extends keyof ApplicationConfig>(key: K): ApplicationConfig[K] => {
      if (!managerRef.current) {
        throw new Error("Configuration manager not initialized");
      }
      return managerRef.current.get(key);
    },
    []
  );

  const set = useCallback(
    async <K extends keyof ApplicationConfig>(
      key: K,
      value: Partial<ApplicationConfig[K]>
    ): Promise<void> => {
      if (!managerRef.current) {
        throw new Error("Configuration manager not initialized");
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        await managerRef.current.set(key, value);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Configuration update failed",
        }));
        throw error;
      }
    },
    []
  );

  const merge = useCallback(
    async (config: Partial<ApplicationConfig>): Promise<void> => {
      if (!managerRef.current) {
        throw new Error("Configuration manager not initialized");
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        await managerRef.current.merge(config);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Configuration merge failed",
        }));
        throw error;
      }
    },
    []
  );

  const reset = useCallback(
    async (keys?: (keyof ApplicationConfig)[]): Promise<void> => {
      if (!managerRef.current) {
        throw new Error("Configuration manager not initialized");
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        await managerRef.current.reset(keys);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Configuration reset failed",
        }));
        throw error;
      }
    },
    []
  );

  // ===================
  // UTILITY ACTIONS
  // ===================

  const exportConfig = useCallback((): string => {
    if (!managerRef.current) {
      throw new Error("Configuration manager not initialized");
    }
    return managerRef.current.export();
  }, []);

  const importConfig = useCallback(
    async (configJson: string): Promise<void> => {
      if (!managerRef.current) {
        throw new Error("Configuration manager not initialized");
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        await managerRef.current.import(configJson);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Configuration import failed",
        }));
        throw error;
      }
    },
    []
  );

  const validate = useCallback(() => {
    if (!managerRef.current) {
      throw new Error("Configuration manager not initialized");
    }

    const result = managerRef.current.validate();
    return {
      valid: result.valid,
      errors: result.errors.map((e) => `${e.path}: ${e.message}`),
      warnings: result.warnings.map((w) => `${w.path}: ${w.message}`),
    };
  }, []);

  // ===================
  // PRESET ACTIONS
  // ===================

  const applyPreset = useCallback(
    async (presetName: string): Promise<void> => {
      if (!managerRef.current) {
        throw new Error("Configuration manager not initialized");
      }

      const presets = getAvailablePresets();
      if (!presets.includes(presetName)) {
        throw new Error(`Unknown preset: ${presetName}`);
      }

      // Apply performance profile preset
      if (
        presetName === "high-performance" ||
        presetName === "balanced" ||
        presetName === "battery-saver" ||
        presetName === "compatibility"
      ) {
        await set("performanceProfiles", { current: presetName });
        return;
      }

      // Apply theme presets
      if (presetName === "dark-theme") {
        await merge({
          ui: {
            theme: {
              mode: "dark",
              primaryColor: "#3b82f6",
              accentColor: "#1e40af",
            },
            grid: {
              enabled: true,
              size: 20,
              color: "#374151",
              opacity: 0.3,
              snapToGrid: true,
              snapThreshold: 10,
            },
            layout: {
              sidebar: {
                enabled: true,
                position: "left",
                width: 250,
                collapsible: true,
              },
              toolbar: { enabled: true, position: "top", compact: false },
              statusBar: {
                enabled: true,
                showCoordinates: true,
                showZoom: true,
                showFPS: false,
              },
            },
            rulers: {
              enabled: false,
              units: "px",
              color: "#666",
            },
            animations: {
              enabled: true,
              duration: 200,
              easing: "ease",
              reduceMotion: false,
            },
            accessibility: {
              highContrast: false,
              focusOutline: true,
              screenReaderSupport: true,
              keyboardNavigation: true,
            },
          },
        });
        return;
      }

      if (presetName === "light-theme") {
        await merge({
          ui: {
            theme: {
              mode: "light",
              primaryColor: "#3b82f6",
              accentColor: "#1e40af",
            },
            grid: {
              enabled: true,
              size: 20,
              color: "#e5e7eb",
              opacity: 0.5,
              snapToGrid: true,
              snapThreshold: 10,
            },
            layout: {
              sidebar: {
                enabled: true,
                position: "left",
                width: 250,
                collapsible: true,
              },
              toolbar: { enabled: true, position: "top", compact: false },
              statusBar: {
                enabled: true,
                showCoordinates: true,
                showZoom: true,
                showFPS: false,
              },
            },
            rulers: {
              enabled: false,
              units: "px",
              color: "#ccc",
            },
            animations: {
              enabled: true,
              duration: 200,
              easing: "ease",
              reduceMotion: false,
            },
            accessibility: {
              highContrast: false,
              focusOutline: true,
              screenReaderSupport: true,
              keyboardNavigation: true,
            },
          },
        });
        return;
      }

      // Apply accessibility preset
      if (presetName === "accessibility") {
        await merge({
          ui: {
            theme: {
              mode: "light",
              primaryColor: "#3b82f6",
              accentColor: "#1e40af",
            },
            accessibility: {
              highContrast: true,
              focusOutline: true,
              screenReaderSupport: true,
              keyboardNavigation: true,
            },
            animations: {
              enabled: false,
              duration: 0,
              easing: "linear",
              reduceMotion: true,
            },
            layout: {
              sidebar: {
                enabled: true,
                position: "left",
                width: 300,
                collapsible: false,
              },
              toolbar: { enabled: true, position: "top", compact: false },
              statusBar: {
                enabled: true,
                showCoordinates: true,
                showZoom: true,
                showFPS: true,
              },
            },
            rulers: {
              enabled: false,
              units: "px",
              color: "#000",
            },
            grid: {
              enabled: true,
              size: 24,
              color: "#000",
              opacity: 0.8,
              snapToGrid: true,
              snapThreshold: 12,
            },
          },
        });
        return;
      }

      throw new Error(`Preset implementation not found: ${presetName}`);
    },
    [set, merge]
  );

  const getAvailablePresets = useCallback((): string[] => {
    return [
      "high-performance",
      "balanced",
      "battery-saver",
      "compatibility",
      "dark-theme",
      "light-theme",
      "accessibility",
    ];
  }, []);

  // ===================
  // PROVIDER ACTIONS
  // ===================

  const getProviders = useCallback((): string[] => {
    if (!managerRef.current) {
      return [];
    }
    return managerRef.current.getProviders().map((p) => p.name);
  }, []);

  // ===================
  // ERROR HANDLING
  // ===================

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // ===================
  // RETURN INTERFACE
  // ===================

  return {
    state,
    actions: {
      // Configuration access
      get,
      set,
      merge,
      reset,

      // Utilities
      exportConfig,
      importConfig,
      validate,

      // Presets
      applyPreset,
      getAvailablePresets,

      // Providers
      getProviders,

      // Error handling
      clearError,
    },
  };
}

/**
 * Specialized hook for accessing specific configuration sections
 */
export function useConfigurationSection<K extends keyof ApplicationConfig>(
  section: K
): {
  config: ApplicationConfig[K];
  update: (value: Partial<ApplicationConfig[K]>) => Promise<void>;
  loading: boolean;
  error: string | null;
} {
  const { state, actions } = useConfiguration();

  const update = useCallback(
    async (value: Partial<ApplicationConfig[K]>) => {
      await actions.set(section, value);
    },
    [actions, section]
  );

  return {
    config: state.config[section],
    update,
    loading: state.loading,
    error: state.error,
  };
}

/**
 * Hook for performance profile management
 */
export function usePerformanceProfile() {
  const { state, actions } = useConfiguration();
  const profiles = state.config.performanceProfiles;

  const setProfile = useCallback(
    async (profileName: string) => {
      if (!profiles.profiles[profileName]) {
        throw new Error(`Unknown performance profile: ${profileName}`);
      }
      await actions.set("performanceProfiles", { current: profileName });
    },
    [actions, profiles.profiles]
  );

  const getCurrentProfile = useCallback(() => {
    return profiles.profiles[profiles.current];
  }, [profiles]);

  return {
    current: profiles.current,
    profile: getCurrentProfile(),
    profiles: profiles.profiles,
    setProfile,
    availableProfiles: Object.keys(profiles.profiles),
  };
}

/**
 * Hook for theme management
 */
export function useTheme() {
  const { config: uiConfig, update } = useConfigurationSection("ui");
  const theme = uiConfig.theme;

  const setTheme = useCallback(
    async (mode: "light" | "dark" | "auto") => {
      await update({ theme: { ...theme, mode } });
    },
    [theme, update]
  );

  const setColors = useCallback(
    async (primaryColor: string, accentColor?: string) => {
      await update({
        theme: {
          ...theme,
          primaryColor,
          ...(accentColor && { accentColor }),
        },
      });
    },
    [theme, update]
  );

  return {
    mode: theme.mode,
    primaryColor: theme.primaryColor,
    accentColor: theme.accentColor,
    setTheme,
    setColors,
  };
}

// Clean up global resources when needed
export function destroyConfigurationManager(): void {
  if (globalConfigManager) {
    globalConfigManager.destroy();
    globalConfigManager = null;
  }
}
