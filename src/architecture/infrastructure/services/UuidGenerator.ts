import { IIdGenerator } from "../../application/interfaces/IIdGenerator";

/**
 * UUID-based ID Generator Implementation
 *
 * Generates RFC 4122 compliant UUIDs for shape identifiers.
 * Provides collision-resistant unique identifiers.
 */
export class UuidGenerator implements IIdGenerator {
  generate(): string {
    // Generate RFC 4122 v4 UUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  isValid(id: string): boolean {
    // RFC 4122 UUID v4 pattern
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Regex.test(id);
  }
}
