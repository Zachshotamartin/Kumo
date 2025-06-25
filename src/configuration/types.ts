/**
 * Configuration Type System
 *
 * Centralized configuration types for the entire application.
 * Unifies scattered configuration interfaces into a coherent system.
 */

// Import existing configuration types
import { StateMachineConfig } from "../state/types";
import { ToolSystemConfig } from "../tools/types";
import { ShapeSystemConfig } from "../shapes/types";
import { VirtualRenderConfig, PerformanceProfile } from "../performance/types";
import { FirebaseConfig } from "../firebase/types";
import { DIContainerConfig } from "../architecture/infrastructure/container/DIContainer";

// ===================
// CORE CONFIGURATION TYPES
// ===================

export type ConfigurationSource =
  | "default"
  | "environment"
  | "file"
  | "user"
  | "runtime";

export type ConfigurationLevel = "system" | "application" | "user" | "session";

export interface ConfigurationMetadata {
  source: ConfigurationSource;
  level: ConfigurationLevel;
  timestamp: Date;
  version: string;
  readOnly?: boolean;
  encrypted?: boolean;
}

// ===================
// FEATURE CONFIGURATIONS
// ===================

/**
 * UI/UX Configuration
 */
export interface UIConfig {
  // Theme and appearance
  theme: {
    mode: "light" | "dark" | "auto";
    primaryColor: string;
    accentColor: string;
    customCSS?: string;
  };

  // Layout preferences
  layout: {
    sidebar: {
      enabled: boolean;
      position: "left" | "right";
      width: number;
      collapsible: boolean;
    };
    toolbar: {
      enabled: boolean;
      position: "top" | "bottom" | "left" | "right";
      compact: boolean;
    };
    statusBar: {
      enabled: boolean;
      showCoordinates: boolean;
      showZoom: boolean;
      showFPS: boolean;
    };
  };

  // Grid and guides
  grid: {
    enabled: boolean;
    size: number;
    color: string;
    opacity: number;
    snapToGrid: boolean;
    snapThreshold: number;
  };

  // Rulers and guides
  rulers: {
    enabled: boolean;
    units: "px" | "cm" | "in" | "pt";
    color: string;
  };

  // Animation preferences
  animations: {
    enabled: boolean;
    duration: number;
    easing: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
    reduceMotion: boolean;
  };

  // Accessibility
  accessibility: {
    highContrast: boolean;
    focusOutline: boolean;
    screenReaderSupport: boolean;
    keyboardNavigation: boolean;
  };
}

/**
 * Input and Interaction Configuration
 */
export interface InputConfig {
  // Mouse behavior
  mouse: {
    doubleClickThreshold: number;
    dragThreshold: number;
    wheelSensitivity: number;
    rightClickBehavior: "context-menu" | "pan" | "disabled";
    middleClickBehavior: "pan" | "zoom" | "disabled";
  };

  // Touch behavior (for touch devices)
  touch: {
    enabled: boolean;
    multiTouch: boolean;
    gestureThreshold: number;
    tapThreshold: number;
    longPressThreshold: number;
  };

  // Keyboard shortcuts
  keyboard: {
    enabled: boolean;
    shortcuts: Record<string, string>; // Action -> Key combination
    customShortcuts: Record<string, string>;
  };

  // Selection behavior
  selection: {
    allowMultiSelect: boolean;
    selectOnHover: boolean;
    hoverDelay: number;
    selectionColor: string;
    selectionOpacity: number;
  };
}

/**
 * Collaboration Configuration
 */
export interface CollaborationConfig {
  // Real-time features
  realtime: {
    enabled: boolean;
    cursorsEnabled: boolean;
    presenceEnabled: boolean;
    chatEnabled: boolean;
    maxUsers: number;
  };

  // Cursor settings
  cursors: {
    showNames: boolean;
    showPointer: boolean;
    fadeDuration: number;
    colors: string[];
  };

  // Conflict resolution
  conflicts: {
    strategy: "last-write-wins" | "operational-transform" | "crdt";
    automaticResolution: boolean;
    notifyOnConflict: boolean;
  };

  // Permissions
  permissions: {
    allowAnonymous: boolean;
    defaultRole: "viewer" | "editor" | "admin";
    requireInvite: boolean;
  };
}

/**
 * Export/Import Configuration
 */
export interface ExportConfig {
  // Default export settings
  defaults: {
    format: "png" | "svg" | "pdf" | "json";
    quality: number;
    dpi: number;
    includeBackground: boolean;
    transparentBackground: boolean;
  };

  // Available formats
  formats: {
    png: { enabled: boolean; maxSize: number };
    svg: { enabled: boolean; embedFonts: boolean };
    pdf: { enabled: boolean; pageSize: string };
    json: { enabled: boolean; includeMetadata: boolean };
  };

  // Cloud storage
  cloudStorage: {
    enabled: boolean;
    provider: "google-drive" | "dropbox" | "onedrive" | "custom";
    autoBackup: boolean;
    backupInterval: number;
  };
}

/**
 * Developer and Debug Configuration
 */
export interface DeveloperConfig {
  // Debug features
  debug: {
    enabled: boolean;
    showFPS: boolean;
    showMemoryUsage: boolean;
    logLevel: "error" | "warn" | "info" | "debug" | "trace";
    enablePerformanceProfiler: boolean;
  };

  // Development tools
  devTools: {
    enabled: boolean;
    showStateInspector: boolean;
    showEventLog: boolean;
    enableHotReload: boolean;
  };

  // Feature flags
  features: {
    experimentalFeatures: boolean;
    betaFeatures: boolean;
    flags: Record<string, boolean>;
  };

  // API and integrations
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
    enableMocking: boolean;
  };
}

// ===================
// UNIFIED APPLICATION CONFIGURATION
// ===================

/**
 * Complete Application Configuration
 *
 * This is the master configuration interface that includes all subsystems.
 */
export interface ApplicationConfig {
  // Metadata
  metadata: ConfigurationMetadata;

  // Core systems (existing)
  stateMachine: StateMachineConfig;
  tools: ToolSystemConfig;
  shapes: ShapeSystemConfig;
  performance: VirtualRenderConfig;
  firebase: FirebaseConfig;
  container: DIContainerConfig;

  // New unified configurations
  ui: UIConfig;
  input: InputConfig;
  collaboration: CollaborationConfig;
  export: ExportConfig;
  developer: DeveloperConfig;

  // Performance profiles
  performanceProfiles: {
    current: string;
    profiles: Record<string, PerformanceProfile>;
  };

  // Custom user configurations
  custom: Record<string, any>;
}

// ===================
// CONFIGURATION VALIDATION
// ===================

export interface ConfigurationValidator<T = any> {
  validate(config: Partial<T>): ConfigurationValidationResult;
  getDefaults(): T;
  migrate?(oldConfig: any, version: string): Partial<T>;
}

export interface ConfigurationValidationResult {
  valid: boolean;
  errors: ConfigurationError[];
  warnings: ConfigurationWarning[];
  normalizedConfig?: any;
}

export interface ConfigurationError {
  path: string;
  message: string;
  value: any;
  expected?: string;
}

export interface ConfigurationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

// ===================
// CONFIGURATION MANAGEMENT
// ===================

export interface ConfigurationProvider {
  readonly name: string;
  readonly priority: number;
  readonly canWrite: boolean;

  load(): Promise<Partial<ApplicationConfig>>;
  save?(config: Partial<ApplicationConfig>): Promise<void>;
  watch?(callback: (config: Partial<ApplicationConfig>) => void): () => void;
}

export interface ConfigurationManager {
  // Configuration access
  get<T extends keyof ApplicationConfig>(key: T): ApplicationConfig[T];
  set<T extends keyof ApplicationConfig>(
    key: T,
    value: Partial<ApplicationConfig[T]>
  ): Promise<void>;
  merge(config: Partial<ApplicationConfig>): Promise<void>;
  reset(keys?: (keyof ApplicationConfig)[]): Promise<void>;

  // Provider management
  addProvider(provider: ConfigurationProvider): void;
  removeProvider(name: string): void;
  getProviders(): ConfigurationProvider[];

  // Validation
  validate(config?: Partial<ApplicationConfig>): ConfigurationValidationResult;

  // Events
  subscribe(callback: (config: ApplicationConfig) => void): () => void;

  // Utilities
  export(): string;
  import(config: string): Promise<void>;
  getDefaults(): ApplicationConfig;
}

// ===================
// CONFIGURATION PRESETS
// ===================

export interface ConfigurationPreset {
  name: string;
  description: string;
  category:
    | "performance"
    | "ui"
    | "developer"
    | "accessibility"
    | "collaboration";
  config: Partial<ApplicationConfig>;
  requirements?: {
    minMemory?: number;
    touchSupport?: boolean;
    webGL?: boolean;
  };
}

// ===================
// TYPE UTILITIES
// ===================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ConfigurationPath<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends object
    ? `${K}` | `${K}.${ConfigurationPath<T[K]>}`
    : `${K}`
  : never;

export type ConfigurationValue<
  T,
  P extends string
> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? ConfigurationValue<T[K], Rest>
    : never
  : P extends keyof T
  ? T[P]
  : never;
