import {
  IEventBus,
  EventHandler,
} from "../../application/interfaces/IEventBus";

/**
 * In-Memory Event Bus Implementation
 *
 * Simple in-memory event bus for domain events.
 * Suitable for single-instance applications.
 * For distributed systems, use message queue implementations.
 */
export class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  emit<T = any>(eventName: string, data: T): void {
    const eventHandlers = this.handlers.get(eventName);
    if (!eventHandlers) return;

    eventHandlers.forEach(async (handler) => {
      try {
        await handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventName}:`, error);
      }
    });
  }

  subscribe<T = any>(eventName: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
  }

  unsubscribe<T = any>(eventName: string, handler: EventHandler<T>): void {
    const eventHandlers = this.handlers.get(eventName);
    if (eventHandlers) {
      eventHandlers.delete(handler);

      // Clean up empty event sets
      if (eventHandlers.size === 0) {
        this.handlers.delete(eventName);
      }
    }
  }

  unsubscribeAll(eventName: string): void {
    this.handlers.delete(eventName);
  }

  getEventNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  clear(): void {
    this.handlers.clear();
  }

  // Additional debugging methods
  getHandlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.size || 0;
  }

  getTotalHandlers(): number {
    let total = 0;
    this.handlers.forEach((handlers) => (total += handlers.size));
    return total;
  }
}
