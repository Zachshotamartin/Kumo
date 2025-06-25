# Selection Priority System

## Overview

This document defines the selection priority rules for the Kumo whiteboard application, determining which elements are selected when multiple objects overlap at the same location.

## Core Principles

### 1. Z-Index Priority

- **Higher z-index always wins** - elements with higher z-index values are prioritized for selection
- Z-index represents the visual stacking order (higher = on top)
- This ensures users can always select the visually topmost element

### 2. Group Exclusivity Priority

- **Group members cannot be individually selected while part of a group**
- When a group is selected, clicking on any group member preserves the group selection
- Only shapes NOT in the current group can be individually selected
- This ensures groups behave as cohesive units and prevents accidental individual selection

### 3. Context-Aware Selection

- Selection behavior changes based on current selection state
- Different rules apply when no selection exists vs when a group is already selected

## Selection Priority Rules

### Scenario 1: No Current Selection

**Rule**: Select the topmost element (highest z-index) at click location

**Implementation**:

1. Find all shapes intersecting with click point
2. Sort by z-index (descending)
3. Select the first (topmost) shape
4. If shape is part of a component, select the entire component

### Scenario 2: Group Currently Selected

**Rule**: Preserve group selection and prevent individual member selection

**Sub-rules**:

1. **Within group bounds**: Any click within the group selection border preserves the group selection (prevents individual selection)
2. **Group member outside bounds**: Clicking on a group member outside the bounds still preserves group selection
3. **Non-group shape**: Only shapes NOT in the current group can be individually selected
4. **Empty canvas**: Clicking on empty canvas outside group bounds clears the selection

### Scenario 3: Individual Shape Currently Selected

**Rule**: Standard topmost-element selection

**Implementation**:

1. Apply Scenario 1 rules
2. If clicked shape is already selected and click is within shape bounds → Start dragging
3. If clicked shape is different → Change selection to new shape

## Implementation Details

### Z-Index Comparison

```typescript
// Compare z-index values, treating undefined as 0
const getZIndex = (shape: Shape): number => shape.zIndex ?? 0;

// Sort shapes by z-index (highest first)
const sortByZIndex = (shapes: Shape[]): Shape[] =>
  shapes.sort((a, b) => getZIndex(b) - getZIndex(a));
```

### Hit Testing Priority

1. **Point-in-shape test**: Check if click point is within shape bounds
2. **Z-index filtering**: Among all hit shapes, find the highest z-index
3. **Component handling**: If hit shape is part of component, check if entire component should be selected

### Group Border Logic

```typescript
// Check if click is within group selection border
const isWithinGroupBorder = (x: number, y: number): boolean => {
  return (
    x >= borderStartX && x <= borderEndX && y >= borderStartY && y <= borderEndY
  );
};
```

## Edge Cases

### 1. Identical Z-Index Values

- **Rule**: When multiple shapes have the same z-index, prefer individual shapes over group members
- **Fallback**: If still tied, use creation order (later created = higher priority)

### 2. Nested Components

- **Rule**: Components are treated as single entities for selection
- **Behavior**: Clicking any child shape selects the entire component
- **Exception**: If a non-component shape overlaps a component with higher z-index, select the individual shape

### 3. Zero-Size Elements

- **Rule**: Elements with zero width or height are not selectable via clicking
- **Reasoning**: Users cannot visually see them to intentionally select them

### 4. Invisible Elements

- **Rule**: Elements with `backgroundColor: "transparent"` and `borderColor: "transparent"` are selectable if they have content
- **Exception**: Pure containers (components with no visible styling) use different hit testing

## User Experience Goals

### 1. Predictability

- Users should be able to predict which element will be selected based on visual appearance
- The topmost visible element should always be selectable

### 2. Accessibility

- Individual elements should never be "trapped" behind group selections
- Users should have a way to select any visible element

### 3. Efficiency

- Common operations (like moving groups) should remain easy
- Selection should not require multiple clicks for obvious targets

## Testing Scenarios

### Test Case 1: Group Member Protection

1. Create a group of shapes
2. Select the group
3. Click on any member shape of the group
4. **Expected**: Group selection is preserved (individual shape is NOT selected)

### Test Case 2: Group Member Selection

1. Create a group of shapes
2. Select the group
3. Click on any member shape of the group
4. **Expected**: Entire group moves (selection unchanged)

### Test Case 3: Empty Group Space

1. Create a group with some spacing between shapes
2. Select the group
3. Click in empty space within the group border
4. **Expected**: Entire group moves

### Test Case 4: Outside Group Border

1. Create a group
2. Select the group
3. Click outside the group border on another shape
4. **Expected**: New shape becomes selected, group deselected

### Test Case 5: Non-Group Shape Selection

1. Create a group of shapes
2. Create an individual shape (not part of group)
3. Select the group
4. Click on the individual shape
5. **Expected**: Individual shape becomes selected, group deselected

## Implementation Priority

### Phase 1: Core Logic (Completed ✅)

- [x] Implement z-index based hit testing
- [x] Add group border detection
- [x] Handle individual-over-group selection

### Phase 2: Edge Cases (Completed ✅)

- [x] Handle identical z-index scenarios
- [x] Implement nested component logic
- [ ] Add zero-size element filtering

### Phase 3: Optimization (Future)

- [ ] Performance optimization for large numbers of shapes
- [ ] Visual feedback for selection priority
- [ ] Advanced hit testing for complex shapes

## Implementation Status

### Files Modified

- `src/utils/ShapeSelectionManager.ts` - Enhanced with selection priority logic
- `src/components/eventHandlers/mouseEventHandler.tsx` - Updated to use priority system
- `SELECTION_PRIORITY.md` - Documentation created

### Key Features Implemented

1. **Z-Index Priority** - Higher z-index shapes are prioritized for individual selection
2. **Group Exclusivity** - Group members cannot be individually selected while part of a group
3. **Context-Aware Selection** - Different behavior based on current selection state
4. **Component Handling** - Proper handling of component vs individual shape selection
5. **Group Protection** - Clicking anywhere within group bounds preserves group selection
6. **Smooth Integration** - Works with existing resize and move operations

## Future Considerations

### 1. Modifier Keys

- **Shift+Click**: Add to selection (multi-select)
- **Cmd/Ctrl+Click**: Toggle selection state
- **Alt+Click**: Select underlying element (pierce through top element)

### 2. Selection Indicators

- Visual indicators showing which element will be selected on hover
- Different cursor styles for different selection contexts

### 3. Advanced Grouping

- Nested group support
- Group locking (prevent individual member selection)
- Group hierarchy visualization
