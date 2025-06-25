# 🏗️ Clean Architecture Implementation

This directory contains a **Clean Architecture** implementation for the Kumo whiteboard application. This architecture solves the **Separation of Concerns** issue by creating clear boundaries between business logic, UI components, and infrastructure.

## 📁 Directory Structure

```
src/architecture/
├── domain/                    # Business entities and rules
│   └── entities/
│       └── Shape.ts           # Core business entity
├── application/               # Use cases and interfaces
│   ├── useCases/
│   │   └── ShapeManagementUseCase.ts
│   └── interfaces/
│       ├── IShapeRepository.ts
│       ├── IIdGenerator.ts
│       └── IEventBus.ts
├── infrastructure/            # External concerns implementation
│   ├── repositories/
│   │   └── InMemoryShapeRepository.ts
│   ├── services/
│   │   ├── UuidGenerator.ts
│   │   └── InMemoryEventBus.ts
│   └── container/
│       └── DIContainer.ts     # Dependency injection
├── presentation/              # UI layer
│   ├── hooks/
│   │   └── useShapeManagement.ts
│   └── components/
│       └── CleanShapeManager.tsx
└── README.md                  # This file
```

## 🎯 Architecture Principles

### 1. **Dependency Inversion**

- High-level modules don't depend on low-level modules
- Both depend on abstractions (interfaces)
- Infrastructure implements interfaces defined by application layer

### 2. **Single Responsibility**

- Each layer has one reason to change
- Domain: Business rules change
- Application: Use cases change
- Infrastructure: External dependencies change
- Presentation: UI requirements change

### 3. **Separation of Concerns**

- **Domain Layer**: Pure business logic, no dependencies
- **Application Layer**: Orchestrates business operations
- **Infrastructure Layer**: Handles external concerns
- **Presentation Layer**: Pure UI logic only

## 🔍 Layer Breakdown

### 🏛️ Domain Layer (`domain/`)

**Purpose**: Contains core business entities and rules

**Key Files**:

- `entities/Shape.ts` - Core Shape entity with business methods

**Characteristics**:

- ✅ Pure business logic
- ✅ No external dependencies
- ✅ Immutable entities
- ✅ Domain-driven design
- ✅ Self-validating

**Example**:

```typescript
const shape = new Shape({
  id: "shape-1",
  type: "rectangle",
  bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
});

// Business methods
const moved = shape.move(10, 20);
const resized = shape.withBounds(newBounds);
const valid = shape.isValid();
```

### 🔄 Application Layer (`application/`)

**Purpose**: Contains use cases and defines interfaces for external dependencies

**Key Files**:

- `useCases/ShapeManagementUseCase.ts` - Business operations
- `interfaces/` - Contracts for infrastructure

**Characteristics**:

- ✅ Orchestrates business operations
- ✅ Defines infrastructure contracts
- ✅ Contains application business rules
- ✅ Technology-agnostic
- ✅ Easily testable

**Example**:

```typescript
const useCase = new ShapeManagementUseCase(repository, idGenerator, eventBus);

const result = await useCase.createShape({
  type: "rectangle",
  bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
});

if (result.success) {
  console.log("Shape created:", result.shape);
}
```

### 🔧 Infrastructure Layer (`infrastructure/`)

**Purpose**: Implements external concerns and dependency injection

**Key Files**:

- `repositories/InMemoryShapeRepository.ts` - Data persistence
- `services/UuidGenerator.ts` - ID generation
- `services/InMemoryEventBus.ts` - Event handling
- `container/DIContainer.ts` - Dependency injection

**Characteristics**:

- ✅ Implements application interfaces
- ✅ Handles external dependencies
- ✅ Configurable implementations
- ✅ Easy to swap/mock for testing
- ✅ Framework-specific code isolated here

**Example**:

```typescript
const container = DIContainer.getInstance({
  repository: { type: "memory" },
  idGenerator: { type: "uuid" },
  eventBus: { type: "memory" },
});

const { shapeManagement } = container.application;
```

### 🎨 Presentation Layer (`presentation/`)

**Purpose**: Contains React components and UI logic

**Key Files**:

- `hooks/useShapeManagement.ts` - React adapter for use cases
- `components/CleanShapeManager.tsx` - Example clean component

**Characteristics**:

- ✅ Pure UI logic only
- ✅ Business logic delegated to hooks
- ✅ Framework-specific but isolated
- ✅ Easy to test with mocked dependencies
- ✅ Clear separation from business concerns

**Example**:

```typescript
function MyComponent() {
  const { state, actions } = useShapeManagement();

  const handleCreate = async () => {
    const success = await actions.createShape(request);
    if (success) {
      // Handle success
    }
  };

  return <div>{/* Pure UI */}</div>;
}
```

## 🚀 Usage Examples

### Basic Setup

```typescript
import { DIContainer } from "./infrastructure/container/DIContainer";

// Initialize container
const container = DIContainer.getInstance({
  development: {
    enableEventLogging: true,
    enablePerformanceTracking: true,
  },
});

// Access services
const { shapeManagement } = container.application;
```

### React Component

```typescript
import { useShapeManagement } from "./presentation/hooks/useShapeManagement";

function MyShapeComponent() {
  const { state, actions } = useShapeManagement();

  return (
    <div>
      <button onClick={() => actions.createShape(request)}>Create Shape</button>

      {state.shapes.map((shape) => (
        <div key={shape.id}>{shape.type}</div>
      ))}
    </div>
  );
}
```

### Testing

```typescript
import { DIContainer } from "./infrastructure/container/DIContainer";

describe("Shape Management", () => {
  let container: DIContainer;

  beforeEach(() => {
    container = DIContainer.createTestInstance();
  });

  it("should create shape", async () => {
    const { shapeManagement } = container.application;

    const result = await shapeManagement.createShape({
      type: "rectangle",
      bounds: { x1: 0, y1: 0, x2: 100, y2: 100, width: 100, height: 100 },
    });

    expect(result.success).toBe(true);
  });
});
```

## 🔄 Migration from Legacy Code

### Before (Coupled)

```typescript
// components.tsx - 400+ lines with business logic mixed with UI
const Components = () => {
  const dispatch = useDispatch();
  const shapes = useSelector((state) => state.whiteBoard.shapes);

  const handleDrop = (index, event) => {
    // 50+ lines of complex z-index calculation logic
    // Direct Redux manipulation
    // Hard to test business rules
  };

  return <div>{/* Complex UI mixed with business logic */}</div>;
};
```

### After (Clean)

```typescript
// Business logic in use case
class ShapeManagementUseCase {
  async reorderShape(request: ReorderShapeRequest) {
    // Pure business logic, easily testable
    const updatedShapes = this.calculateZIndexReordering(/*...*/);
    await this.shapeRepository.saveAll(updatedShapes);
    return { success: true, shapes: updatedShapes };
  }
}

// Clean UI component
const CleanShapeManager = () => {
  const { state, actions } = useShapeManagement();

  const handleReorder = (shapeId: string, targetIndex: number) => {
    actions.reorderShape(shapeId, targetIndex);
  };

  return <div>{/* Pure UI, easy to test */}</div>;
};
```

## 🧪 Testing Benefits

### Domain Layer Testing

```typescript
describe("Shape Entity", () => {
  it("should move correctly", () => {
    const shape = new Shape({
      /*...*/
    });
    const moved = shape.move(10, 20);

    expect(moved.bounds.x1).toBe(shape.bounds.x1 + 10);
    expect(moved.bounds.y1).toBe(shape.bounds.y1 + 20);
  });
});
```

### Application Layer Testing

```typescript
describe("ShapeManagementUseCase", () => {
  it("should create component from shapes", async () => {
    const mockRepo = new MockShapeRepository();
    const useCase = new ShapeManagementUseCase(mockRepo /*...*/);

    const result = await useCase.createComponent({
      shapeIds: ["shape1", "shape2"],
    });

    expect(result.success).toBe(true);
    expect(result.shape?.type).toBe("component");
  });
});
```

### UI Testing

```typescript
describe("CleanShapeManager", () => {
  it("should render shapes list", () => {
    const mockContainer = createMockContainer([
      { id: "1", type: "rectangle" },
      { id: "2", type: "ellipse" },
    ]);

    render(<CleanShapeManager />, { container: mockContainer });

    expect(screen.getByText("rectangle")).toBeInTheDocument();
    expect(screen.getByText("ellipse")).toBeInTheDocument();
  });
});
```

## 🎁 Benefits Achieved

### ✅ **Separation of Concerns**

- Business logic isolated in domain/application layers
- UI logic pure and focused on presentation
- Infrastructure concerns properly abstracted

### ✅ **Testability**

- Each layer can be tested independently
- Business rules tested without UI framework
- UI components tested with mocked business logic

### ✅ **Maintainability**

- Changes to business rules don't affect UI
- Changes to UI don't affect business logic
- Clear boundaries make code easier to understand

### ✅ **Extensibility**

- Easy to add new shape types via domain entities
- New persistence mechanisms via repository implementations
- New UI frameworks via presentation layer

### ✅ **Flexibility**

- Swap implementations without changing business logic
- Different configurations for development/testing/production
- Easy to adapt to changing requirements

## 🛠️ Configuration Options

```typescript
const container = DIContainer.getInstance({
  // Repository options
  repository: {
    type: "memory" | "firebase" | "localStorage",
    config: {
      /* implementation-specific config */
    },
  },

  // ID generation options
  idGenerator: {
    type: "uuid" | "nanoid" | "custom",
    config: {
      /* generator-specific config */
    },
  },

  // Event bus options
  eventBus: {
    type: "memory" | "redis" | "custom",
    config: {
      /* event bus config */
    },
  },

  // Development options
  development: {
    enableEventLogging: true,
    enablePerformanceTracking: true,
  },
});
```

## 🚀 Next Steps

1. **Extend Domain Model**: Add more entity types and business rules
2. **Add Persistence**: Implement Firebase/LocalStorage repositories
3. **Add Validation**: Implement cross-cutting validation concerns
4. **Add Caching**: Implement caching layer in infrastructure
5. **Add Metrics**: Implement performance monitoring and analytics

## 📚 Resources

- [Clean Architecture by Robert Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [Dependency Injection Patterns](https://martinfowler.com/articles/injection.html)

---

This clean architecture implementation transforms the tightly-coupled legacy code into a maintainable, testable, and extensible system that properly separates business concerns from technical concerns.
