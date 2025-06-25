import React, { useState, useCallback } from "react";
import {
  useConfiguration,
  useConfigurationSection,
  usePerformanceProfile,
  useTheme,
} from "../hooks/useConfiguration";

/**
 * Configuration Panel Component
 *
 * Comprehensive settings panel demonstrating the configuration system.
 * Shows how to properly use configuration hooks for different scenarios.
 */

interface TabProps {
  id: string;
  label: string;
  active: boolean;
  onClick: (id: string) => void;
}

const Tab: React.FC<TabProps> = ({ id, label, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
    }`}
  >
    {label}
  </button>
);

const ConfigurationPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState("general");
  const [importText, setImportText] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);

  // Main configuration hook
  const { state, actions } = useConfiguration();

  // Specialized hooks
  const { config: uiConfig, update: updateUI } = useConfigurationSection("ui");
  const { config: inputConfig, update: updateInput } =
    useConfigurationSection("input");
  const { config: collabConfig, update: updateCollab } =
    useConfigurationSection("collaboration");
  const { config: devConfig, update: updateDev } =
    useConfigurationSection("developer");
  const {
    current: currentProfile,
    profile,
    availableProfiles,
    setProfile,
  } = usePerformanceProfile();
  const { mode: themeMode, primaryColor, setTheme, setColors } = useTheme();

  // ===================
  // EVENT HANDLERS
  // ===================

  const handleExport = useCallback(() => {
    try {
      const config = actions.exportConfig();
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
    } catch (error) {
      alert(
        `Export failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, [actions]);

  const handleImport = useCallback(async () => {
    try {
      await actions.importConfig(importText);
      setShowImportModal(false);
      setImportText("");
      alert("Configuration imported successfully!");
    } catch (error) {
      alert(
        `Import failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, [actions, importText]);

  const handleReset = useCallback(async () => {
    if (
      window.confirm("Are you sure you want to reset all settings to defaults?")
    ) {
      try {
        await actions.reset();
        alert("Configuration reset to defaults");
      } catch (error) {
        alert(
          `Reset failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  }, [actions]);

  const handleValidate = useCallback(() => {
    const result = actions.validate();

    let message = `Configuration is ${result.valid ? "valid" : "invalid"}`;
    if (result.errors.length > 0) {
      message += `\n\nErrors:\n${result.errors.join("\n")}`;
    }
    if (result.warnings.length > 0) {
      message += `\n\nWarnings:\n${result.warnings.join("\n")}`;
    }

    alert(message);
  }, [actions]);

  // ===================
  // RENDER SECTIONS
  // ===================

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Theme Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Theme Mode</label>
            <select
              value={themeMode}
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Primary Color
            </label>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setColors(e.target.value)}
              className="w-20 h-10 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Grid Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="gridEnabled"
              checked={uiConfig.grid.enabled}
              onChange={(e) =>
                updateUI({
                  grid: { ...uiConfig.grid, enabled: e.target.checked },
                })
              }
              className="mr-2"
            />
            <label htmlFor="gridEnabled" className="text-sm">
              Enable Grid
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Grid Size: {uiConfig.grid.size}px
            </label>
            <input
              type="range"
              min="5"
              max="100"
              value={uiConfig.grid.size}
              onChange={(e) =>
                updateUI({
                  grid: { ...uiConfig.grid, size: parseInt(e.target.value) },
                })
              }
              className="w-full"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="snapToGrid"
              checked={uiConfig.grid.snapToGrid}
              onChange={(e) =>
                updateUI({
                  grid: { ...uiConfig.grid, snapToGrid: e.target.checked },
                })
              }
              className="mr-2"
            />
            <label htmlFor="snapToGrid" className="text-sm">
              Snap to Grid
            </label>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Layout Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="sidebarEnabled"
              checked={uiConfig.layout.sidebar.enabled}
              onChange={(e) =>
                updateUI({
                  layout: {
                    ...uiConfig.layout,
                    sidebar: {
                      ...uiConfig.layout.sidebar,
                      enabled: e.target.checked,
                    },
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="sidebarEnabled" className="text-sm">
              Show Sidebar
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="statusBarEnabled"
              checked={uiConfig.layout.statusBar.enabled}
              onChange={(e) =>
                updateUI({
                  layout: {
                    ...uiConfig.layout,
                    statusBar: {
                      ...uiConfig.layout.statusBar,
                      enabled: e.target.checked,
                    },
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="statusBarEnabled" className="text-sm">
              Show Status Bar
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPerformanceTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Performance Profile</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Current Profile
            </label>
            <select
              value={currentProfile}
              onChange={(e) => setProfile(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              {availableProfiles.map((profileName) => (
                <option key={profileName} value={profileName}>
                  {profileName.charAt(0).toUpperCase() +
                    profileName.slice(1).replace("-", " ")}
                </option>
              ))}
            </select>
          </div>

          {profile && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-medium mb-2">{profile.name}</h4>
              <p className="text-sm text-gray-600 mb-3">
                {profile.description}
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Target FPS:</span>{" "}
                  {profile.targetFPS}
                </div>
                <div>
                  <span className="font-medium">Max Shapes:</span>{" "}
                  {profile.maxShapes}
                </div>
                <div>
                  <span className="font-medium">Memory Limit:</span>{" "}
                  {Math.round(profile.memoryLimit / 1024 / 1024)}MB
                </div>
                <div>
                  <span className="font-medium">Use Case:</span>{" "}
                  {profile.useCase}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Advanced Performance Settings
        </h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="cullingEnabled"
              checked={state.config.performance.cullingEnabled}
              onChange={(e) =>
                actions.set("performance", {
                  cullingEnabled: e.target.checked,
                })
              }
              className="mr-2"
            />
            <label htmlFor="cullingEnabled" className="text-sm">
              Enable Viewport Culling
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="lodEnabled"
              checked={state.config.performance.lodEnabled}
              onChange={(e) =>
                actions.set("performance", {
                  lodEnabled: e.target.checked,
                })
              }
              className="mr-2"
            />
            <label htmlFor="lodEnabled" className="text-sm">
              Enable Level of Detail
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Max Shapes Per Frame: {state.config.performance.maxShapesPerFrame}
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              value={state.config.performance.maxShapesPerFrame}
              onChange={(e) =>
                actions.set("performance", {
                  maxShapesPerFrame: parseInt(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderInputTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Mouse Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Double Click Threshold: {inputConfig.mouse.doubleClickThreshold}ms
            </label>
            <input
              type="range"
              min="100"
              max="1000"
              value={inputConfig.mouse.doubleClickThreshold}
              onChange={(e) =>
                updateInput({
                  mouse: {
                    ...inputConfig.mouse,
                    doubleClickThreshold: parseInt(e.target.value),
                  },
                })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Drag Threshold: {inputConfig.mouse.dragThreshold}px
            </label>
            <input
              type="range"
              min="1"
              max="20"
              value={inputConfig.mouse.dragThreshold}
              onChange={(e) =>
                updateInput({
                  mouse: {
                    ...inputConfig.mouse,
                    dragThreshold: parseInt(e.target.value),
                  },
                })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Right Click Behavior
            </label>
            <select
              value={inputConfig.mouse.rightClickBehavior}
              onChange={(e) =>
                updateInput({
                  mouse: {
                    ...inputConfig.mouse,
                    rightClickBehavior: e.target.value as any,
                  },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="context-menu">Context Menu</option>
              <option value="pan">Pan</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Selection Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="allowMultiSelect"
              checked={inputConfig.selection.allowMultiSelect}
              onChange={(e) =>
                updateInput({
                  selection: {
                    ...inputConfig.selection,
                    allowMultiSelect: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="allowMultiSelect" className="text-sm">
              Allow Multi-Selection
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="selectOnHover"
              checked={inputConfig.selection.selectOnHover}
              onChange={(e) =>
                updateInput({
                  selection: {
                    ...inputConfig.selection,
                    selectOnHover: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="selectOnHover" className="text-sm">
              Select on Hover
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCollaborationTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Real-time Features</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="realtimeEnabled"
              checked={collabConfig.realtime.enabled}
              onChange={(e) =>
                updateCollab({
                  realtime: {
                    ...collabConfig.realtime,
                    enabled: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="realtimeEnabled" className="text-sm">
              Enable Real-time Collaboration
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="cursorsEnabled"
              checked={collabConfig.realtime.cursorsEnabled}
              onChange={(e) =>
                updateCollab({
                  realtime: {
                    ...collabConfig.realtime,
                    cursorsEnabled: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="cursorsEnabled" className="text-sm">
              Show User Cursors
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Max Users: {collabConfig.realtime.maxUsers}
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={collabConfig.realtime.maxUsers}
              onChange={(e) =>
                updateCollab({
                  realtime: {
                    ...collabConfig.realtime,
                    maxUsers: parseInt(e.target.value),
                  },
                })
              }
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Cursor Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="showNames"
              checked={collabConfig.cursors.showNames}
              onChange={(e) =>
                updateCollab({
                  cursors: {
                    ...collabConfig.cursors,
                    showNames: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="showNames" className="text-sm">
              Show User Names
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Fade Duration: {collabConfig.cursors.fadeDuration}ms
            </label>
            <input
              type="range"
              min="1000"
              max="10000"
              value={collabConfig.cursors.fadeDuration}
              onChange={(e) =>
                updateCollab({
                  cursors: {
                    ...collabConfig.cursors,
                    fadeDuration: parseInt(e.target.value),
                  },
                })
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderDeveloperTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Debug Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="debugEnabled"
              checked={devConfig.debug.enabled}
              onChange={(e) =>
                updateDev({
                  debug: {
                    ...devConfig.debug,
                    enabled: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="debugEnabled" className="text-sm">
              Enable Debug Mode
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="showFPS"
              checked={devConfig.debug.showFPS}
              onChange={(e) =>
                updateDev({
                  debug: {
                    ...devConfig.debug,
                    showFPS: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="showFPS" className="text-sm">
              Show FPS Counter
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Log Level</label>
            <select
              value={devConfig.debug.logLevel}
              onChange={(e) =>
                updateDev({
                  debug: {
                    ...devConfig.debug,
                    logLevel: e.target.value as any,
                  },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
              <option value="trace">Trace</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Feature Flags</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="experimentalFeatures"
              checked={devConfig.features.experimentalFeatures}
              onChange={(e) =>
                updateDev({
                  features: {
                    ...devConfig.features,
                    experimentalFeatures: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="experimentalFeatures" className="text-sm">
              Enable Experimental Features
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="betaFeatures"
              checked={devConfig.features.betaFeatures}
              onChange={(e) =>
                updateDev({
                  features: {
                    ...devConfig.features,
                    betaFeatures: e.target.checked,
                  },
                })
              }
              className="mr-2"
            />
            <label htmlFor="betaFeatures" className="text-sm">
              Enable Beta Features
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderActionsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Configuration Management</h3>
        <div className="space-y-4">
          <button
            onClick={handleExport}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Export Configuration
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Import Configuration
          </button>

          <button
            onClick={handleValidate}
            className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
          >
            Validate Configuration
          </button>

          <button
            onClick={handleReset}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Quick Presets</h3>
        <div className="grid grid-cols-2 gap-4">
          {actions.getAvailablePresets().map((preset) => (
            <button
              key={preset}
              onClick={() => actions.applyPreset(preset)}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              {preset.charAt(0).toUpperCase() +
                preset.slice(1).replace("-", " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        <div className="bg-gray-50 p-4 rounded-md text-sm space-y-2">
          <div>
            <strong>Loading:</strong> {state.loading ? "Yes" : "No"}
          </div>
          <div>
            <strong>Initialized:</strong> {state.isInitialized ? "Yes" : "No"}
          </div>
          <div>
            <strong>Providers:</strong> {actions.getProviders().join(", ")}
          </div>
          <div>
            <strong>Config Valid:</strong>{" "}
            {actions.validate().valid ? "Yes" : "No"}
          </div>
          {state.error && (
            <div className="text-red-600">
              <strong>Error:</strong> {state.error}
              <button
                onClick={actions.clearError}
                className="ml-2 text-blue-600 underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ===================
  // MAIN RENDER
  // ===================

  const tabs = [
    { id: "general", label: "General", render: renderGeneralTab },
    { id: "performance", label: "Performance", render: renderPerformanceTab },
    { id: "input", label: "Input", render: renderInputTab },
    {
      id: "collaboration",
      label: "Collaboration",
      render: renderCollaborationTab,
    },
    { id: "developer", label: "Developer", render: renderDeveloperTab },
    { id: "actions", label: "Actions", render: renderActionsTab },
  ];

  const activeTabData = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Configuration Panel
        </h1>
        <p className="text-gray-600">
          Customize your Kumo whiteboard experience with comprehensive
          configuration options.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 border-b pb-4">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            id={tab.id}
            label={tab.label}
            active={activeTab === tab.id}
            onClick={setActiveTab}
          />
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-96">{activeTabData && activeTabData.render()}</div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Import Configuration</h3>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste your configuration JSON here..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Import
              </button>
              <button
                onClick={() => setShowImportModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationPanel;
