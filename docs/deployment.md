# Deployment

Kumo is deployed as a Vite SPA plus Vercel Functions. Firebase remains the authentication and realtime-data backend; Firebase Hosting is no longer used.

## 1. Create the Vercel project

1. Sign in to Vercel as `zachsm@alumni.stanford.edu`.
2. From this repository, run `yarn vercel login` and confirm that exact account.
3. Run `yarn vercel link` and create or select the Kumo project in that account's scope.
4. Keep Framework Preset `Vite`, Build Command `yarn build`, and Output Directory `dist`.
5. Copy `orgId` and `projectId` from the generated `.vercel/project.json`. The `.vercel` directory is intentionally ignored.
6. Connect the project to `https://github.com/Zachshotamartin/Kumo` for repository metadata. Keep Vercel Git deployments disabled; GitHub Actions owns preview and production releases.

The SPA rewrite in `vercel.json` preserves deep links. Filesystem routes, including `/api/*` functions, take precedence over that rewrite.

## 2. Configure Vercel environments

Store the four server-only `FIREBASE_ADMIN_*` variables directly in Vercel's Production and Preview environments. They are runtime configuration for authenticated Vercel Functions and are not part of the application-deployment credentials. The repository includes `yarn sync:vercel-env` as an explicit credential-rotation helper; it is not run on every application deployment.

The `VITE_FIREBASE_*` values are browser-visible Firebase identifiers. Kumo currently has safe defaults for its existing Firebase project; add explicit values from `.env.example` in Vercel Project Settings if that project configuration changes.

For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the service-account private key with escaped newlines (`\\n`) or literal newlines. Never prefix an Admin variable with `VITE_`.

In Firebase Authentication, add the production Vercel domain and any stable custom domain to Authorized domains. Preview-domain authentication may require an intentional preview-domain policy.

## 3. Configure GitHub

Create GitHub environments named `preview` and `production`. Add these repository or environment secrets:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Access token created while signed in as `zachsm@alumni.stanford.edu` |
| `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

The workflow calls Vercel's current-user API before every deployment and fails unless the token email is `zachsm@alumni.stanford.edu`. Keep Vercel's automatic Git deployment disabled; `vercel.json` enforces this even though the project is linked to GitHub, making GitHub Actions the single deployment authority.

## 4. Delivery flow

- Every pull request: config validation, lint, type-check, unit tests, build, Chromium smoke test.
- Same-repository pull request after quality gates: Vercel Preview deployment.
- Push to `main` after quality gates: Vercel Production deployment.
- Fork pull requests never receive deployment secrets and therefore do not deploy previews.

The workflow follows Vercel's supported `vercel pull` → `vercel build` → `vercel deploy --prebuilt` sequence.

Firebase schema, IAM, and rules changes use a separate reviewed database release process. This prevents an application deploy token from gaining database-administration privileges and allows the database architecture to evolve independently.

## 5. First cutover

1. Merge the workflow and repository configuration.
2. Confirm the production GitHub run passes and note the Vercel URL.
3. Exercise the public shell and authentication on that URL. Run create/open/save, sharing, and legacy-board checks after the database release is configured.
4. Point the custom domain to the Vercel project, if applicable.
5. Retire the Firebase Hosting release only after the Vercel production smoke test passes. Firebase itself must remain active.

Useful references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel custom GitHub Actions workflow](https://vercel.com/docs/git/vercel-for-github), and [Vercel CLI deployment](https://vercel.com/docs/projects/deploy-from-cli).
