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
- Server-derived, cycle-safe linked-board sharing with transactional multi-board membership changes and private-destination redaction.
- Versioned board schema, per-user and public indexes, role validation, and least-privilege Firebase rules.
- Firebase session restoration, lazy route-level UI loading, and explicit loading/error/empty states.
- Vite migration and removal of unreachable legacy subsystems and stale implementation notes.
- Responsive, keyboard-operable auth, dashboard, toolbar, layers, canvas, inspector, menus, and dialogs.
- Movable layer-linked comments, ephemeral cursor chat, same-object collaboration claims, and deterministic crossed-claim resolution.
- Auto-width and wrapping auto-height text modes that grow their canvas bounds rather than scrolling inside a fixed textarea.
- One GitHub Actions pipeline for validation, tests, browser smoke coverage, and trusted Vercel preview/production deployments, with Firebase rules released separately.

## Intentional boundaries

- Kumo is not a complete Figma replacement: advanced vector-network editing, variable-font controls, full component-property parity, plugin APIs, dev-mode measurement parity, and offline-first editing remain separate product projects.
- Active manipulation claims are intentionally soft presence locks. They resolve normal and crossed online claims deterministically; a true network partition falls back to Liveblocks property-level conflict resolution when clients reconnect.
- Cursor chat is intentionally ephemeral. Decisions that need history belong in a comment thread.
- Connected-board sharing is bounded to eight link levels and 100 boards. Kumo refuses a partial set when that bound is exceeded so access cannot silently diverge.
