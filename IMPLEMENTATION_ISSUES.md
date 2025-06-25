# Kumo Implementation Issues - Complete Fix List

## Overview

This document outlines 30+ implementation issues identified in the Kumo whiteboard application, organized by priority and category. Each issue includes location, description, impact, and planned fix approach.

## Priority Classification

- **P0 (Critical)**: Core functionality broken, major UX issues
- **P1 (High)**: Important features not working correctly
- **P2 (Medium)**: Minor functionality issues, edge cases
- **P3 (Low)**: Code quality, performance optimizations

---

## P0 - CRITICAL ISSUES (Fix First)

### 1. Shape Reversal When Dragging Past Corners ✅ COMPLETED

**Location**: `src/classes/shape.ts` (lines 168-277)
**Issue**: Resize function doesn't handle corner dragging past opposite corner
**Impact**: Shapes don't reverse properly when resizing
**Fix**: ✅ Implemented coordinate swapping logic with Math.round() for precision

### 2. Multiple Event System Conflicts ⚠️ IN PROGRESS

**Location**: `mouseEventHandler.tsx` vs `ModularEventHandler.tsx`
**Issue**: Two parallel event handling systems causing conflicts
**Impact**: Inconsistent behavior, hard to maintain
**Fix**: Migrate fully to modular system, remove old handler

### 3. Z-Index Component Calculation Problems ✅ COMPLETED

**Location**: `src/classes/shape.ts` (lines 301-376)
**Issue**: Complex z-index recalculation creates incorrect layering
**Impact**: Shapes appear in wrong order visually
**Fix**: ✅ Simplified algorithm using highest z-index from selected shapes

### 4. Inconsistent Shape Selection Logic ✅ COMPLETED

**Location**: `src/components/eventHandlers/mouseEventHandler.tsx` (lines 179-299)
**Issue**: Overlapping conditions in shape selection
**Impact**: Unpredictable selection behavior
**Fix**: ✅ Created centralized ShapeSelectionManager with clear state machine

### 5. Missing Error Boundaries ✅ COMPLETED

**Location**: Throughout application
**Issue**: No error boundaries around shape rendering
**Impact**: Single malformed shape crashes entire canvas
**Fix**: ✅ Added ErrorBoundary components with fallback UI

---

## P1 - HIGH PRIORITY ISSUES

### 6. Rounded Width Shape Drift ✅ COMPLETED

**Location**: `src/classes/shape.ts` (lines 180-183)
**Issue**: Fractional pixels cause shape drift during resize
**Impact**: Shapes gradually move apart over time
**Fix**: ✅ Fixed with Math.round() implementation in resize function

### 7. Resize Handle Detection Edge Cases ✅ COMPLETED

**Location**: `src/components/eventHandlers/mouseEventHandler.tsx` (lines 217-267)
**Issue**: Hardcoded 10px zones don't scale with zoom
**Impact**: Resize handles too small/large at different zoom levels
**Fix**: ✅ Created ResizeHandleDetection utility with proper zoom scaling

### 8. No Component Ungrouping Functionality ✅ COMPLETED

**Location**: Various component-related files
**Issue**: Can create components but not ungroup them
**Impact**: Users can't undo component creation
**Fix**: ✅ Added ungroupComponent function with proper z-index restoration

### 9. Double-Click Text Editing Integration

**Location**: Multiple files - partially implemented
**Issue**: Text editing not fully integrated
**Impact**: Users can't easily edit text shapes
**Fix**: Complete text editing state machine integration

### 10. Grid Snapping Distance Calculation ✅ COMPLETED

**Location**: `src/effects/intersections.tsx` (lines 24-85)
**Issue**: Exact coordinate matching instead of tolerance
**Impact**: Grid snapping rarely works in practice
**Fix**: ✅ Created comprehensive GridSnapping system with tolerance and multi-type snapping

---

## P2 - MEDIUM PRIORITY ISSUES

### 11. Component Z-Index Display Inconsistency

**Location**: `src/components/renderComponents/renderComponents.tsx` (lines 57-62)
**Issue**: Component z-index uses max child instead of proper calculation
**Impact**: Visual layering problems with nested components
**Fix**: Use component's own z-index instead of child maximum

### 12. Grid Snapping Performance Issues

**Location**: `src/effects/intersections.tsx`
**Issue**: Intersection calculation runs on every border change
**Impact**: Performance degradation with many shapes
**Fix**: Debounce intersection calculations, optimize algorithm

### 13. Text Area Focus Management

**Location**: `src/components/renderComponents/renderText.tsx` (lines 188-212)
**Issue**: Blur event prevention conflicts with editing
**Impact**: Difficult to exit text editing mode
**Fix**: Implement proper focus management state machine

### 14. Inconsistent Coordinate Normalization

**Location**: Multiple render components
**Issue**: Some use Math.min(x1,x2), others assume x1 < x2
**Impact**: Positioning inconsistencies
**Fix**: Standardize coordinate normalization across all components

### 15. Shape Position Drift on Zoom

**Location**: Various render components
**Issue**: Floating-point precision errors during zoom
**Impact**: Shapes drift slightly when zooming
**Fix**: Implement fixed-point arithmetic for position calculations

### 16. Component Selection State Inconsistency

**Location**: `src/components/renderComponents/renderComponents.tsx`
**Issue**: Component shapes have conflicting pointer events
**Impact**: Hover and selection logic conflicts
**Fix**: Clarify component interaction model

### 17. Race Conditions in Shape Updates

**Location**: `src/components/eventHandlers/mouseEventHandler.tsx` (lines 443-511)
**Issue**: Rapid mouse movements processed out of order
**Impact**: Shape updates can be inconsistent
**Fix**: Implement proper update queuing and batching

### 18. Context Menu State Management

**Location**: `src/components/eventHandlers/mouseEventHandler.tsx` (lines 1001-1048)
**Issue**: Context menu logic embedded in mouse handler
**Impact**: Hard to maintain, violates separation of concerns
**Fix**: Extract context menu to separate service

### 19. Inconsistent Grid Snapping Threshold

**Location**: Various files
**Issue**: Different threshold values in different places
**Impact**: Inconsistent snapping behavior
**Fix**: Centralize grid snapping configuration

### 20. Runtime Shape Validation Gaps

**Location**: `src/shapes/core/ShapeSystem.ts` (lines 164-191)
**Issue**: Shape validation can be globally disabled
**Impact**: Invalid shapes can crash rendering
**Fix**: Always validate critical properties, make validation granular

---

## P3 - LOW PRIORITY ISSUES

### 21. Inefficient Re-rendering

**Location**: `src/components/renderComponents/UniversalShapeRenderer.tsx` (lines 184-236)
**Issue**: Style recalculation on every render
**Impact**: Performance degradation
**Fix**: Memoize style calculations based on relevant properties

### 22. Missing Shape Validation in Creation

**Location**: `src/tools/handlers/ShapeCreationToolHandler.ts` (lines 217-225)
**Issue**: Only checks minimum size
**Impact**: Other invalid properties not caught
**Fix**: Implement comprehensive shape validation

### 23. Viewport Coordinate Calculation Edge Cases

**Location**: `src/performance/core/VirtualRenderer.ts` (lines 394-423)
**Issue**: Doesn't handle negative dimensions properly
**Impact**: Edge case rendering problems
**Fix**: Add proper bounds checking and normalization

### 24. Memory Leaks in Event Listeners

**Location**: `src/components/eventHandlers/keyboardEventHandler.tsx`
**Issue**: Cleanup dependencies might miss variables
**Impact**: Potential memory leaks
**Fix**: Review and fix useEffect dependencies

### 25. Nested Component Creation Error Handling

**Location**: `src/components/eventHandlers/mouseEventHandler.tsx` (lines 1014-1021)
**Issue**: Alert-based error instead of UI feedback
**Impact**: Poor user experience
**Fix**: Implement proper error UI with toast notifications

### 26. Shape Creation State Persistence

**Location**: `src/tools/handlers/ShapeCreationToolHandler.ts`
**Issue**: Partially created shapes persist on tool switch
**Impact**: Orphaned shapes in invalid state
**Fix**: Implement proper cleanup on tool change

### 27. No Keyboard-Only Shape Manipulation

**Location**: Throughout application
**Issue**: All manipulation requires mouse
**Impact**: Accessibility issues
**Fix**: Add keyboard shortcuts for shape operations

### 28. Missing Visual Feedback for Invalid Operations

**Location**: Various locations
**Issue**: Failed operations show alerts
**Impact**: Poor user experience
**Fix**: Implement consistent error feedback system

### 29. Pen Tool Not Implemented

**Location**: Type definitions exist but no implementation
**Issue**: Feature gap despite type support
**Impact**: Missing functionality
**Fix**: Implement pen/brush tool with stroke rendering

### 30. Incomplete Text Editing State Machine

**Location**: `src/shapes/plugins/TextShapePlugin.tsx` (lines 180-220)
**Issue**: Text editing not integrated with Redux
**Impact**: State inconsistencies
**Fix**: Complete Redux integration for text editing

---

## Fix Implementation Plan

### Phase 1: Critical Fixes (P0)

1. Fix shape reversal logic
2. Migrate to single event system
3. Fix z-index calculations
4. Refactor selection logic
5. Add error boundaries

### Phase 2: High Priority (P1)

6. Fix shape drift issues
7. Improve resize handles
8. Implement component ungrouping
9. Complete text editing
10. Fix grid snapping

### Phase 3: Medium Priority (P2)

11-20. Address rendering inconsistencies and performance issues

### Phase 4: Low Priority (P3)

21-30. Code quality improvements and feature completions

---

## Testing Strategy

- Unit tests for each fixed function
- Integration tests for event handling
- Visual regression tests for rendering
- Performance benchmarks for optimization

## Success Criteria

- All P0 issues resolved and tested
- P1 issues resolved with regression tests
- P2 issues addressed where feasible
- P3 issues documented for future releases

---

_Last Updated: $(date)_
_Total Issues: 30_
_Estimated Fix Time: 3-4 weeks_
