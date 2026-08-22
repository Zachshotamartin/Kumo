# Kumo

Kumo is a collaborative, browser-based design canvas inspired by Figma. It uses React and Vite for the client, Firebase Authentication and Realtime Database for identity and collaboration, and Vercel for the application and authenticated server functions.

## What works

- Rectangle, ellipse, text, and image layers
- Multi-select, marquee selection, grouping, duplication, locking, hiding, and z-ordering
- Move, resize, rotate, align, distribute, snap-to-grid, pan, and cursor-anchored zoom
- Board-scoped undo/redo with correct history branching
- Copy, cut, paste, keyboard shortcuts, context menus, layers, and inspector controls
- Owner/editor/viewer roles, secure email invites, presence, and remote cursors
- Private/public boards, public-board discovery, board copying, and legacy-board migration
- Responsive authentication, dashboard, and editor layouts

## Local development

Requirements: Node.js 22 or later and Yarn 1.x.

```bash
nvm use
yarn install --frozen-lockfile
cp .env.example .env.local
yarn dev
```

Open `http://localhost:5173`. Firebase's existing public web configuration is used as a development fallback, but `.env.local` is recommended. Vercel Functions such as sharing and legacy access migration require the server-only Firebase Admin variables in `.env.local` and should be tested with `yarn vercel dev`.

## Quality commands

```bash
yarn validate:config
yarn lint
yarn typecheck
yarn test
yarn build
yarn playwright install chromium
yarn test:e2e
```

## Editor shortcuts

| Action | Shortcut |
| --- | --- |
| Select / hand / rectangle / ellipse / text / image | `V` / `H` / `R` / `O` / `T` / `I` |
| Undo / redo | `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` |
| Copy / cut / paste / duplicate | `Cmd/Ctrl+C` / `X` / `V` / `D` |
| Group / ungroup | `Cmd/Ctrl+G` / `Cmd/Ctrl+Shift+G` |
| Nudge / large nudge | Arrow / `Shift+Arrow` |
| Pan | Space-drag or middle-drag |
| Zoom / fit / 100% | `Cmd/Ctrl +/-` / `Cmd/Ctrl+0` / `Cmd/Ctrl+1` |
| Resize proportionally / from center | `Shift` / `Alt` while resizing |

## Deployment

The project deliberately remains a React/Vite SPA. A canvas editor is client-heavy and does not benefit enough from a Next.js migration to justify the added framework complexity. Vercel still provides CDN hosting, preview deployments, and serverless functions for the few privileged operations.

GitHub Actions runs validation, linting, type-checking, unit tests, a production build, and browser smoke tests before it deploys. Pull requests receive Vercel previews; pushes to `main` deploy production and publish Firebase rules. The pipeline rejects any Vercel token that is not owned by `zachsm@alumni.stanford.edu`.

See [Deployment](docs/deployment.md), [Architecture](docs/architecture.md), and [Review notes](docs/code-review.md) for the full setup and design decisions.

## Data safety

Do not place Firebase Admin credentials in a `VITE_` variable. Variables with that prefix are bundled into the browser. Database and Storage access is enforced by the checked-in Firebase rules; sharing and legacy migration run through authenticated Vercel Functions using Admin credentials.
