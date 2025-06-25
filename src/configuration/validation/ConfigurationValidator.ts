import {
  ApplicationConfig,
  ConfigurationValidator as IConfigurationValidator,
  ConfigurationValidationResult,
  ConfigurationError,
  ConfigurationWarning,
  DeepPartial,
} from "../types";
import { getDefaultConfiguration } from "../defaults/DefaultConfiguration";

/**
 * Configuration Validator Implementation
 *
 * Validates configuration objects against expected schemas.
 * Provides normalization, type checking, and helpful error messages.
 */
export class ConfigurationValidator
  implements IConfigurationValidator<ApplicationConfig>
{
  /**
   * Validate a configuration object
   */
  validate(config: Partial<ApplicationConfig>): ConfigurationValidationResult {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];
    const normalizedConfig = this.normalizeConfiguration(config);

    // Validate each section
    this.validateStateMachineConfig(
      normalizedConfig.stateMachine,
      "stateMachine",
      errors,
      warnings
    );
    this.validateToolsConfig(normalizedConfig.tools, "tools", errors, warnings);
    this.validateShapesConfig(
      normalizedConfig.shapes,
      "shapes",
      errors,
      warnings
    );
    this.validatePerformanceConfig(
      normalizedConfig.performance,
      "performance",
      errors,
      warnings
    );
    this.validateFirebaseConfig(
      normalizedConfig.firebase,
      "firebase",
      errors,
      warnings
    );
    this.validateUIConfig(normalizedConfig.ui, "ui", errors, warnings);
    this.validateInputConfig(normalizedConfig.input, "input", errors, warnings);
    this.validateCollaborationConfig(
      normalizedConfig.collaboration,
      "collaboration",
      errors,
      warnings
    );
    this.validateExportConfig(
      normalizedConfig.export,
      "export",
      errors,
      warnings
    );
    this.validateDeveloperConfig(
      normalizedConfig.developer,
      "developer",
      errors,
      warnings
    );

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedConfig,
    };
  }

  /**
   * Get default configuration
   */
  getDefaults(): ApplicationConfig {
    return getDefaultConfiguration();
  }

  /**
   * Migrate configuration from older version
   */
  migrate(oldConfig: any, version: string): Partial<ApplicationConfig> {
    console.log(`Migrating configuration from version ${version}`);

    // Handle migration based on version
    switch (version) {
      case "0.9.0":
        return this.migrateFrom090(oldConfig);
      default:
        console.warn(`No migration available for version ${version}`);
        return oldConfig;
    }
  }

  // ===================
  // PRIVATE VALIDATION METHODS
  // ===================

  private normalizeConfiguration(
    config: Partial<ApplicationConfig>
  ): ApplicationConfig {
    const defaults = this.getDefaults();
    return this.deepMerge(defaults, config);
  }

  private validateStateMachineConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    this.validateNumber(
      config.doubleClickThreshold,
      `${path}.doubleClickThreshold`,
      100,
      1000,
      errors
    );
    this.validateNumber(
      config.dragThreshold,
      `${path}.dragThreshold`,
      1,
      20,
      errors
    );
    this.validateNumber(
      config.hoverDelay,
      `${path}.hoverDelay`,
      0,
      1000,
      errors
    );
    this.validateBoolean(
      config.allowMultiSelect,
      `${path}.allowMultiSelect`,
      errors
    );
    this.validateBoolean(
      config.enableSnapToGrid,
      `${path}.enableSnapToGrid`,
      errors
    );
    this.validateNumber(
      config.debounceMs,
      `${path}.debounceMs`,
      0,
      100,
      errors
    );
    this.validateNumber(
      config.throttleMs,
      `${path}.throttleMs`,
      0,
      100,
      errors
    );
    this.validateNumber(
      config.maxHistorySize,
      `${path}.maxHistorySize`,
      10,
      1000,
      errors
    );
  }

  private validateToolsConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    this.validateBoolean(
      config.enablePerformanceMonitoring,
      `${path}.enablePerformanceMonitoring`,
      errors
    );
    this.validateNumber(
      config.throttleMouseMove,
      `${path}.throttleMouseMove`,
      1,
      100,
      errors
    );
    this.validateNumber(
      config.debounceResize,
      `${path}.debounceResize`,
      10,
      500,
      errors
    );
    this.validateNumber(config.gridSize, `${path}.gridSize`, 5, 100, errors);
    this.validateNumber(
      config.maxHistorySize,
      `${path}.maxHistorySize`,
      10,
      1000,
      errors
    );
  }

  private validateShapesConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    this.validateBoolean(
      config.enableValidation,
      `${path}.enableValidation`,
      errors
    );
    this.validateBoolean(
      config.enablePerformanceOptimizations,
      `${path}.enablePerformanceOptimizations`,
      errors
    );
    this.validateNumber(
      config.maxShapes,
      `${path}.maxShapes`,
      100,
      100000,
      errors
    );
    this.validateNumber(
      config.defaultZoomLevel,
      `${path}.defaultZoomLevel`,
      0.1,
      10,
      errors
    );

    if (config.maxShapes > 50000) {
      warnings.push({
        path: `${path}.maxShapes`,
        message: "Very high shape limit may impact performance",
        suggestion:
          "Consider using a lower limit or enable performance optimizations",
      });
    }
  }

  private validatePerformanceConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    this.validateNumber(
      config.viewportPadding,
      `${path}.viewportPadding`,
      0,
      1000,
      errors
    );
    this.validateBoolean(
      config.cullingEnabled,
      `${path}.cullingEnabled`,
      errors
    );
    this.validateBoolean(config.lodEnabled, `${path}.lodEnabled`, errors);
    this.validateNumber(
      config.maxShapesPerFrame,
      `${path}.maxShapesPerFrame`,
      10,
      10000,
      errors
    );
    this.validateNumber(config.batchSize, `${path}.batchSize`, 1, 1000, errors);
    this.validateNumber(
      config.frameTimeTarget,
      `${path}.frameTimeTarget`,
      8.33,
      100,
      errors
    );

    if (config.lodThresholds) {
      this.validateNumber(
        config.lodThresholds.simple,
        `${path}.lodThresholds.simple`,
        0,
        1,
        errors
      );
      this.validateNumber(
        config.lodThresholds.hidden,
        `${path}.lodThresholds.hidden`,
        0,
        1,
        errors
      );

      if (config.lodThresholds.simple <= config.lodThresholds.hidden) {
        errors.push({
          path: `${path}.lodThresholds`,
          message: "Simple threshold must be greater than hidden threshold",
          value: config.lodThresholds,
          expected: "simple > hidden",
        });
      }
    }
  }

  private validateFirebaseConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    if (config.firestore) {
      this.validateBoolean(
        config.firestore.enablePersistence,
        `${path}.firestore.enablePersistence`,
        errors
      );
      this.validateNumber(
        config.firestore.cacheSizeBytes,
        `${path}.firestore.cacheSizeBytes`,
        1024 * 1024,
        100 * 1024 * 1024,
        errors
      );
    }

    if (config.performance) {
      this.validateNumber(
        config.performance.batchSize,
        `${path}.performance.batchSize`,
        1,
        100,
        errors
      );
      this.validateNumber(
        config.performance.throttleMs,
        `${path}.performance.throttleMs`,
        1,
        1000,
        errors
      );
      this.validateNumber(
        config.performance.maxRetries,
        `${path}.performance.maxRetries`,
        0,
        10,
        errors
      );
    }
  }

  private validateUIConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    if (config.theme) {
      this.validateEnum(
        config.theme.mode,
        `${path}.theme.mode`,
        ["light", "dark", "auto"],
        errors
      );
      this.validateColor(
        config.theme.primaryColor,
        `${path}.theme.primaryColor`,
        errors
      );
      this.validateColor(
        config.theme.accentColor,
        `${path}.theme.accentColor`,
        errors
      );
    }

    if (config.grid) {
      this.validateNumber(
        config.grid.size,
        `${path}.grid.size`,
        1,
        200,
        errors
      );
      this.validateColor(config.grid.color, `${path}.grid.color`, errors);
      this.validateNumber(
        config.grid.opacity,
        `${path}.grid.opacity`,
        0,
        1,
        errors
      );
      this.validateNumber(
        config.grid.snapThreshold,
        `${path}.grid.snapThreshold`,
        1,
        50,
        errors
      );
    }

    if (config.animations) {
      this.validateNumber(
        config.animations.duration,
        `${path}.animations.duration`,
        0,
        2000,
        errors
      );
      this.validateEnum(
        config.animations.easing,
        `${path}.animations.easing`,
        ["linear", "ease", "ease-in", "ease-out", "ease-in-out"],
        errors
      );
    }
  }

  private validateInputConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    if (config.mouse) {
      this.validateNumber(
        config.mouse.doubleClickThreshold,
        `${path}.mouse.doubleClickThreshold`,
        100,
        1000,
        errors
      );
      this.validateNumber(
        config.mouse.dragThreshold,
        `${path}.mouse.dragThreshold`,
        1,
        20,
        errors
      );
      this.validateNumber(
        config.mouse.wheelSensitivity,
        `${path}.mouse.wheelSensitivity`,
        0.1,
        5,
        errors
      );
      this.validateEnum(
        config.mouse.rightClickBehavior,
        `${path}.mouse.rightClickBehavior`,
        ["context-menu", "pan", "disabled"],
        errors
      );
    }

    if (config.selection) {
      this.validateNumber(
        config.selection.hoverDelay,
        `${path}.selection.hoverDelay`,
        0,
        1000,
        errors
      );
      this.validateColor(
        config.selection.selectionColor,
        `${path}.selection.selectionColor`,
        errors
      );
      this.validateNumber(
        config.selection.selectionOpacity,
        `${path}.selection.selectionOpacity`,
        0,
        1,
        errors
      );
    }
  }

  private validateCollaborationConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    if (config.realtime) {
      this.validateNumber(
        config.realtime.maxUsers,
        `${path}.realtime.maxUsers`,
        1,
        100,
        errors
      );
    }

    if (config.cursors) {
      this.validateNumber(
        config.cursors.fadeDuration,
        `${path}.cursors.fadeDuration`,
        100,
        10000,
        errors
      );

      if (config.cursors.colors && Array.isArray(config.cursors.colors)) {
        config.cursors.colors.forEach((color: any, index: number) => {
          this.validateColor(color, `${path}.cursors.colors[${index}]`, errors);
        });
      }
    }

    if (config.conflicts) {
      this.validateEnum(
        config.conflicts.strategy,
        `${path}.conflicts.strategy`,
        ["last-write-wins", "operational-transform", "crdt"],
        errors
      );
    }
  }

  private validateExportConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    if (config.defaults) {
      this.validateEnum(
        config.defaults.format,
        `${path}.defaults.format`,
        ["png", "svg", "pdf", "json"],
        errors
      );
      this.validateNumber(
        config.defaults.quality,
        `${path}.defaults.quality`,
        10,
        100,
        errors
      );
      this.validateNumber(
        config.defaults.dpi,
        `${path}.defaults.dpi`,
        72,
        600,
        errors
      );
    }

    if (config.cloudStorage) {
      this.validateEnum(
        config.cloudStorage.provider,
        `${path}.cloudStorage.provider`,
        ["google-drive", "dropbox", "onedrive", "custom"],
        errors
      );
      this.validateNumber(
        config.cloudStorage.backupInterval,
        `${path}.cloudStorage.backupInterval`,
        60000,
        3600000,
        errors
      ); // 1 min to 1 hour
    }
  }

  private validateDeveloperConfig(
    config: any,
    path: string,
    errors: ConfigurationError[],
    warnings: ConfigurationWarning[]
  ): void {
    if (!config) return;

    if (config.debug) {
      this.validateEnum(
        config.debug.logLevel,
        `${path}.debug.logLevel`,
        ["error", "warn", "info", "debug", "trace"],
        errors
      );
    }

    if (config.api) {
      this.validateNumber(
        config.api.timeout,
        `${path}.api.timeout`,
        1000,
        300000,
        errors
      );
      this.validateNumber(
        config.api.retries,
        `${path}.api.retries`,
        0,
        10,
        errors
      );

      if (config.api.baseUrl && typeof config.api.baseUrl === "string") {
        try {
          new URL(config.api.baseUrl);
        } catch {
          // Not a full URL, check if it's a relative path
          if (!config.api.baseUrl.startsWith("/")) {
            errors.push({
              path: `${path}.api.baseUrl`,
              message:
                "Base URL must be a valid URL or relative path starting with /",
              value: config.api.baseUrl,
              expected: "Valid URL or path starting with /",
            });
          }
        }
      }
    }
  }

  // ===================
  // VALIDATION HELPERS
  // ===================

  private validateNumber(
    value: any,
    path: string,
    min: number,
    max: number,
    errors: ConfigurationError[]
  ): void {
    if (typeof value !== "number" || isNaN(value)) {
      errors.push({
        path,
        message: "Must be a valid number",
        value,
        expected: `Number between ${min} and ${max}`,
      });
      return;
    }

    if (value < min || value > max) {
      errors.push({
        path,
        message: `Number out of valid range`,
        value,
        expected: `Number between ${min} and ${max}`,
      });
    }
  }

  private validateBoolean(
    value: any,
    path: string,
    errors: ConfigurationError[]
  ): void {
    if (typeof value !== "boolean") {
      errors.push({
        path,
        message: "Must be a boolean",
        value,
        expected: "true or false",
      });
    }
  }

  private validateEnum(
    value: any,
    path: string,
    allowedValues: string[],
    errors: ConfigurationError[]
  ): void {
    if (!allowedValues.includes(value)) {
      errors.push({
        path,
        message: "Invalid enum value",
        value,
        expected: `One of: ${allowedValues.join(", ")}`,
      });
    }
  }

  private validateColor(
    value: any,
    path: string,
    errors: ConfigurationError[]
  ): void {
    if (typeof value !== "string") {
      errors.push({
        path,
        message: "Color must be a string",
        value,
        expected: "Valid CSS color (hex, rgb, hsl, or named color)",
      });
      return;
    }

    // Basic color validation (hex colors)
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbColorRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const rgbaColorRegex =
      /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0|1|0?\.\d+)\s*\)$/;
    const hslColorRegex = /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/;
    const hslaColorRegex =
      /^hsla\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*,\s*(0|1|0?\.\d+)\s*\)$/;

    const isValidColor =
      hexColorRegex.test(value) ||
      rgbColorRegex.test(value) ||
      rgbaColorRegex.test(value) ||
      hslColorRegex.test(value) ||
      hslaColorRegex.test(value);

    if (!isValidColor) {
      errors.push({
        path,
        message: "Invalid color format",
        value,
        expected: "Valid CSS color (hex, rgb, hsl, or named color)",
      });
    }
  }

  // ===================
  // MIGRATION HELPERS
  // ===================

  private migrateFrom090(oldConfig: any): Partial<ApplicationConfig> {
    const migrated: any = { ...oldConfig };

    // Example migration: move old grid settings to new UI config
    if (oldConfig.gridEnabled !== undefined) {
      migrated.ui = migrated.ui || {};
      migrated.ui.grid = migrated.ui.grid || {};
      migrated.ui.grid.enabled = oldConfig.gridEnabled;
      delete migrated.gridEnabled;
    }

    return migrated;
  }

  // ===================
  // UTILITY METHODS
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
