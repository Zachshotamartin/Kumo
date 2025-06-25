/**
 * ID Generator Interface
 *
 * Defines the contract for generating unique identifiers.
 * Allows for different ID generation strategies (UUID, nanoid, etc.)
 */
export interface IIdGenerator {
  /**
   * Generate a unique identifier
   */
  generate(): string;

  /**
   * Validate if an ID is in correct format
   */
  isValid(id: string): boolean;
}
