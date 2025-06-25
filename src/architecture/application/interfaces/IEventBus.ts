/**
 * Event Bus Interface
 *
 * Defines the contract for domain event publishing and subscription.
 * Enables decoupled communication between application layers.
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>;

export interface IEventBus {
  /**
   * Emit an event with data
   */
  emit<T = any>(eventName: string, data: T): void;

  /**
   * Subscribe to an event
   */
  subscribe<T = any>(eventName: string, handler: EventHandler<T>): void;

  /**
   * Unsubscribe from an event
   */
  unsubscribe<T = any>(eventName: string, handler: EventHandler<T>): void;

  /**
   * Unsubscribe all handlers for an event
   */
  unsubscribeAll(eventName: string): void;

  /**
   * Get all active event names
   */
  getEventNames(): string[];

  /**
   * Clear all event handlers
   */
  clear(): void;
}
