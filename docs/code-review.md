# Code review and remediation

This document records the initial audit themes and how the rebuild addressed them.

## Critical findings

- Canvas behavior was split across duplicate renderers, event handlers, shape utilities, and Redux systems. That made selection, resizing, visibility, and persistence disagree with one another.
- Drag and resize calculations reused already-mutated coordinates, producing wobble, drift, and zoom-dependent behavior.
- The application wrote whole boards on pointer movement, creating race conditions and excessive database traffic.
- Undo/redo was not safely scoped to one board and did not model branching history.
- Sharing downloaded the entire user directory in the browser and trusted client-side authorization.
- Firebase access rules and storage structure did not express owner/editor/viewer roles.
- Authentication relied on fragile local state instead of restoring the Firebase session.
- Create React App configuration, dead experimental architectures, duplicate tools, stale reports, and unreachable components remained in the production tree.
- Firebase Hosting workflows provided deployment but no comprehensive quality gate or preview/production ownership model.
- The interface was desktop-fragile and had accessibility, focus, zoom, empty-state, and error-state gaps.

## Remediation delivered

- One renderer and pointer-event pipeline backed by pure geometry and command modules.
- Immutable gesture baselines, conventional world/screen transforms, precise ellipse/rotation hit tests, cursor-anchored zoom, proportional multi-resize, and grid snapping.
- Shape-level database diffs, serialized local writes, collaboration-aware merge behavior, atomic indexes, and ephemeral presence.
- Bounded, board-scoped history with undo, redo, and correct branch invalidation.
- Authenticated Vercel Functions for user lookup/sharing and safe legacy-board migration.
- Versioned board schema, per-user and public indexes, role validation, and least-privilege Firebase rules.
- Firebase session restoration, lazy route-level UI loading, and explicit loading/error/empty states.
- Vite migration and removal of unreachable legacy subsystems and stale implementation notes.
- Responsive, keyboard-operable auth, dashboard, toolbar, layers, canvas, inspector, menus, and dialogs.
- One GitHub Actions pipeline for validation, tests, browser smoke coverage, and trusted Vercel preview/production deployments, with Firebase rules released separately.

## Intentional boundaries

- Kumo is not a complete Figma replacement: vector pen networks, boolean paths, constraints/auto-layout, component variants, comments, offline CRDTs, and durable version snapshots are separate product projects.
- Collaboration resolves edits to different shapes independently. Simultaneous edits to the same shape remain last-writer-wins.
- Undo history is local to the current browser session; durable historical versions require a version-snapshot service.
- Image layers currently use the existing placeholder asset. A production upload workflow should add Storage upload validation, progress, quotas, and image processing.
