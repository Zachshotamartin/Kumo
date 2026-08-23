# Architecture

## Runtime boundaries

```text
React/Vite client
  ├─ Redux: local editor UI, active-board metadata, selection, viewport, clipboard
  ├─ Firebase Auth: identity and session restoration only
  ├─ Liveblocks: canvas CRDT, presence, sync status, collaborative undo/redo
  └─ Vercel Functions: the only product-data API

Vercel Functions
  ├─ verify Firebase ID tokens
  ├─ authorize membership in Supabase Postgres
  ├─ issue role-scoped Liveblocks room sessions
  └─ read Firebase RTDB only for one-time legacy-board migration

Supabase
  ├─ Postgres: profiles, boards, membership, assets, snapshots, audit events
  └─ Storage: private board assets
```

Postgres and Liveblocks never own the same field. Postgres owns board metadata and access. Liveblocks owns the canvas document, background, presence, and document history. This avoids dual-write races.

## Kumo's linked-board graph

Kumo is not modeled as a flat collection of Figma-style files. A `board` shape can target another accessible board, and users enter that destination by double-clicking the shape. The target ID and display title travel with the collaborative shape so navigation updates in realtime. The webhook projects those links into `board_links`, making the workspace graph queryable without making Postgres a second canvas authority. Broken or unauthorized targets fail closed at the normal board API boundary.

## Collaboration model

Each board has one Liveblocks room named `board:{boardId}`. The storage root contains a schema version, background color, and a `LiveMap` of shape IDs to `LiveObject` properties. A committed gesture sends one property-level mutation at pointer-up; pointer movement remains a local preview. Concurrent edits to different properties or shapes therefore survive without replacing the full board.

Presence contains only ephemeral cursor and selection data. Owner/editor members receive storage write access. Viewers receive storage read and presence write access. Every Liveblocks authorization request rechecks current Postgres membership.

The storage webhook updates board activity and records at most one durable Postgres snapshot per five-minute window. Liveblocks remains the live document authority; snapshots support recovery and audit workflows.

## Durable schema

- `profiles`: Firebase UID mapped to product profile metadata.
- `boards`: title, owner, visibility, Liveblocks room, and legacy migration identity.
- `board_members`: one owner plus editor/viewer memberships.
- `board_links`: an indexed graph of source board, target board, and linking shape.
- `assets`: private Supabase Storage metadata.
- `document_snapshots`: periodic JSON recovery points with checksums.
- `audit_events`: membership and board lifecycle events.

RLS is enabled and browser roles are explicitly revoked. The Supabase service-role key exists only in Vercel Functions. Firebase RTDB is not imported by browser repositories; its Admin SDK remains temporarily for `POST /api/migrate-board`.

## Source layout

- `src/editor`: pure, tested geometry and editor commands.
- `src/collaboration`: Liveblocks provider, room bridge, and shape-diff logic.
- `src/services`: authenticated browser repositories.
- `src/components/editor`: canvas and editor UI.
- `src/features`: local Redux state slices.
- `api`: authenticated Vercel Functions and webhook.
- `supabase/migrations`: reviewed, idempotent database migrations.
- `tests/e2e`: browser smoke tests.
