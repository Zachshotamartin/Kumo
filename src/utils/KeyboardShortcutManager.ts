import { Shape } from "../classes/shape";

export interface ShortcutModifiers {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface ShortcutDefinition {
  key: string;
  modifiers: ShortcutModifiers;
  description: string;
  category: string;
  action: string;
  preventInInput?: boolean; // Whether to prevent this shortcut when focused on input elements
}

export interface ShortcutContext {
  selectedShapes: string[];
  shapes: Shape[];
  canUndo: boolean;
  canRedo: boolean;
  clipboard: any;
  zoom: number;
  isInputFocused: boolean;
}

export interface ContextMenuItem {
  label: string;
  action: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
}

/**
 * Cross-platform keyboard shortcut manager for Kumo whiteboard
 */
export class KeyboardShortcutManager {
  private shortcuts: Map<string, ShortcutDefinition> = new Map();
  private listeners: Map<string, Array<(context: ShortcutContext) => void>> =
    new Map();
  private isMac: boolean;

  constructor() {
    this.isMac = this.detectMac();
    this.initializeDefaultShortcuts();
  }

  /**
   * Detect if running on macOS
   */
  private detectMac(): boolean {
    return (
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    );
  }

  /**
   * Get the primary modifier key for the current platform
   */
  private getPrimaryModifier(): "meta" | "ctrl" {
    return this.isMac ? "meta" : "ctrl";
  }

  /**
   * Initialize default shortcuts
   */
  private initializeDefaultShortcuts(): void {
    const primaryMod = this.getPrimaryModifier();

    // Basic editing shortcuts
    this.addShortcut({
      key: "z",
      modifiers: { [primaryMod]: true },
      description: "Undo",
      category: "Edit",
      action: "undo",
      preventInInput: false,
    });

    this.addShortcut({
      key: "z",
      modifiers: { [primaryMod]: true, shift: true },
      description: "Redo",
      category: "Edit",
      action: "redo",
      preventInInput: false,
    });

    this.addShortcut({
      key: "y",
      modifiers: { [primaryMod]: true },
      description: "Redo (Windows)",
      category: "Edit",
      action: "redo",
      preventInInput: false,
    });

    this.addShortcut({
      key: "c",
      modifiers: { [primaryMod]: true },
      description: "Copy",
      category: "Edit",
      action: "copy",
    });

    this.addShortcut({
      key: "x",
      modifiers: { [primaryMod]: true },
      description: "Cut",
      category: "Edit",
      action: "cut",
    });

    this.addShortcut({
      key: "v",
      modifiers: { [primaryMod]: true },
      description: "Paste",
      category: "Edit",
      action: "paste",
    });

    this.addShortcut({
      key: "a",
      modifiers: { [primaryMod]: true },
      description: "Select All",
      category: "Selection",
      action: "selectAll",
    });

    this.addShortcut({
      key: "d",
      modifiers: { [primaryMod]: true },
      description: "Duplicate",
      category: "Edit",
      action: "duplicate",
    });

    // Delete shortcuts
    this.addShortcut({
      key: "Delete",
      modifiers: {},
      description: "Delete Selected",
      category: "Edit",
      action: "delete",
    });

    this.addShortcut({
      key: "Backspace",
      modifiers: {},
      description: "Delete Selected",
      category: "Edit",
      action: "delete",
    });

    // Grouping shortcuts
    this.addShortcut({
      key: "g",
      modifiers: { [primaryMod]: true },
      description: "Group",
      category: "Objects",
      action: "group",
    });

    this.addShortcut({
      key: "g",
      modifiers: { [primaryMod]: true, shift: true },
      description: "Ungroup",
      category: "Objects",
      action: "ungroup",
    });

    // File operations
    this.addShortcut({
      key: "s",
      modifiers: { [primaryMod]: true },
      description: "Save",
      category: "File",
      action: "save",
    });

    this.addShortcut({
      key: "n",
      modifiers: { [primaryMod]: true },
      description: "New Board",
      category: "File",
      action: "new",
    });

    this.addShortcut({
      key: "o",
      modifiers: { [primaryMod]: true },
      description: "Open Board",
      category: "File",
      action: "open",
    });

    // View and navigation shortcuts
    this.addShortcut({
      key: "0",
      modifiers: { [primaryMod]: true },
      description: "Fit to Screen",
      category: "View",
      action: "fitToScreen",
    });

    this.addShortcut({
      key: "=",
      modifiers: { [primaryMod]: true },
      description: "Zoom In",
      category: "View",
      action: "zoomIn",
    });

    this.addShortcut({
      key: "-",
      modifiers: { [primaryMod]: true },
      description: "Zoom Out",
      category: "View",
      action: "zoomOut",
    });

    this.addShortcut({
      key: "1",
      modifiers: { [primaryMod]: true },
      description: "Zoom to 100%",
      category: "View",
      action: "zoom100",
    });

    // Tool shortcuts
    this.addShortcut({
      key: "v",
      modifiers: {},
      description: "Pointer Tool",
      category: "Tools",
      action: "toolPointer",
    });

    this.addShortcut({
      key: "r",
      modifiers: {},
      description: "Rectangle Tool",
      category: "Tools",
      action: "toolRectangle",
    });

    this.addShortcut({
      key: "e",
      modifiers: {},
      description: "Ellipse Tool",
      category: "Tools",
      action: "toolEllipse",
    });

    this.addShortcut({
      key: "t",
      modifiers: {},
      description: "Text Tool",
      category: "Tools",
      action: "toolText",
    });

    this.addShortcut({
      key: "i",
      modifiers: {},
      description: "Image Tool",
      category: "Tools",
      action: "toolImage",
    });

    // Navigation shortcuts
    this.addShortcut({
      key: "ArrowUp",
      modifiers: {},
      description: "Move Up",
      category: "Navigation",
      action: "moveUp",
    });

    this.addShortcut({
      key: "ArrowDown",
      modifiers: {},
      description: "Move Down",
      category: "Navigation",
      action: "moveDown",
    });

    this.addShortcut({
      key: "ArrowLeft",
      modifiers: {},
      description: "Move Left",
      category: "Navigation",
      action: "moveLeft",
    });

    this.addShortcut({
      key: "ArrowRight",
      modifiers: {},
      description: "Move Right",
      category: "Navigation",
      action: "moveRight",
    });

    // Large move shortcuts
    this.addShortcut({
      key: "ArrowUp",
      modifiers: { shift: true },
      description: "Move Up (Large)",
      category: "Navigation",
      action: "moveUpLarge",
    });

    this.addShortcut({
      key: "ArrowDown",
      modifiers: { shift: true },
      description: "Move Down (Large)",
      category: "Navigation",
      action: "moveDownLarge",
    });

    this.addShortcut({
      key: "ArrowLeft",
      modifiers: { shift: true },
      description: "Move Left (Large)",
      category: "Navigation",
      action: "moveLeftLarge",
    });

    this.addShortcut({
      key: "ArrowRight",
      modifiers: { shift: true },
      description: "Move Right (Large)",
      category: "Navigation",
      action: "moveRightLarge",
    });

    // Utility shortcuts
    this.addShortcut({
      key: "Escape",
      modifiers: {},
      description: "Clear Selection / Cancel",
      category: "General",
      action: "escape",
    });

    this.addShortcut({
      key: "Tab",
      modifiers: {},
      description: "Cycle Tools",
      category: "Tools",
      action: "cycleTools",
    });

    this.addShortcut({
      key: " ",
      modifiers: {},
      description: "Hand Tool (Hold)",
      category: "Tools",
      action: "handTool",
    });
  }

  /**
   * Add a keyboard shortcut
   */
  addShortcut(shortcut: ShortcutDefinition): void {
    const key = this.getShortcutKey(shortcut.key, shortcut.modifiers);
    this.shortcuts.set(key, shortcut);
  }

  /**
   * Remove a keyboard shortcut
   */
  removeShortcut(key: string, modifiers: ShortcutModifiers): void {
    const shortcutKey = this.getShortcutKey(key, modifiers);
    this.shortcuts.delete(shortcutKey);
  }

  /**
   * Register a listener for a specific action
   */
  on(action: string, callback: (context: ShortcutContext) => void): void {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, []);
    }
    this.listeners.get(action)!.push(callback);
  }

  /**
   * Unregister a listener
   */
  off(action: string, callback: (context: ShortcutContext) => void): void {
    const actionListeners = this.listeners.get(action);
    if (actionListeners) {
      const index = actionListeners.indexOf(callback);
      if (index > -1) {
        actionListeners.splice(index, 1);
      }
    }
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event: KeyboardEvent, context: ShortcutContext): boolean {
    // Check if we're in an input element and should skip certain shortcuts
    if (context.isInputFocused) {
      const target = event.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        // Only allow certain shortcuts in input elements
        const allowedInInput = [
          "undo",
          "redo",
          "copy",
          "cut",
          "paste",
          "selectAll",
        ];
        const shortcutKey = this.getShortcutKey(event.key, {
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
        });

        const shortcut = this.shortcuts.get(shortcutKey);
        if (!shortcut || !allowedInInput.includes(shortcut.action)) {
          return false; // Don't handle this shortcut in input elements
        }
      }
    }

    const shortcutKey = this.getShortcutKey(event.key, {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    });

    const shortcut = this.shortcuts.get(shortcutKey);
    if (shortcut) {
      event.preventDefault();
      this.executeAction(shortcut.action, context);
      return true;
    }

    return false;
  }

  /**
   * Execute an action
   */
  private executeAction(action: string, context: ShortcutContext): void {
    const actionListeners = this.listeners.get(action);
    if (actionListeners) {
      actionListeners.forEach((callback) => callback(context));
    }
  }

  /**
   * Public method to trigger an action directly (for context menus, etc.)
   */
  public triggerAction(action: string, context: ShortcutContext): void {
    this.executeAction(action, context);
  }

  /**
   * Generate a unique key for a shortcut
   */
  private getShortcutKey(key: string, modifiers: ShortcutModifiers): string {
    const parts: string[] = [];

    if (modifiers.ctrl) parts.push("ctrl");
    if (modifiers.shift) parts.push("shift");
    if (modifiers.alt) parts.push("alt");
    if (modifiers.meta) parts.push("meta");

    parts.push(key.toLowerCase());

    return parts.join("+");
  }

  /**
   * Get human-readable shortcut string
   */
  getShortcutString(key: string, modifiers: ShortcutModifiers): string {
    const parts: string[] = [];

    if (this.isMac) {
      if (modifiers.meta) parts.push("⌘");
      if (modifiers.alt) parts.push("⌥");
      if (modifiers.shift) parts.push("⇧");
      if (modifiers.ctrl) parts.push("⌃");
    } else {
      if (modifiers.ctrl) parts.push("Ctrl");
      if (modifiers.alt) parts.push("Alt");
      if (modifiers.shift) parts.push("Shift");
      if (modifiers.meta) parts.push("Win");
    }

    // Format key name
    let keyName = key;
    if (key === " ") keyName = "Space";
    else if (key.startsWith("Arrow")) keyName = key.replace("Arrow", "");
    else if (key.length === 1) keyName = key.toUpperCase();

    parts.push(keyName);

    return parts.join(this.isMac ? "" : "+");
  }

  /**
   * Get all shortcuts grouped by category
   */
  getShortcutsByCategory(): Record<string, ShortcutDefinition[]> {
    const categories: Record<string, ShortcutDefinition[]> = {};

    this.shortcuts.forEach((shortcut) => {
      if (!categories[shortcut.category]) {
        categories[shortcut.category] = [];
      }
      categories[shortcut.category]?.push(shortcut);
    });

    return categories;
  }

  /**
   * Generate context menu items based on current context
   */
  generateContextMenu(context: ShortcutContext): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];

    if (context.selectedShapes.length > 0) {
      // Actions for selected objects
      items.push({
        label: "Cut",
        action: "cut",
        shortcut: this.getShortcutDisplay("cut"),
      });
      items.push({
        label: "Copy",
        action: "copy",
        shortcut: this.getShortcutDisplay("copy"),
      });
      items.push({
        label: "Duplicate",
        action: "duplicate",
        shortcut: this.getShortcutDisplay("duplicate"),
      });
      items.push({ separator: true } as ContextMenuItem);
      items.push({
        label: "Delete",
        action: "delete",
        shortcut: this.getShortcutDisplay("delete"),
      });
      items.push({ separator: true } as ContextMenuItem);

      if (context.selectedShapes.length > 1) {
        items.push({
          label: "Group",
          action: "group",
          shortcut: this.getShortcutDisplay("group"),
        });
      }

      // Check if any selected shapes are groups that can be ungrouped
      const hasGroupableShapes = context.shapes.some(
        (shape) =>
          context.selectedShapes.includes(shape.id) &&
          shape.type === "component"
      );

      if (hasGroupableShapes) {
        items.push({
          label: "Ungroup",
          action: "ungroup",
          shortcut: this.getShortcutDisplay("ungroup"),
        });
      }

      items.push({ separator: true } as ContextMenuItem);
    }

    // Always available actions
    if (context.clipboard) {
      items.push({
        label: "Paste",
        action: "paste",
        shortcut: this.getShortcutDisplay("paste"),
      });
      items.push({ separator: true } as ContextMenuItem);
    }

    items.push({
      label: "Select All",
      action: "selectAll",
      shortcut: this.getShortcutDisplay("selectAll"),
    });

    items.push({ separator: true } as ContextMenuItem);

    // View options
    items.push({
      label: "Zoom In",
      action: "zoomIn",
      shortcut: this.getShortcutDisplay("zoomIn"),
    });
    items.push({
      label: "Zoom Out",
      action: "zoomOut",
      shortcut: this.getShortcutDisplay("zoomOut"),
    });
    items.push({
      label: "Fit to Screen",
      action: "fitToScreen",
      shortcut: this.getShortcutDisplay("fitToScreen"),
    });

    return items;
  }

  /**
   * Get display string for a shortcut action
   */
  private getShortcutDisplay(action: string): string {
    for (const [, shortcut] of this.shortcuts) {
      if (shortcut.action === action) {
        return this.getShortcutString(shortcut.key, shortcut.modifiers);
      }
    }
    return "";
  }

  /**
   * Check if running on Mac
   */
  get isMacOS(): boolean {
    return this.isMac;
  }
}
