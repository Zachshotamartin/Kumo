# Deployment

Kumo is deployed as a Vite SPA plus Vercel Functions. Firebase provides authentication, Supabase stores durable product data, and Liveblocks provides realtime canvas collaboration. Firebase Hosting is no longer used.

## 1. Create the Vercel project

1. Sign in to Vercel as `zachsm@alumni.stanford.edu`.
2. From this repository, run `yarn vercel login` and confirm that exact account.
3. Run `yarn vercel link` and create or select the Kumo project in that account's scope.
4. Keep Framework Preset `Vite`, Build Command `yarn build`, and Output Directory `dist`.
5. Copy `orgId` and `projectId` from the generated `.vercel/project.json`. The `.vercel` directory is intentionally ignored.
6. Connect the project to `https://github.com/Zachshotamartin/Kumo` for repository metadata. Keep Vercel Git deployments disabled; GitHub Actions owns preview and production releases.

The SPA rewrite in `vercel.json` preserves deep links. Filesystem routes, including `/api/*` functions, take precedence over that rewrite.

## 2. Configure Vercel environments

Store the server-only `FIREBASE_ADMIN_*`, `SUPABASE_*`, and `LIVEBLOCKS_*` variables from `.env.example` directly in Vercel's Production and Preview environments. They are runtime configuration for authenticated Vercel Functions and are not part of the application-deployment credentials. The repository includes `yarn sync:vercel-env` as an explicit credential-rotation helper; it is not run on every application deployment.

Vercel Sensitive variables are deliberately non-retrievable: `vercel env pull` writes placeholders instead of their values. For local work, either place the original values in the gitignored `.env.local` and run `yarn dev:full`, or run `yarn dev:remote` to use the stable Preview API without copying server credentials to the laptop.

The `VITE_FIREBASE_*` values are browser-visible Firebase identifiers. Kumo currently has safe defaults for its existing Firebase project; add explicit values from `.env.example` in Vercel Project Settings if that project configuration changes.

For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the service-account private key with escaped newlines (`\\n`) or literal newlines. Never prefix an Admin variable with `VITE_`.

In Firebase Authentication, add these exact hostnames to **Authentication → Settings → Authorized domains**:

- Production: `kumo-ochre.vercel.app`
- Preview: `kumo-preview-zach-2267.vercel.app`
- Local development: `localhost`

On HTTPS deployments, Google redirect authentication is served through Kumo's own origin at `/__/auth/*` and transparently proxied to Firebase. This avoids the third-party-storage failure that otherwise returns a successfully authenticated user to the login page. HTTP localhost uses popup authentication instead because the Firebase hosted redirect helper only generates HTTPS URLs. In the Google OAuth web client used by the Firebase project, authorize these exact production redirect URIs:

- `https://kumo-ochre.vercel.app/__/auth/handler`
- `https://kumo-preview-zach-2267.vercel.app/__/auth/handler`

Vercel's generated deployment URL changes for each pull request deployment, so the preview job assigns the stable preview hostname above to the newest same-repository pull request preview. This lets Google sign-in work without authorizing every generated deployment hostname. The alias is shared across open pull requests and therefore always represents the most recently deployed preview.

## 3. Configure GitHub

Create GitHub environments named `preview` and `production`. Add these repository or environment secrets:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Access token created while signed in as `zachsm@alumni.stanford.edu` |
| `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

The workflow calls Vercel's current-user API before every deployment and fails unless the token email is `zachsm@alumni.stanford.edu`. Keep Vercel's automatic Git deployment disabled; `vercel.json` enforces this even though the project is linked to GitHub, making GitHub Actions the single deployment authority.

The `main` branch is protected for administrators and contributors. Changes must arrive through a pull request, the branch must be current, `Quality gates` and `Vercel preview` must pass, and review conversations must be resolved. Direct pushes, force pushes, and branch deletion are blocked.

## 4. Delivery flow

- Every pull request: config validation, lint, type-check, unit tests, build, and desktop/mobile Chromium smoke tests.
- Same-repository pull request after quality gates: Vercel Preview deployment, explicitly targeted to the `preview` environment and assigned to `kumo-preview-zach-2267.vercel.app`.
- Merge of a passing pull request to protected `main`: Vercel Production deployment.
- Fork pull requests never receive deployment secrets and therefore do not deploy previews.

The workflow follows Vercel's supported `vercel pull` → `vercel build` → `vercel deploy --prebuilt` sequence. Preview builds and deployments both specify `--target=preview`; the preview job then updates the stable alias used by Firebase Authentication.

Firebase Admin currently brings in `jwks-rsa`, whose default `jose` v6 dependency relies on native `require(esm)` behavior that Vercel's serverless loader does not provide. The package resolution pins that transitive edge to the dual CommonJS/ESM `jose` 5.10.0 build; keep it until Firebase Admin or `jwks-rsa` removes the incompatibility.

Supabase migrations and Liveblocks webhook configuration use a separate reviewed release step before the application cutover. This prevents an application deploy token from gaining database-administration privileges and keeps infrastructure changes auditable.

### Realtime Database and Storage rules

`database.rules.json` and `storage.rules` stay the source of truth and are published with the Firebase CLI, which no deployment step runs. The CLI is not installed as a dependency: it pulls in 230 transitive packages for a tool that is only invoked by hand, and one of them had an advisory whose only fix was a breaking major the CLI cannot load. Publish rules on demand instead, after `firebase login`:

```
yarn deploy:firebase-rules
```

That fetches a pinned Firebase CLI major through `npx` and runs `deploy --only database,storage` against the project in `.firebaserc`. `validate:config` fails if `firebase-tools` is ever added back to the manifest.

## 5. First cutover

1. Apply the reviewed Supabase migration.
2. Create the Liveblocks project, secret key, and storage webhook targeting `/api/liveblocks-webhook`.
3. Configure all Preview and Production Vercel variables.
4. Merge only after the quality and Vercel preview checks pass.
5. Exercise create/open/edit/undo, multi-user presence, sharing, public copy, and one legacy-board migration.
6. Retire Firebase Hosting after the production smoke test. Keep Firebase Auth and legacy RTDB reads active until migration is complete.

Useful references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel custom GitHub Actions workflow](https://vercel.com/docs/git/vercel-for-github), and [Vercel CLI deployment](https://vercel.com/docs/projects/deploy-from-cli).

## Firebase auth helpers and the application CSP

HTTPS sign-in uses same-origin Firebase helpers at `/__/auth/*`, transparently proxied to `https://kumo-7d8e1.firebaseapp.com/__/auth/*` before the SPA fallback. These are provider-owned HTML documents, not the Kumo client shell. Firebase initializes both the redirect handler and its hidden auth iframe with inline bootstrap scripts.

Apply Kumo's strict Content Security Policy to application routes **except** `/__/auth` and its descendants. Do not apply `script-src 'self'` or `frame-ancestors 'none'` to the helper pages: the former blocks Firebase's bootstrap and the latter blocks its hidden iframe. General security headers still apply to all routes, and the application policy has not gained `unsafe-inline` for scripts. Avoid hard-coding one bootstrap hash; Firebase owns the script bodies, including redirect POST data.

The application itself must also permit `https://apis.google.com` in **script-src**. On return from Google, the Firebase SDK loads `/js/api.js` and the GAPI iframe module from that origin before recovering the redirect result. Permitting the helper iframe or Google API fetches in `connect-src` does not permit these scripts. Blocking them leaves the user on the sign-in page even when the helper routes have no CSP. Keep this allowance specific to Google's script origin; no wildcard or `unsafe-inline` is needed.

`validate:config` verifies route boundaries and the retained strict application script policy. The browser regression serves the configured headers over HTTPS and verifies that app inline scripts are blocked while the redirect and embedded iframe bootstraps run. `verify:deployment` fetches the actual proxied helper documents on preview and production to detect an incorrect rewrite or inherited CSP.

The Google-return browser regression runs the production application and its real Firebase SDK under this CSP, clicks Google sign-in, supplies fixture provider responses, and verifies that the dashboard opens and survives reload. It covers dynamic GAPI loading and Firebase persistence; it does not replace a manual sign-in with a real Google account.

Vercel can return a conditional `304` without the configured CSP headers. A policy-only deployment previously left the HTML bytes and ETag unchanged, so returning browsers could continue enforcing the earlier policy. The production build now includes a `kumo-security-revision` meta tag derived from `vercel.json` headers. Changing those headers therefore changes the document and its ETag. The root authentication document and `/index.html` also use `Cache-Control: no-store`; versioned JavaScript and other assets retain their existing caching. Artifact verification and deployment smoke checks require the matching revision, and deployment checks require the document's no-store header. Check the ordinary production URL with a real Google sign-in and a reload; a fresh test context or successful script download alone cannot verify this upgrade path.

Reference: [Firebase redirect sign-in best practices, reverse-proxy option](https://firebase.google.com/docs/auth/web/redirect-best-practices#option-3-proxy-auth-requests-to-firebaseappcom).
