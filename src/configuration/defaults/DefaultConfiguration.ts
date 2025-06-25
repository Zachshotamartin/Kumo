import {
  ApplicationConfig,
  UIConfig,
  InputConfig,
  CollaborationConfig,
  ExportConfig,
  DeveloperConfig,
  ConfigurationMetadata,
} from "../types";

/**
 * Default Configuration Factory
 *
 * Provides sensible defaults for the entire application configuration.
 * These defaults are designed to work well for most users while being customizable.
 */

/**
 * Get default UI configuration
 */
function getDefaultUIConfig(): UIConfig {
  return {
    theme: {
      mode: "auto",
      primaryColor: "#3b82f6",
      accentColor: "#06b6d4",
    },
    layout: {
      sidebar: {
        enabled: true,
        position: "left",
        width: 300,
        collapsible: true,
      },
      toolbar: {
        enabled: true,
        position: "top",
        compact: false,
      },
      statusBar: {
        enabled: true,
        showCoordinates: true,
        showZoom: true,
        showFPS: false,
      },
    },
    grid: {
      enabled: true,
      size: 20,
      color: "#e5e7eb",
      opacity: 0.3,
      snapToGrid: true,
      snapThreshold: 10,
    },
    rulers: {
      enabled: false,
      units: "px",
      color: "#6b7280",
    },
    animations: {
      enabled: true,
      duration: 200,
      easing: "ease-out",
      reduceMotion: false,
    },
    accessibility: {
      highContrast: false,
      focusOutline: true,
      screenReaderSupport: true,
      keyboardNavigation: true,
    },
  };
}

/**
 * Get default input configuration
 */
function getDefaultInputConfig(): InputConfig {
  return {
    mouse: {
      doubleClickThreshold: 300,
      dragThreshold: 5,
      wheelSensitivity: 1.0,
      rightClickBehavior: "context-menu",
      middleClickBehavior: "pan",
    },
    touch: {
      enabled: true,
      multiTouch: true,
      gestureThreshold: 10,
      tapThreshold: 5,
      longPressThreshold: 500,
    },
    keyboard: {
      enabled: true,
      shortcuts: {
        "select-all": "Ctrl+A",
        copy: "Ctrl+C",
        paste: "Ctrl+V",
        cut: "Ctrl+X",
        undo: "Ctrl+Z",
        redo: "Ctrl+Y",
        delete: "Delete",
        escape: "Escape",
        "zoom-in": "Ctrl+=",
        "zoom-out": "Ctrl+-",
        "zoom-fit": "Ctrl+0",
        "toggle-grid": "Ctrl+G",
        save: "Ctrl+S",
        new: "Ctrl+N",
        open: "Ctrl+O",
      },
      customShortcuts: {},
    },
    selection: {
      allowMultiSelect: true,
      selectOnHover: false,
      hoverDelay: 100,
      selectionColor: "#3b82f6",
      selectionOpacity: 0.2,
    },
  };
}

/**
 * Get default collaboration configuration
 */
function getDefaultCollaborationConfig(): CollaborationConfig {
  return {
    realtime: {
      enabled: true,
      cursorsEnabled: true,
      presenceEnabled: true,
      chatEnabled: false,
      maxUsers: 10,
    },
    cursors: {
      showNames: true,
      showPointer: true,
      fadeDuration: 3000,
      colors: [
        "#ef4444",
        "#f97316",
        "#eab308",
        "#22c55e",
        "#06b6d4",
        "#3b82f6",
        "#8b5cf6",
        "#ec4899",
      ],
    },
    conflicts: {
      strategy: "last-write-wins",
      automaticResolution: true,
      notifyOnConflict: true,
    },
    permissions: {
      allowAnonymous: false,
      defaultRole: "editor",
      requireInvite: true,
    },
  };
}

/**
 * Get default export configuration
 */
function getDefaultExportConfig(): ExportConfig {
  return {
    defaults: {
      format: "png",
      quality: 90,
      dpi: 96,
      includeBackground: true,
      transparentBackground: false,
    },
    formats: {
      png: { enabled: true, maxSize: 4096 },
      svg: { enabled: true, embedFonts: true },
      pdf: { enabled: true, pageSize: "A4" },
      json: { enabled: true, includeMetadata: true },
    },
    cloudStorage: {
      enabled: false,
      provider: "google-drive",
      autoBackup: false,
      backupInterval: 300000, // 5 minutes
    },
  };
}

/**
 * Get default developer configuration
 */
function getDefaultDeveloperConfig(): DeveloperConfig {
  return {
    debug: {
      enabled: process.env.NODE_ENV === "development",
      showFPS: false,
      showMemoryUsage: false,
      logLevel: process.env.NODE_ENV === "development" ? "debug" : "warn",
      enablePerformanceProfiler: false,
    },
    devTools: {
      enabled: process.env.NODE_ENV === "development",
      showStateInspector: false,
      showEventLog: false,
      enableHotReload: process.env.NODE_ENV === "development",
    },
    features: {
      experimentalFeatures: false,
      betaFeatures: false,
      flags: {
        "new-shape-system": true,
        "virtual-rendering": true,
        "clean-architecture": true,
        "simplified-state": true,
        "optimized-firebase": true,
      },
    },
    api: {
      baseUrl: process.env.REACT_APP_API_URL || "/api",
      timeout: 30000,
      retries: 3,
      enableMocking: process.env.NODE_ENV === "development",
    },
  };
}

/**
 * Get default configuration metadata
 */
function getDefaultMetadata(): ConfigurationMetadata {
  return {
    source: "default",
    level: "system",
    timestamp: new Date(),
    version: "1.0.0",
    readOnly: false,
  };
}

/**
 * Get complete default application configuration
 */
export function getDefaultConfiguration(): ApplicationConfig {
  return {
    metadata: getDefaultMetadata(),

    // Core systems - using defaults from existing systems
    stateMachine: {
      doubleClickThreshold: 300,
      dragThreshold: 5,
      hoverDelay: 100,
      allowMultiSelect: true,
      enableSnapToGrid: true,
      enableKeyboardShortcuts: true,
      debounceMs: 16,
      throttleMs: 16,
      maxHistorySize: 50,
      validateTransitions: true,
      strictMode: false,
      enableLogging: process.env.NODE_ENV === "development",
    },

    tools: {
      enablePerformanceMonitoring: false,
      throttleMouseMove: 16,
      debounceResize: 100,
      enableGridSnapping: true,
      gridSize: 20,
      maxHistorySize: 50,
      enableKeyboardShortcuts: true,
    },

    shapes: {
      enableValidation: true,
      enablePerformanceOptimizations: true,
      maxShapes: 10000,
      defaultZoomLevel: 1,
      enableShapeRegistry: true,
      enableCustomProperties: true,
    },

    performance: {
      viewportPadding: 200,
      cullingEnabled: true,
      lodEnabled: true,
      lodThresholds: { simple: 0.3, hidden: 0.1 },
      maxShapesPerFrame: 1000,
      batchSize: 50,
      frameTimeTarget: 16.67,
      enableSpatialIndex: true,
      enableOcclusion: false,
      enableMemoryOptimization: true,
    },

    firebase: {
      firestore: {
        enablePersistence: true,
        cacheSizeBytes: 40 * 1024 * 1024, // 40MB
        enableNetwork: true,
      },
      realtimeDb: {
        enableLogging: false,
        enableOffline: true,
      },
      performance: {
        batchSize: 20,
        throttleMs: 16,
        maxRetries: 3,
        enableCompression: true,
      },
    },

    container: {
      repository: { type: "memory" },
      idGenerator: { type: "uuid" },
      eventBus: { type: "memory" },
      development: {
        enableEventLogging: process.env.NODE_ENV === "development",
        enablePerformanceTracking: false,
      },
    },

    // New unified configurations
    ui: getDefaultUIConfig(),
    input: getDefaultInputConfig(),
    collaboration: getDefaultCollaborationConfig(),
    export: getDefaultExportConfig(),
    developer: getDefaultDeveloperConfig(),

    // Performance profiles
    performanceProfiles: {
      current: "balanced",
      profiles: {
        "high-performance": {
          name: "High Performance",
          description: "Maximum performance for powerful devices",
          operations: [],
          totalTime: 0,
          frameCount: 0,
          avgFPS: 60,
          config: {
            viewportPadding: 100,
            cullingEnabled: true,
            lodEnabled: true,
            lodThresholds: { simple: 0.5, hidden: 0.2 },
            maxShapesPerFrame: 500,
            batchSize: 25,
            frameTimeTarget: 16.67,
            enableSpatialIndex: true,
            enableOcclusion: true,
            enableMemoryOptimization: true,
          },
          targetFPS: 60,
          maxShapes: 5000,
          memoryLimit: 512 * 1024 * 1024, // 512MB
          useCase: "high-end",
        },
        balanced: {
          name: "Balanced",
          description: "Good balance of performance and features",
          operations: [],
          totalTime: 0,
          frameCount: 0,
          avgFPS: 45,
          config: {
            viewportPadding: 200,
            cullingEnabled: true,
            lodEnabled: true,
            lodThresholds: { simple: 0.3, hidden: 0.1 },
            maxShapesPerFrame: 1000,
            batchSize: 50,
            frameTimeTarget: 16.67,
            enableSpatialIndex: true,
            enableOcclusion: false,
            enableMemoryOptimization: true,
          },
          targetFPS: 60,
          maxShapes: 10000,
          memoryLimit: 256 * 1024 * 1024, // 256MB
          useCase: "desktop",
        },
        "battery-saver": {
          name: "Battery Saver",
          description: "Optimized for mobile devices and battery life",
          operations: [],
          totalTime: 0,
          frameCount: 0,
          avgFPS: 30,
          config: {
            viewportPadding: 100,
            cullingEnabled: true,
            lodEnabled: true,
            lodThresholds: { simple: 0.5, hidden: 0.3 },
            maxShapesPerFrame: 200,
            batchSize: 20,
            frameTimeTarget: 33.33, // 30fps
            enableSpatialIndex: false,
            enableOcclusion: false,
            enableMemoryOptimization: true,
          },
          targetFPS: 30,
          maxShapes: 1000,
          memoryLimit: 128 * 1024 * 1024, // 128MB
          useCase: "mobile",
        },
        compatibility: {
          name: "Compatibility",
          description: "Maximum compatibility for older devices",
          operations: [],
          totalTime: 0,
          frameCount: 0,
          avgFPS: 24,
          config: {
            viewportPadding: 50,
            cullingEnabled: false,
            lodEnabled: false,
            lodThresholds: { simple: 1, hidden: 1 },
            maxShapesPerFrame: 100,
            batchSize: 10,
            frameTimeTarget: 50, // 20fps
            enableSpatialIndex: false,
            enableOcclusion: false,
            enableMemoryOptimization: false,
          },
          targetFPS: 20,
          maxShapes: 500,
          memoryLimit: 64 * 1024 * 1024, // 64MB
          useCase: "low-end",
        },
      },
    },

    // Custom user configurations
    custom: {},
  };
}
