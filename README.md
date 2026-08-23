# Kumo

Kumo is a collaborative, browser-based design canvas inspired by Figma. It uses React and Vite for the client, Firebase Authentication for identity, Supabase Postgres for durable product data, Liveblocks for realtime documents and presence, and Vercel for the application and authenticated server functions.

The interactive logo runtime is self-hosted at `public/embed/kumo-logo.js`, built from the sibling `bloub` Kumo Logo Studio project. This keeps authored startup and context animations versioned with the app instead of depending on a separately deployed embed.

## What works

- Rectangle, ellipse, text, and image layers
- Pen/vector layers, boolean groups, masks, gradients, shadows, blur, and blend modes
- Multi-select, marquee selection, grouping, framing, sections, duplication, locking, hiding, and z-ordering
- Move, resize, rotate, align, distribute, snap-to-grid, pan, and cursor-anchored zoom
- Auto layout, wrapping, constraints, hug/fill sizing, rulers, guides, and distance measurement
- Components, nested instances, variants, shared styles, variables, and overrides
- Multi-page documents, command search, inspect/code handoff, and validated SVG/PNG/PDF/Kumo exports
- Interactive prototypes with presentation mode, transitions, board links, and URLs
- Board-scoped undo/redo with correct history branching
- Copy, cut, paste, keyboard shortcuts, context menus, layers, and inspector controls
- Anchored live comments, mentions, replies, reactions, resolution, presence, following, and spotlight
- Named checkpoints, visual version previews, recovery-point restores, and isolated design branches
- Owner/editor/viewer roles, secure email invites, presence, and remote cursors
- Private/public boards, public-board discovery, board copying, and legacy-board migration
- Responsive authentication, dashboard, and editor layouts

## Local development

Requirements: Node.js 22 or 24 and Yarn 1.x. The checked-in `.nvmrc` pins the supported Node 22 runtime used by CI.

```bash
nvm use
yarn install --frozen-lockfile
cp .env.example .env.local
yarn validate:local-env
yarn dev:full
```

Open the exact `http://localhost:<port>` URL printed by Vercel. Do not substitute `127.0.0.1`, because Firebase authorizes hostnames rather than treating every loopback address as equivalent. `yarn dev:full` runs both Vite and the `/api/*` Vercel Functions; it requires a Firebase project ID plus concrete Supabase and Liveblocks server values in the gitignored `.env.local`. It validates those values before starting, so redacted Vercel placeholders cannot become runtime 500s again. Firebase service-account values are needed only for explicit legacy Realtime Database migration, while the Liveblocks webhook secret is needed only when exercising signed webhook callbacks. Vercel does not return Sensitive values through `vercel env pull`, so those secrets must be copied from their owning service when local testing requires them.

Use `yarn dev:remote` when the secrets remain managed only in Vercel. It runs the frontend locally and proxies `/api/*` to the stable authenticated Preview deployment. Use `yarn dev` only for client-only UI work with no API proxy. HTTPS deployments use a same-origin Google redirect through `/__/auth/*`. HTTP localhost uses a full-page Google redirect created through Firebase's Identity Toolkit, with state and nonce validation before the returned Google identity token becomes a Firebase credential; it never falls back to a popup.

The Firebase project's Google OAuth Web Client must include the exact local callback `http://localhost:5175/` under **Google Auth Platform → Clients → Authorized redirect URIs**. Firebase Authentication's separate Authorized domains list must also include `localhost`.

## Quality commands

```bash
yarn validate:config
yarn lint
yarn typecheck
yarn test
yarn test:coverage
yarn build
yarn playwright install chromium
yarn test:e2e
```

## Editor shortcuts

| Action | Shortcut |
| --- | --- |
| Select / hand / frame / rectangle / ellipse / pen / text / image | `V` / `H` / `F` / `R` / `O` / `P` / `T` / `I` |
| Undo / redo | `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` |
| Copy / cut / paste / duplicate | `Cmd/Ctrl+C` / `X` / `V` / `D` |
| Group / ungroup | `Cmd/Ctrl+G` / `Cmd/Ctrl+Shift+G` |
| Nudge / large nudge | Arrow / `Shift+Arrow` |
| Pan | Space-drag or middle-drag |
| Zoom / fit / 100% | `Cmd/Ctrl +/-` / `Cmd/Ctrl+0` / `Cmd/Ctrl+1` |
| Resize proportionally / from center | `Shift` / `Alt` while resizing |
| Search objects and commands | `Cmd/Ctrl+K` or `Cmd/Ctrl+P` |

## Data migrations

Supabase owns board metadata, membership, assets, links, audit events, version snapshots, and design-branch records. Liveblocks owns the current collaborative document, presence, and comment threads. Apply the checked-in migrations in filename order before deploying API code that depends on them. Migrations are idempotent and `document_branches.board_id` intentionally matches the text primary key used by `boards.id`.

## Deployment

The project deliberately remains a React/Vite SPA. A canvas editor is client-heavy and does not benefit enough from a Next.js migration to justify the added framework complexity. Vercel still provides CDN hosting, preview deployments, and serverless functions for the few privileged operations.

GitHub Actions runs validation, linting, type-checking, unit tests, a production build, and browser smoke tests before it deploys. All changes reach the protected `main` branch through pull requests. Pull requests receive Vercel previews; merging a passing pull request deploys production. Vercel's repository-triggered deployments are disabled so GitHub Actions is the only deployment authority. The pipeline rejects any Vercel token that is not owned by `zachsm@alumni.stanford.edu`.

See [Deployment](docs/deployment.md), [Architecture](docs/architecture.md), and [Review notes](docs/code-review.md) for the full setup and design decisions.

## Data safety

Do not place Firebase Admin, Supabase service-role, or Liveblocks secret credentials in a `VITE_` variable. Variables with that prefix are bundled into the browser. Normal product data is available only through authenticated Vercel Functions. Firebase Realtime Database is retained temporarily as a read-only source for on-demand migration of legacy boards.
