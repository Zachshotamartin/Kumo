/**
 * Configuration System Index
 *
 * Central export file for the Kumo configuration management system.
 * Provides unified access to all configuration components.
 */

// Types
export * from "./types";

// Core manager
export { ConfigurationManagerImpl } from "./core/ConfigurationManager";

// Validation
export { ConfigurationValidator } from "./validation/ConfigurationValidator";

// Default configuration
export { getDefaultConfiguration } from "./defaults/DefaultConfiguration";

// Providers
export { LocalStorageConfigurationProvider } from "./providers/LocalStorageConfigurationProvider";
export { EnvironmentConfigurationProvider } from "./providers/EnvironmentConfigurationProvider";

// React hooks
export {
  useConfiguration,
  useConfigurationSection,
  usePerformanceProfile,
  useTheme,
  destroyConfigurationManager,
} from "./hooks/useConfiguration";

// Components (when available)
// export { default as ConfigurationPanel } from './components/ConfigurationPanel';

/**
 * Quick setup function for getting started with configuration
 */
export function createConfigurationManager() {
  const { ConfigurationManagerImpl } = require("./core/ConfigurationManager");
  const {
    LocalStorageConfigurationProvider,
  } = require("./providers/LocalStorageConfigurationProvider");
  const {
    EnvironmentConfigurationProvider,
  } = require("./providers/EnvironmentConfigurationProvider");

  const manager = new ConfigurationManagerImpl();

  // Add default providers
  manager.addProvider(new EnvironmentConfigurationProvider());

  // Add localStorage provider if available
  const localStorageProvider = new LocalStorageConfigurationProvider();
  if (localStorageProvider.isAvailable()) {
    manager.addProvider(localStorageProvider);
  }

  return manager;
}
