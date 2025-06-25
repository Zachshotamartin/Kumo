import {
  TestDataSchema,
  FieldSchema,
  Constraint,
  TestUser,
  TestWorkspace,
  TestShape,
} from "../types";

/**
 * Data Generator Implementation
 *
 * Generates realistic test data based on schemas and constraints.
 * Provides factory methods for common test entities.
 */
export class DataGenerator {
  private sequenceCounters = new Map<string, number>();

  /**
   * Generate test data based on schema
   */
  generate<T>(schema: TestDataSchema<T>): T {
    const data = {} as T;

    // Generate fields
    for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
      const value = this.generateFieldValue(fieldSchema, fieldName);
      (data as any)[fieldName] = value;
    }

    // Apply constraints
    if (schema.constraints) {
      this.applyConstraints(data, schema.constraints);
    }

    return data;
  }

  /**
   * Create a test user with optional overrides
   */
  createUser(overrides: Partial<TestUser> = {}): TestUser {
    const id = this.getNextSequence("user");

    const baseUser: TestUser = {
      id: `user-${id}`,
      name: `Test User ${id}`,
      email: `user${id}@test.com`,
      role: this.randomChoice(["admin", "editor", "viewer"]),
      preferences: {
        theme: this.randomChoice(["light", "dark", "auto"]),
        notifications: this.randomBoolean(),
        autoSave: true,
      },
      createdAt: this.randomDate(),
    };

    return { ...baseUser, ...overrides };
  }

  /**
   * Create a test workspace with optional overrides
   */
  createWorkspace(overrides: Partial<TestWorkspace> = {}): TestWorkspace {
    const id = this.getNextSequence("workspace");

    const baseWorkspace: TestWorkspace = {
      id: `workspace-${id}`,
      name: `Test Workspace ${id}`,
      description: `This is a test workspace created for testing purposes. Workspace ${id}.`,
      owner: `user-${this.randomInt(1, 10)}`,
      members: this.generateArray(
        () => `user-${this.randomInt(1, 20)}`,
        this.randomInt(1, 5)
      ),
      shapes: this.generateArray(
        () => this.createShape(),
        this.randomInt(0, 10)
      ),
      settings: {
        isPublic: this.randomBoolean(),
        allowComments: this.randomBoolean(),
        autoSave: true,
        gridSize: this.randomChoice([10, 20, 25, 50]),
      },
      createdAt: this.randomDate(),
    };

    return { ...baseWorkspace, ...overrides };
  }

  /**
   * Create a test shape
   */
  createShape(overrides: Partial<TestShape> = {}): TestShape {
    const id = this.getNextSequence("shape");
    const type = this.randomChoice([
      "rectangle",
      "ellipse",
      "text",
      "line",
      "arrow",
    ]);

    const baseShape: TestShape = {
      id: `shape-${id}`,
      type,
      bounds: this.generateShapeBounds(),
      properties: this.generateShapeProperties(type),
      zIndex: id,
    };

    return { ...baseShape, ...overrides };
  }

  /**
   * Generate multiple items using a factory function
   */
  generateArray<T>(factory: () => T, count: number): T[] {
    return Array.from({ length: count }, factory);
  }

  /**
   * Generate a random email address
   */
  generateEmail(domain: string = "test.com"): string {
    const username = this.randomString(
      8,
      "abcdefghijklmnopqrstuvwxyz0123456789"
    );
    return `${username}@${domain}`;
  }

  /**
   * Generate a random name
   */
  generateName(): string {
    const firstNames = [
      "Alex",
      "Blake",
      "Casey",
      "Drew",
      "Ellis",
      "Finley",
      "Gray",
      "Harper",
      "Indigo",
      "Jordan",
      "Kit",
      "Lane",
      "Morgan",
      "Nova",
      "Oakley",
      "Phoenix",
    ];

    const lastNames = [
      "Anderson",
      "Brown",
      "Chen",
      "Davis",
      "Evans",
      "Fisher",
      "Garcia",
      "Harris",
      "Johnson",
      "Kim",
      "Lee",
      "Miller",
      "Nelson",
      "Parker",
      "Quinn",
      "Rivera",
    ];

    return `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
  }

  /**
   * Generate a random hex color
   */
  generateColor(): string {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
    ];

    return this.randomChoice(colors);
  }

  /**
   * Generate a random UUID-like string
   */
  generateId(prefix: string = ""): string {
    const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );

    return prefix ? `${prefix}-${uuid}` : uuid;
  }

  /**
   * Generate field value based on schema
   */
  private generateFieldValue(schema: FieldSchema, fieldName: string): any {
    if (schema.default !== undefined) {
      return schema.default;
    }

    if (schema.enum && schema.enum.length > 0) {
      return this.randomChoice(schema.enum);
    }

    switch (schema.type) {
      case "string":
        return this.generateStringValue(schema, fieldName);
      case "number":
        return this.generateNumberValue(schema);
      case "boolean":
        return this.randomBoolean();
      case "date":
        return this.randomDate();
      case "array":
        const arrayLength = this.randomInt(0, 5);
        return Array.from({ length: arrayLength }, () =>
          this.generateStringValue(
            { type: "string", required: false },
            fieldName
          )
        );
      case "object":
        return {};
      default:
        return null;
    }
  }

  /**
   * Generate string value based on field name and schema
   */
  private generateStringValue(schema: FieldSchema, fieldName: string): string {
    const lowerFieldName = fieldName.toLowerCase();

    // Generate context-aware strings
    if (lowerFieldName.includes("email")) {
      return this.generateEmail();
    } else if (lowerFieldName.includes("name")) {
      return this.generateName();
    } else if (lowerFieldName.includes("color")) {
      return this.generateColor();
    } else if (lowerFieldName.includes("id")) {
      return this.generateId();
    } else if (lowerFieldName.includes("url")) {
      return `https://example.com/${this.randomString(8)}`;
    } else if (lowerFieldName.includes("description")) {
      return `This is a test description for ${fieldName}. Generated automatically for testing purposes.`;
    }

    // Use pattern if provided
    if (schema.pattern) {
      return this.generateFromPattern(schema.pattern);
    }

    // Use min/max length constraints
    const minLength = schema.min || 1;
    const maxLength = schema.max || 20;
    const length = this.randomInt(minLength, maxLength);

    return this.randomString(length);
  }

  /**
   * Generate number value based on schema
   */
  private generateNumberValue(schema: FieldSchema): number {
    const min = schema.min || 0;
    const max = schema.max || 100;

    return this.randomInt(min, max);
  }

  /**
   * Generate string from regex pattern (simplified)
   */
  private generateFromPattern(pattern: RegExp): string {
    // This is a simplified pattern generator
    // In a real implementation, you'd use a proper regex reverse generator
    const patternStr = pattern.toString();

    if (patternStr.includes("\\d")) {
      return this.randomString(8, "0123456789");
    } else if (patternStr.includes("[a-z]")) {
      return this.randomString(8, "abcdefghijklmnopqrstuvwxyz");
    } else if (patternStr.includes("[A-Z]")) {
      return this.randomString(8, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }

    return this.randomString(8);
  }

  /**
   * Apply constraints to generated data
   */
  private applyConstraints<T>(data: T, constraints: Constraint[]): void {
    for (const constraint of constraints) {
      switch (constraint.rule) {
        case "unique":
          // Ensure uniqueness by appending timestamp
          (data as any)[constraint.field] += `-${Date.now()}`;
          break;
        case "depends_on":
          // Simple dependency handling
          if (constraint.value && (data as any)[constraint.value]) {
            (data as any)[constraint.field] = `${
              (data as any)[constraint.value]
            }-dependent`;
          }
          break;
        case "format":
          // Apply specific formatting
          if (constraint.value === "email") {
            (data as any)[constraint.field] = this.generateEmail();
          } else if (constraint.value === "url") {
            (data as any)[
              constraint.field
            ] = `https://example.com/${this.randomString(8)}`;
          }
          break;
      }
    }
  }

  /**
   * Generate shape bounds
   */
  private generateShapeBounds() {
    const x1 = this.randomInt(0, 800);
    const y1 = this.randomInt(0, 600);
    const width = this.randomInt(50, 200);
    const height = this.randomInt(50, 200);

    return {
      x1,
      y1,
      x2: x1 + width,
      y2: y1 + height,
      width,
      height,
    };
  }

  /**
   * Generate shape properties based on type
   */
  private generateShapeProperties(type: string) {
    const baseProperties = {
      fill: this.generateColor(),
      stroke: this.generateColor(),
      strokeWidth: this.randomInt(1, 5),
      opacity: this.randomFloat(0.5, 1.0),
    };

    switch (type) {
      case "text":
        return {
          ...baseProperties,
          text: `Sample text ${this.getNextSequence("text")}`,
          fontSize: this.randomInt(12, 24),
          fontFamily: this.randomChoice([
            "Arial",
            "Helvetica",
            "Georgia",
            "Times",
          ]),
        };
      case "line":
      case "arrow":
        return {
          ...baseProperties,
          startX: this.randomInt(0, 400),
          startY: this.randomInt(0, 300),
          endX: this.randomInt(400, 800),
          endY: this.randomInt(300, 600),
        };
      default:
        return baseProperties;
    }
  }

  /**
   * Get next sequence number for a type
   */
  private getNextSequence(type: string): number {
    const current = this.sequenceCounters.get(type) || 0;
    const next = current + 1;
    this.sequenceCounters.set(type, next);
    return next;
  }

  /**
   * Generate random string
   */
  private randomString(
    length: number,
    chars: string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  ): string {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random float between min and max
   */
  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Generate random boolean
   */
  private randomBoolean(): boolean {
    return Math.random() > 0.5;
  }

  /**
   * Choose random item from array
   */
  private randomChoice<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  /**
   * Generate random date within the last year
   */
  private randomDate(): Date {
    const now = new Date();
    const oneYearAgo = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate()
    );
    const randomTime =
      oneYearAgo.getTime() +
      Math.random() * (now.getTime() - oneYearAgo.getTime());
    return new Date(randomTime);
  }

  /**
   * Reset all sequence counters
   */
  resetSequences(): void {
    this.sequenceCounters.clear();
  }

  /**
   * Create a batch of users
   */
  createUserBatch(
    count: number,
    baseOverrides: Partial<TestUser> = {}
  ): TestUser[] {
    return this.generateArray(() => this.createUser(baseOverrides), count);
  }

  /**
   * Create a batch of workspaces
   */
  createWorkspaceBatch(
    count: number,
    baseOverrides: Partial<TestWorkspace> = {}
  ): TestWorkspace[] {
    return this.generateArray(() => this.createWorkspace(baseOverrides), count);
  }

  /**
   * Create a batch of shapes
   */
  createShapeBatch(
    count: number,
    baseOverrides: Partial<TestShape> = {}
  ): TestShape[] {
    return this.generateArray(() => this.createShape(baseOverrides), count);
  }

  /**
   * Create realistic dataset for testing
   */
  createDataset(
    options: {
      userCount?: number;
      workspaceCount?: number;
      shapesPerWorkspace?: number;
    } = {}
  ): {
    users: TestUser[];
    workspaces: TestWorkspace[];
    shapes: TestShape[];
  } {
    const {
      userCount = 10,
      workspaceCount = 5,
      shapesPerWorkspace = 20,
    } = options;

    // Create users first
    const users = this.createUserBatch(userCount);

    // Create workspaces with real user owners
    const workspaces = this.generateArray(() => {
      const owner = this.randomChoice(users);
      const memberCount = this.randomInt(1, Math.min(5, users.length));
      const members = this.generateArray(
        () => this.randomChoice(users).id,
        memberCount
      );

      return this.createWorkspace({
        owner: owner.id,
        members: [...new Set(members)], // Remove duplicates
      });
    }, workspaceCount);

    // Create shapes for workspaces
    const allShapes: TestShape[] = [];
    workspaces.forEach((workspace) => {
      const shapes = this.createShapeBatch(shapesPerWorkspace);
      workspace.shapes = shapes;
      allShapes.push(...shapes);
    });

    return {
      users,
      workspaces,
      shapes: allShapes,
    };
  }
}
