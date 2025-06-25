import React from "react";
import { KeyboardShortcutManager } from "../../utils/KeyboardShortcutManager";

interface ShortcutsHelpDialogProps {
  visible: boolean;
  onClose: () => void;
}

const ShortcutsHelpDialog: React.FC<ShortcutsHelpDialogProps> = ({
  visible,
  onClose,
}) => {
  const shortcutManager = new KeyboardShortcutManager();
  const shortcutsByCategory = shortcutManager.getShortcutsByCategory();

  const categoryOrder = [
    "Edit",
    "Selection",
    "Objects",
    "View",
    "Tools",
    "Navigation",
    "File",
    "General",
  ];

  const categoryIcons = {
    Edit: "✂️",
    Selection: "🎯",
    Objects: "📦",
    View: "🔍",
    Tools: "🛠️",
    Navigation: "⬅️",
    File: "📁",
    General: "⚙️",
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 2000,
          animation: "backdropFadeIn 0.2s ease-out",
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "800px",
          maxHeight: "90vh",
          background: "rgba(20, 20, 25, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "16px",
          boxShadow: `
            0 20px 40px rgba(0, 0, 0, 0.6),
            0 8px 16px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          zIndex: 2001,
          overflow: "hidden",
          animation: "dialogSlideIn 0.3s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.5rem 2rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "rgba(255, 255, 255, 0.95)",
                fontFamily:
                  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              ⌨️ Keyboard Shortcuts
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "0.875rem",
                color: "rgba(255, 255, 255, 0.6)",
                fontFamily:
                  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {shortcutManager.isMacOS
                ? "macOS shortcuts"
                : "Windows/Linux shortcuts"}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.7)",
              fontSize: "1.5rem",
              cursor: "pointer",
              padding: "0.25rem",
              borderRadius: "6px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "1.5rem 2rem 2rem",
            maxHeight: "calc(90vh - 120px)",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
              gap: "2rem",
            }}
          >
            {categoryOrder.map((category) => {
              const shortcuts = shortcutsByCategory[category];
              if (!shortcuts || shortcuts.length === 0) return null;

              return (
                <div key={category}>
                  <h3
                    style={{
                      margin: "0 0 1rem 0",
                      fontSize: "1.125rem",
                      fontWeight: "600",
                      color: "rgba(255, 255, 255, 0.9)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontFamily:
                        "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    <span>
                      {categoryIcons[category as keyof typeof categoryIcons]}
                    </span>
                    {category}
                  </h3>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {shortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.75rem",
                          background: "rgba(255, 255, 255, 0.03)",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.875rem",
                            color: "rgba(255, 255, 255, 0.8)",
                            fontFamily:
                              "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                          }}
                        >
                          {shortcut.description}
                        </span>

                        <div
                          style={{
                            padding: "0.25rem 0.5rem",
                            background: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            fontFamily: "SF Mono, Monaco, Consolas, monospace",
                            color: "rgba(255, 255, 255, 0.9)",
                            minWidth: "fit-content",
                            textAlign: "center",
                          }}
                        >
                          {shortcutManager.getShortcutString(
                            shortcut.key,
                            shortcut.modifiers
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Platform note */}
          <div
            style={{
              marginTop: "2rem",
              padding: "1rem",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              color: "rgba(255, 255, 255, 0.7)",
              fontFamily:
                "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            <strong>💡 Pro Tips:</strong>
            <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.5rem" }}>
              <li>
                Hold{" "}
                <kbd
                  style={{
                    padding: "0.125rem 0.25rem",
                    background: "rgba(255, 255, 255, 0.1)",
                    borderRadius: "3px",
                    fontSize: "0.75rem",
                  }}
                >
                  Space
                </kbd>{" "}
                to temporarily switch to hand tool for panning
              </li>
              <li>Use arrow keys to nudge selected objects by 1px</li>
              <li>Hold Shift + arrow keys to move objects by 10px</li>
              <li>Right-click anywhere to open the context menu</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes dialogSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.95) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
};

export default ShortcutsHelpDialog;
