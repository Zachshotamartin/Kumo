# Architecture

## Runtime boundaries

```text
React/Vite client
  ├─ Redux: active board, selection, viewport, history, clipboard
  ├─ Editor core: geometry, commands, merge rules, history
  ├─ Firebase Auth: session restoration and identity
  └─ Firebase RTDB: boards, indexes, public catalog, presence

Vercel Functions
  ├─ POST /api/share-board: owner-authorized invite/remove by email
  └─ POST /api/migrate-board: authenticated legacy access migration
```

Privileged functions verify the caller's Firebase ID token before using Firebase Admin. The browser never lists users or receives Admin credentials.

## State ownership

- `whiteBoard`: the active board document and collaborator presence.
- `selected`: selected layer IDs and active tool.
- `editor`: viewport, board-scoped history, clipboard, grid behavior, hover/edit state, and save status.
- `auth`: Firebase identity plus explicit session-initialization state.
- `actions`: the persisted grid-visibility preference.

Only committed editor operations enter history and persistence. Pointer movement uses an immutable interaction baseline and local preview; the final pointer-up produces one command and one history entry. This prevents cumulative drag/resize drift and write storms.

## Board schema

```text
boards/{boardId}
  id, schemaVersion, title, ownerId, visibility
  members/{uid}: owner | editor | viewer
  backgroundColor
  shapesById/{shapeId}
  shapeOrder[]
  revision, lastChangedBy, updatedAt

userBoards/{uid}/{boardId}  # per-user dashboard index
publicBoards/{boardId}      # public discovery index
presence/{boardId}/{uid}    # ephemeral cursor presence
users/{uid}                 # private user profile
```

Board writes are shape-diffed rather than replacing the complete document. Saves from one browser are serialized, while a remote change received during a local gesture is merged by shape ID before commit. Concurrent edits to different shapes survive; same-shape conflicts use last-writer-wins semantics.

## Source layout

- `src/editor`: pure, tested editor behavior.
- `src/components/editor`: canvas and editor UI.
- `src/components/dashboard`: board discovery and management.
- `src/firebase/services`: browser-safe repositories and subscriptions.
- `src/features`: Redux state slices.
- `api`: authenticated Vercel Functions.
- `tests/e2e`: browser smoke tests.

Legacy experimental renderers, duplicate state systems, dead abstraction layers, and Create React App configuration were removed. The current UI has one renderer and one event pipeline.
