import { ConfigurationProvider, ApplicationConfig } from "../types";

/**
 * Environment Variables Configuration Provider
 *
 * Loads configuration from environment variables.
 * Useful for deployment-specific settings and CI/CD configuration.
 */
export class EnvironmentConfigurationProvider implements ConfigurationProvider {
  readonly name = "environment";
  readonly priority = 30; // Lower priority than user preferences
  readonly canWrite = false; // Environment variables are read-only

  private readonly prefix: string;

  constructor(prefix: string = "REACT_APP_KUMO_") {
    this.prefix = prefix;
  }

  async load(): Promise<Partial<ApplicationConfig>> {
    const config: any = {};

    // Get all environment variables with our prefix
    const envVars = this.getEnvironmentVariables();

    // Parse environment variables into configuration structure
    for (const [key, value] of Object.entries(envVars)) {
      this.setNestedValue(config, key, this.parseValue(value));
    }

    return config;
  }

  // Environment variables are read-only
  async save?(config: Partial<ApplicationConfig>): Promise<void> {
    throw new Error("Environment configuration provider is read-only");
  }

  // Environment variables don't support watching in browser
  watch?(callback: (config: Partial<ApplicationConfig>) => void): () => void {
    console.warn(
      "Environment configuration provider does not support watching"
    );
    return () => {}; // No-op unsubscribe
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Get all available environment variables with prefix
   */
  getAvailableVariables(): Record<string, string> {
    return this.getEnvironmentVariables();
  }

  /**
   * Get documentation for environment variables
   */
  getDocumentation(): Record<string, string> {
    return {
      [`${this.prefix}API_BASE_URL`]: "Base URL for API endpoints",
      [`${this.prefix}API_TIMEOUT`]: "API request timeout in milliseconds",
      [`${this.prefix}ENABLE_DEBUG`]: "Enable debug mode (true/false)",
      [`${this.prefix}LOG_LEVEL`]:
        "Logging level (error/warn/info/debug/trace)",
      [`${this.prefix}FIREBASE_PROJECT_ID`]: "Firebase project ID",
      [`${this.prefix}FIREBASE_API_KEY`]: "Firebase API key",
      [`${this.prefix}PERFORMANCE_MODE`]:
        "Performance mode (high/balanced/battery-saver/compatibility)",
      [`${this.prefix}THEME_MODE`]: "Theme mode (light/dark/auto)",
      [`${this.prefix}GRID_SIZE`]: "Default grid size in pixels",
      [`${this.prefix}MAX_SHAPES`]: "Maximum number of shapes allowed",
      [`${this.prefix}ENABLE_COLLABORATION`]:
        "Enable collaboration features (true/false)",
      [`${this.prefix}MAX_USERS`]: "Maximum number of concurrent users",
      [`${this.prefix}ENABLE_EXPERIMENTAL_FEATURES`]:
        "Enable experimental features (true/false)",
    };
  }

  /**
   * Validate environment configuration
   */
  validateEnvironment(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const envVars = this.getEnvironmentVariables();

    // Check for required variables (if any)
    const requiredVars: string[] = [
      // Add required environment variables here
    ];

    for (const requiredVar of requiredVars) {
      if (!envVars[requiredVar]) {
        errors.push(
          `Required environment variable ${this.prefix}${requiredVar} is not set`
        );
      }
    }

    // Validate specific variables
    if (envVars.API_TIMEOUT) {
      const timeout = parseInt(envVars.API_TIMEOUT, 10);
      if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
        errors.push(
          `${this.prefix}API_TIMEOUT must be a number between 1000 and 300000`
        );
      }
    }

    if (envVars.LOG_LEVEL) {
      const validLevels = ["error", "warn", "info", "debug", "trace"];
      if (!validLevels.includes(envVars.LOG_LEVEL.toLowerCase())) {
        errors.push(
          `${this.prefix}LOG_LEVEL must be one of: ${validLevels.join(", ")}`
        );
      }
    }

    if (envVars.PERFORMANCE_MODE) {
      const validModes = ["high", "balanced", "battery-saver", "compatibility"];
      if (!validModes.includes(envVars.PERFORMANCE_MODE.toLowerCase())) {
        errors.push(
          `${this.prefix}PERFORMANCE_MODE must be one of: ${validModes.join(
            ", "
          )}`
        );
      }
    }

    if (envVars.THEME_MODE) {
      const validModes = ["light", "dark", "auto"];
      if (!validModes.includes(envVars.THEME_MODE.toLowerCase())) {
        errors.push(
          `${this.prefix}THEME_MODE must be one of: ${validModes.join(", ")}`
        );
      }
    }

    // Check for potential typos
    const knownVars = Object.keys(this.getDocumentation()).map((key) =>
      key.replace(this.prefix, "")
    );

    for (const envVar of Object.keys(envVars)) {
      if (!knownVars.includes(envVar)) {
        warnings.push(
          `Unknown environment variable ${this.prefix}${envVar}, possible typo?`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private getEnvironmentVariables(): Record<string, string> {
    const envVars: Record<string, string> = {};

    // In browser, we only have access to REACT_APP_ prefixed variables
    if (typeof window !== "undefined") {
      // Browser environment - access via process.env (webpack provides this)
      for (const key in process.env) {
        if (key.startsWith(this.prefix)) {
          const configKey = key.replace(this.prefix, "");
          const value = process.env[key];
          if (value !== undefined) {
            envVars[configKey] = value;
          }
        }
      }
    } else {
      // Node.js environment (for SSR or testing)
      for (const key in process.env) {
        if (key.startsWith(this.prefix)) {
          const configKey = key.replace(this.prefix, "");
          const value = process.env[key];
          if (value !== undefined) {
            envVars[configKey] = value;
          }
        }
      }
    }

    return envVars;
  }

  private parseValue(value: string): any {
    // Try to parse as boolean
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;

    // Try to parse as number
    const numValue = Number(value);
    if (!isNaN(numValue) && isFinite(numValue)) {
      return numValue;
    }

    // Try to parse as JSON (for arrays, objects)
    if (value.startsWith("{") || value.startsWith("[")) {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to string
      }
    }

    // Return as string
    return value;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    // Convert environment variable path to nested object path
    // e.g., "API_BASE_URL" -> "developer.api.baseUrl"
    // e.g., "THEME_MODE" -> "ui.theme.mode"

    const mappings: Record<string, string> = {
      API_BASE_URL: "developer.api.baseUrl",
      API_TIMEOUT: "developer.api.timeout",
      API_RETRIES: "developer.api.retries",
      ENABLE_DEBUG: "developer.debug.enabled",
      LOG_LEVEL: "developer.debug.logLevel",
      ENABLE_EXPERIMENTAL_FEATURES: "developer.features.experimentalFeatures",
      ENABLE_BETA_FEATURES: "developer.features.betaFeatures",
      THEME_MODE: "ui.theme.mode",
      PRIMARY_COLOR: "ui.theme.primaryColor",
      ACCENT_COLOR: "ui.theme.accentColor",
      GRID_SIZE: "ui.grid.size",
      GRID_ENABLED: "ui.grid.enabled",
      PERFORMANCE_MODE: "performanceProfiles.current",
      MAX_SHAPES: "shapes.maxShapes",
      ENABLE_SHAPE_VALIDATION: "shapes.enableValidation",
      ENABLE_COLLABORATION: "collaboration.realtime.enabled",
      MAX_USERS: "collaboration.realtime.maxUsers",
      ENABLE_CURSORS: "collaboration.realtime.cursorsEnabled",
      DOUBLE_CLICK_THRESHOLD: "input.mouse.doubleClickThreshold",
      DRAG_THRESHOLD: "input.mouse.dragThreshold",
      FIREBASE_CACHE_SIZE: "firebase.firestore.cacheSizeBytes",
      FIREBASE_ENABLE_PERSISTENCE: "firebase.firestore.enablePersistence",
    };

    const mappedPath = mappings[path];
    if (!mappedPath) {
      console.warn(`No mapping found for environment variable: ${path}`);
      return;
    }

    const keys = mappedPath.split(".");
    let current = obj;

    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key && !(key in current)) {
        current[key as string] = {};
      }
      if (key) {
        current = current[key as string];
      }
    }

    // Set the final value
    const finalKey = keys[keys.length - 1];
    if (finalKey) {
      current[finalKey as string] = value;
    }
  }
}
