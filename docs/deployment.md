# Deployment

Kumo is deployed as a Vite SPA plus Vercel Functions. Firebase remains the authentication, realtime-data, and file-rules backend; Firebase Hosting is no longer used.

## 1. Create the Vercel project

1. Sign in to Vercel as `zachsm@alumni.stanford.edu`.
2. From this repository, run `yarn vercel login` and confirm that exact account.
3. Run `yarn vercel link` and create or select the Kumo project in that account's scope.
4. Keep Framework Preset `Vite`, Build Command `yarn build`, and Output Directory `dist`.
5. Copy `orgId` and `projectId` from the generated `.vercel/project.json`. The `.vercel` directory is intentionally ignored.

The SPA rewrite in `vercel.json` preserves deep links. Filesystem routes, including `/api/*` functions, take precedence over that rewrite.

## 2. Configure Vercel environments

The production workflow derives the four server-only `FIREBASE_ADMIN_*` variables from the existing GitHub service-account secret and synchronizes them to Vercel's Production, Preview, and Development environments before deployment. The values are sent through standard input and are never printed to the action log.

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
| `FIREBASE_SERVICE_ACCOUNT_KUMO_7D8E1` | Complete Firebase service-account JSON |

The workflow calls Vercel's current-user API before every deployment and fails unless the token email is `zachsm@alumni.stanford.edu`. Keep Vercel's automatic Git deployment disabled; `vercel.json` does this so GitHub Actions is the single deployment authority.

## 4. Delivery flow

- Every pull request: config validation, lint, type-check, unit tests, build, Chromium smoke test.
- Same-repository pull request after quality gates: Vercel Preview deployment.
- Push to `main` after quality gates: Vercel Production deployment and Firebase Database/Storage rules deployment.
- Fork pull requests never receive deployment secrets and therefore do not deploy previews.

The workflow follows Vercel's supported `vercel pull` → `vercel build` → `vercel deploy --prebuilt` sequence.

## 5. First cutover

1. Merge the workflow and repository configuration.
2. Confirm the production GitHub run passes and note the Vercel URL.
3. Exercise sign-in, create/open/save, sharing, and an old shared board on that URL.
4. Point the custom domain to the Vercel project, if applicable.
5. Retire the Firebase Hosting release only after the Vercel production smoke test passes. Firebase itself must remain active.

Useful references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel custom GitHub Actions workflow](https://vercel.com/docs/git/vercel-for-github), and [Vercel CLI deployment](https://vercel.com/docs/projects/deploy-from-cli).
