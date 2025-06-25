import React, { useEffect, useRef, useState } from "react";
import { ContextMenuItem } from "../../utils/KeyboardShortcutManager";

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  visible: boolean;
  onItemClick: (action: string) => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  x,
  y,
  visible,
  onItemClick,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [submenuOpen, setSubmenuOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Adjust position to keep menu on screen
    const adjustPosition = () => {
      if (!menuRef.current) return;

      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // Adjust horizontal position
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      setPosition({ x: Math.max(10, adjustedX), y: Math.max(10, adjustedY) });
    };

    adjustPosition();

    // Close menu on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close menu on escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, x, y, onClose]);

  const handleItemClick = (item: ContextMenuItem, index: number) => {
    if (item.disabled) return;

    if (item.submenu) {
      setSubmenuOpen(submenuOpen === index ? null : index);
      return;
    }

    if (item.action) {
      onItemClick(item.action);
      onClose();
    }
  };

  const renderItems = (menuItems: ContextMenuItem[]) => {
    return menuItems.map((item, index) => {
      if (item.separator) {
        return (
          <div
            key={index}
            className="context-menu-separator"
            style={{
              height: "1px",
              background: "rgba(255, 255, 255, 0.1)",
              margin: "0.25rem 0.75rem",
            }}
          />
        );
      }

      return (
        <div
          key={index}
          className={`context-menu-item ${item.disabled ? "disabled" : ""}`}
          style={{
            padding: "0.5rem 0.75rem",
            cursor: item.disabled ? "not-allowed" : "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderRadius: "4px",
            margin: "0.125rem 0.25rem",
            background:
              submenuOpen === index
                ? "rgba(99, 102, 241, 0.15)"
                : "transparent",
            color: item.disabled
              ? "rgba(255, 255, 255, 0.4)"
              : "rgba(255, 255, 255, 0.9)",
            fontSize: "0.875rem",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!item.disabled && !item.submenu) {
              e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)";
            }
          }}
          onMouseLeave={(e) => {
            if (!item.disabled && submenuOpen !== index) {
              e.currentTarget.style.background = "transparent";
            }
          }}
          onClick={() => handleItemClick(item, index)}
        >
          <span>{item.label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {item.shortcut && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "rgba(255, 255, 255, 0.5)",
                  fontFamily: "monospace",
                }}
              >
                {item.shortcut}
              </span>
            )}
            {item.submenu && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "rgba(255, 255, 255, 0.6)",
                }}
              >
                ▶
              </span>
            )}
          </div>
        </div>
      );
    });
  };

  if (!visible) return null;

  return (
    <>
      <div
        ref={menuRef}
        className="context-menu"
        style={{
          position: "fixed",
          left: `${position.x}px`,
          top: `${position.y}px`,
          minWidth: "200px",
          background: "rgba(20, 20, 25, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "8px",
          boxShadow: `
            0 12px 24px rgba(0, 0, 0, 0.4),
            0 4px 8px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          zIndex: 1000,
          padding: "0.25rem 0",
          animation: "contextMenuFadeIn 0.15s ease-out",
        }}
      >
        {renderItems(items)}
      </div>

      {/* Global styles for animations */}
      <style>{`
        @keyframes contextMenuFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .context-menu-item:active {
          transform: scale(0.98);
        }
      `}</style>
    </>
  );
};

export default ContextMenu;
