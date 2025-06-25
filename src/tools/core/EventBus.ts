import { EventBus } from "../types";

/**
 * Simple event bus implementation for tool system communication.
 * Provides type-safe event handling and subscription management.
 */
export class EventBusImpl implements EventBus {
  private listeners = new Map<string, Set<(data: any) => void>>();

  /**
   * Subscribe to an event
   */
  on<T = any>(event: string, handler: (data: T) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const handlers = this.listeners.get(event)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Emit an event to all subscribers
   */
  emit<T = any>(event: string, data: T): void {
    const handlers = this.listeners.get(event);

    if (!handlers || handlers.size === 0) {
      return;
    }

    // Call handlers in a try-catch to prevent one failing handler from affecting others
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for '${event}':`, error);
      }
    });
  }

  /**
   * Remove event listeners
   */
  off(event: string, handler?: (data: any) => void): void {
    if (!handler) {
      // Remove all listeners for this event
      this.listeners.delete(event);
      return;
    }

    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Get the number of listeners for an event
   */
  getListenerCount(event: string): number {
    const handlers = this.listeners.get(event);
    return handlers ? handlers.size : 0;
  }

  /**
   * Get all registered event names
   */
  getEventNames(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get statistics about the event bus
   */
  getStats() {
    const events = Array.from(this.listeners.entries());
    return {
      totalEvents: events.length,
      totalListeners: events.reduce(
        (sum, [_, handlers]) => sum + handlers.size,
        0
      ),
      events: events.map(([event, handlers]) => ({
        event,
        listenerCount: handlers.size,
      })),
    };
  }
}
